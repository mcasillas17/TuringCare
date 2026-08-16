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
    else 'navigation'
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
      funnel,
      journeyTimes,
      featureAdoption,
      topPages,
      activityByDay,
      returning,
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
        .execute<{ step: string; users: number }>(sql`
          with cohort as (
            select id, created_at from "user" where role = 'user' and created_at >= ${since}
          ), firsts as (
            select c.id,
              min(e.created_at) filter (where e.name = 'dog.created') as dog_at,
              min(e.created_at) filter (where e.name = 'journal.entry_created') as journal_at,
              min(e.created_at) filter (where e.name = 'training.goal_added') as goal_at,
              min(e.created_at) filter (where e.name = 'training.practice_logged') as practice_at,
              min(e.created_at) filter (where e.name = 'brief.finalized') as brief_at,
              min(e.created_at) filter (where e.name in ('brief.shared', 'brief.emailed')) as shared_at
            from cohort c left join events e on e.user_id = c.id and e.created_at >= c.created_at
            group by c.id
          )
          select step, users::int from (
            select 1 as position, 'signup' as step, count(*) as users from cohort
            union all select 2, 'first_dog', count(*) filter (where dog_at is not null) from firsts
            union all select 3, 'first_journal',
              count(*) filter (where journal_at >= dog_at) from firsts
            union all select 4, 'first_goal',
              count(*) filter (where goal_at >= dog_at) from firsts
            union all select 5, 'first_practice',
              count(*) filter (where practice_at >= goal_at and goal_at >= dog_at) from firsts
            union all select 6, 'brief_finalized',
              count(*) filter (where brief_at >= journal_at and brief_at >= practice_at) from firsts
            union all select 7, 'brief_shared',
              count(*) filter (where shared_at >= brief_at and brief_at >= journal_at
                and brief_at >= practice_at) from firsts
          ) steps order by position
        `)
        .then((r) => r.rows),
      db
        .execute<{
          step: string;
          completed: number;
          medianMinutes: number | null;
          p90Minutes: number | null;
          within7DaysPct: number;
        }>(sql`
          with cohort as (
            select id, created_at from "user" where role = 'user' and created_at >= ${since}
          ), firsts as (
            select c.id, c.created_at as signup_at,
              min(e.created_at) filter (where e.name = 'dog.created') as dog_at,
              min(e.created_at) filter (where e.name = 'journal.entry_created') as journal_at,
              min(e.created_at) filter (where e.name = 'training.goal_added') as goal_at,
              min(e.created_at) filter (where e.name = 'training.practice_logged') as practice_at,
              min(e.created_at) filter (where e.name = 'brief.finalized') as brief_at,
              min(e.created_at) filter (where e.name in ('brief.shared', 'brief.emailed')) as shared_at
            from cohort c left join events e on e.user_id = c.id and e.created_at >= c.created_at
            group by c.id, c.created_at
          ), durations as (
            select step, extract(epoch from (finished_at - started_at)) / 60.0 as minutes
            from firsts cross join lateral (values
              ('signup_to_dog', signup_at, dog_at),
              ('dog_to_journal', dog_at, journal_at),
              ('goal_to_practice', goal_at, practice_at),
              ('signup_to_brief', signup_at, brief_at),
              ('full_path_to_share', signup_at,
                case when dog_at <= journal_at and dog_at <= goal_at and goal_at <= practice_at
                  and journal_at <= brief_at and practice_at <= brief_at and brief_at <= shared_at
                  then shared_at end)
            ) transition(step, started_at, finished_at)
            where finished_at is not null and finished_at >= started_at
          )
          select step, count(*)::int as completed,
            round(percentile_cont(0.5) within group (order by minutes))::int as "medianMinutes",
            round(percentile_cont(0.9) within group (order by minutes))::int as "p90Minutes",
            round(100.0 * count(*) filter (where minutes <= 10080) / count(*))::int
              as "within7DaysPct"
          from durations group by step order by min(minutes)
        `)
        .then((r) => r.rows),
      db
        .execute<{ feature: string; users: number; events: number }>(sql`
          select ${categorySql} as feature, count(distinct e.user_id)::int as users,
                 count(*)::int as events
          from events e left join "user" u on u.id = e.user_id
          where e.created_at >= ${since} and (u.role = 'user' or e.user_id is null)
            and e.name <> 'page.viewed'
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
          group by 1, 2 order by 1
        `)
        .then((r) => r.rows),
      db
        .execute<{ activeUsers: number; returningUsers: number }>(sql`
          with activity as (
            select e.user_id, count(distinct date_trunc('day', e.created_at)) as active_days
            from events e inner join "user" u on u.id = e.user_id
            where u.role = 'user' and e.created_at >= ${since}
              and e.name <> 'user.signed_in'
            group by e.user_id
          )
          select count(*)::int as "activeUsers",
                 count(*) filter (where active_days >= 2)::int as "returningUsers"
          from activity
        `)
        .then((r) => scalarRow(r.rows)),
    ]);

    const cohortUsers = funnel[0]?.users ?? 0;
    const activatedUsers = funnel.find((step) => step.step === "first_practice")?.users ?? 0;
    const eventCount = featureAdoption.reduce((sum, row) => sum + row.events, 0);
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
        stickiness: mau === 0 ? 0 : Math.round((dau / mau) * 100) / 100,
        eventCount,
        activationRate:
          cohortUsers === 0 ? 0 : Math.round((activatedUsers / cohortUsers) * 100) / 100,
        returningRate,
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
