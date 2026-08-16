import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { type AdminVars, requireAdmin } from "../middleware/require-admin";

function rangeDays(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 365 ? Math.floor(n) : 30;
}

function scalarRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected at least one row");
  return row;
}

const categorySql = sql`
  case
    when e.name like 'training.%' or e.name like 'focus.%' then 'training'
    when e.name like 'journal.%' then 'journal'
    when e.name like 'brief.%' or e.name = 'share.brief_viewed' then 'briefs'
    when e.name like 'dog.%' or e.name like 'concern.%' then 'dog_care'
    when e.name like 'directory.%' or e.name in ('trainer.viewed', 'course.viewed') then 'discovery'
    when e.name like 'user.%' or e.name = 'profile.updated' then 'account'
    when e.name like 'safety.%' then 'training'
    else 'other'
  end
`;

export const adminApp = new Hono<{ Variables: AdminVars }>()
  .use("*", requireAdmin)
  .get("/metrics", async (c) => {
    const days = rangeDays(c.req.query("days"));
    const since = sql`now() - (${days} || ' days')::interval`;

    const [
      totalUsers,
      newUsers,
      dau,
      wau,
      mau,
      signups,
      active,
      lifecycle,
      featureAdoption,
      topPages,
      activityByDay,
      returning,
      churnedUsers,
    ] = await Promise.all([
      db
        .execute<{ totalUsers: number }>(
          sql`select count(*)::int as "totalUsers" from "user" where role = 'user'`,
        )
        .then((r) => scalarRow(r.rows).totalUsers),
      db
        .execute<{ newUsers: number }>(
          sql`select count(*)::int as "newUsers" from "user"
              where role = 'user' and created_at >= ${since}`,
        )
        .then((r) => scalarRow(r.rows).newUsers),
      db
        .execute<{ value: number }>(
          sql`select count(distinct e.user_id)::int as value
              from events e inner join "user" u on u.id = e.user_id
              where u.role = 'user' and e.created_at >= now() - interval '1 day'`,
        )
        .then((r) => scalarRow(r.rows).value),
      db
        .execute<{ value: number }>(
          sql`select count(distinct e.user_id)::int as value
              from events e inner join "user" u on u.id = e.user_id
              where u.role = 'user' and e.created_at >= now() - interval '7 days'`,
        )
        .then((r) => scalarRow(r.rows).value),
      db
        .execute<{ value: number }>(
          sql`select count(distinct e.user_id)::int as value
              from events e inner join "user" u on u.id = e.user_id
              where u.role = 'user' and e.created_at >= now() - interval '30 days'`,
        )
        .then((r) => scalarRow(r.rows).value),
      db
        .execute<{ day: string; count: number }>(
          sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
                     count(*)::int as count
              from "user" where role = 'user' and created_at >= ${since}
              group by 1 order by 1`,
        )
        .then((r) => r.rows),
      db
        .execute<{ day: string; count: number }>(
          sql`select to_char(date_trunc('day', e.created_at), 'YYYY-MM-DD') as day,
                     count(distinct e.user_id)::int as count
              from events e inner join "user" u on u.id = e.user_id
              where u.role = 'user' and e.created_at >= ${since}
              group by 1 order by 1`,
        )
        .then((r) => r.rows),
      db
        .execute<{
          kind: "funnel" | "journey";
          step: string;
          position: number;
          users: number | null;
          completed: number;
          medianMinutes: number | null;
          p90Minutes: number | null;
          within7DaysPct: number | null;
        }>(sql`
          with cohort as (
            select id, created_at from "user" where role = 'user' and created_at >= ${since}
          ), stages as (
            select c.id, c.created_at as signup_at, dog.dog_at, journal.journal_at,
                   goal.goal_at, practice.practice_at, brief.brief_at, shared.shared_at
            from cohort c
            left join lateral (
              select min(created_at) as dog_at from events
              where user_id = c.id and name = 'dog.created' and created_at >= c.created_at
            ) dog on true
            left join lateral (
              select min(created_at) as journal_at from events
              where user_id = c.id and name = 'journal.entry_created'
                and props->>'kind' = 'moment'
                and created_at >= dog.dog_at
            ) journal on true
            left join lateral (
              select min(created_at) as goal_at from events
              where user_id = c.id and name = 'training.goal_added'
                and created_at >= journal.journal_at
            ) goal on true
            left join lateral (
              select min(created_at) as practice_at from events
              where user_id = c.id and name = 'training.practice_logged'
                and created_at >= goal.goal_at
            ) practice on true
            left join lateral (
              select min(created_at) as brief_at from events
              where user_id = c.id and name = 'brief.finalized'
                and created_at >= practice.practice_at
            ) brief on true
            left join lateral (
              select min(created_at) as shared_at from (
                select min(created_at) as created_at from events
                  where user_id = c.id and name = 'brief.shared'
                    and created_at >= brief.brief_at
                union all
                select min(created_at) from events
                  where user_id = c.id and name = 'brief.emailed'
                    and created_at >= brief.brief_at
                union all
                select min(created_at) from events
                  where user_id = c.id and name = 'brief.downloaded'
                    and props->>'surface' = 'owner'
                    and created_at >= brief.brief_at
              ) terminal_events
            ) shared on true
          ), funnel_rows as (
            select 1 as position, 'signup' as step, count(*)::int as users from cohort
            union all select 2, 'first_dog', count(*) filter (where dog_at is not null)::int
              from stages
            union all select 3, 'first_journal', count(*) filter (where journal_at is not null)::int
              from stages
            union all select 4, 'first_goal', count(*) filter (where goal_at is not null)::int
              from stages
            union all select 5, 'first_practice',
              count(*) filter (where practice_at is not null)::int from stages
            union all select 6, 'brief_finalized',
              count(*) filter (where brief_at is not null)::int from stages
            union all select 7, 'brief_shared',
              count(*) filter (where shared_at is not null)::int from stages
          ), journey_observations as (
            select step, started_at, finished_at,
                   extract(epoch from (finished_at - started_at)) / 60.0 as minutes
            from stages cross join lateral (values
              ('signup_to_dog', signup_at, dog_at),
              ('dog_to_journal', dog_at, journal_at),
              ('goal_to_practice', goal_at, practice_at),
              ('signup_to_practice', signup_at, practice_at),
              ('signup_to_brief', signup_at, brief_at),
              ('full_path_to_share', signup_at, shared_at)
            ) transition(step, started_at, finished_at)
            where started_at is not null
          ), timing_rows as (
            select step, count(*) filter (
                where finished_at is not null and started_at <= now() - interval '7 days'
              )::int as completed,
              round(percentile_cont(0.5) within group (order by minutes)
                filter (where finished_at is not null
                  and started_at <= now() - interval '7 days'))::int
                as "medianMinutes",
              round(percentile_cont(0.9) within group (order by minutes)
                filter (where finished_at is not null
                  and started_at <= now() - interval '7 days'))::int as "p90Minutes",
              round(100.0 * count(*) filter (
                where finished_at <= started_at + interval '7 days'
                  and started_at <= now() - interval '7 days'
              ) / nullif(count(*) filter (
                where started_at <= now() - interval '7 days'
              ), 0))::int
                as "within7DaysPct"
            from journey_observations group by step
          )
          select 'funnel' as kind, step, position, users, null::int as completed,
                 null::int as "medianMinutes", null::int as "p90Minutes",
                 null::int as "within7DaysPct"
          from funnel_rows
          union all
          select 'journey', step,
                 case step when 'signup_to_dog' then 1 when 'dog_to_journal' then 2
                   when 'goal_to_practice' then 3 when 'signup_to_practice' then 4
                   when 'signup_to_brief' then 5 else 6 end,
                 null, completed, "medianMinutes", "p90Minutes", "within7DaysPct"
          from timing_rows
          order by kind, position
        `)
        .then((r) => r.rows),
      db
        .execute<{ feature: string; users: number; events: number }>(sql`
          select ${categorySql} as feature, count(distinct e.user_id)::int as users,
                 count(*)::int as events
          from events e left join "user" u on u.id = e.user_id
          where e.created_at >= ${since} and (u.role = 'user' or e.user_id is null)
            and e.name not in ('page.viewed', 'user.signed_in', 'user.signed_up', 'user.deleted')
          group by 1 order by users desc, events desc
        `)
        .then((r) => r.rows),
      db
        .execute<{ path: string; views: number; users: number }>(sql`
          select normalized.path, count(*)::int as views,
                 count(distinct e.user_id)::int as users
          from events e
          cross join lateral (
            select case
              when e.props->>'path' ~ '^/b/' then '/b/:token'
              else regexp_replace(coalesce(e.props->>'path', '(unknown)'),
                '/[0-9a-f]{8}-[0-9a-f-]{27,}', '/:id', 'gi')
            end as path
          ) normalized
          left join "user" u on u.id = e.user_id
          where e.name = 'page.viewed' and e.created_at >= ${since}
            and (u.role = 'user' or e.user_id is null)
            and normalized.path not like '/admin%'
          group by 1 order by views desc limit 10
        `)
        .then((r) => r.rows),
      db
        .execute<{ day: string; category: string; count: number }>(sql`
          select to_char(date_trunc('day', e.created_at), 'YYYY-MM-DD') as day,
                 ${categorySql} as category, count(*)::int as count
          from events e left join "user" u on u.id = e.user_id
          where e.created_at >= ${since} and (u.role = 'user' or e.user_id is null)
            and e.name not in ('page.viewed', 'user.signed_in', 'user.signed_up', 'user.deleted')
          group by 1, 2 order by 1
        `)
        .then((r) => r.rows),
      db
        .execute<{ activeUsers: number; returningUsers: number }>(sql`
          with activity as (
            select e.user_id, count(distinct date_trunc('day', e.created_at)) as active_days
            from events e inner join "user" u on u.id = e.user_id
            where u.role = 'user' and e.created_at >= ${since}
              and e.name not in ('user.signed_in', 'page.viewed')
            group by e.user_id
          )
          select count(*)::int as "activeUsers",
                 count(*) filter (where active_days >= 2)::int as "returningUsers"
          from activity
        `)
        .then((r) => scalarRow(r.rows)),
      db
        .execute<{ value: number }>(
          sql`select count(*)::int as value from events
              where name = 'user.deleted'
                and (props->>'role' = 'user' or props->>'role' is null)
                and created_at >= ${since}`,
        )
        .then((r) => scalarRow(r.rows).value),
    ]);

    const funnel = lifecycle
      .filter((row) => row.kind === "funnel")
      .map((row) => ({ step: row.step, users: row.users ?? 0 }));
    const journeyTimes = lifecycle
      .filter((row) => row.kind === "journey")
      .map((row) => ({
        step: row.step,
        completed: row.completed,
        medianMinutes: row.medianMinutes,
        p90Minutes: row.p90Minutes,
        within7DaysPct: row.within7DaysPct,
      }));
    const activationRate =
      journeyTimes.find((journey) => journey.step === "signup_to_practice")?.within7DaysPct ?? null;
    const returningRate =
      returning.activeUsers === 0
        ? 0
        : Math.round((returning.returningUsers / returning.activeUsers) * 100) / 100;

    return c.json({
      rangeDays: days,
      kpis: {
        totalUsers,
        newUsers,
        dau,
        wau,
        mau,
        activationRate: activationRate === null ? null : activationRate / 100,
        returningRate,
        churnedUsers,
      },
      signups,
      active,
      funnel,
      journeyTimes,
      featureAdoption,
      topPages,
      activityByDay,
    } as const);
  });
