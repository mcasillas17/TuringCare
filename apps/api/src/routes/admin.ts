import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { type AdminVars, requireAdmin } from "../middleware/require-admin";

function rangeDays(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 365 ? Math.floor(n) : 30;
}

// node-postgres aggregate queries always return exactly one row; this narrows
// `rows[0]` past `noUncheckedIndexedAccess` while failing loudly if not.
function scalarRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected at least one row");
  return row;
}

export const adminApp = new Hono<{ Variables: AdminVars }>()
  .use("*", requireAdmin)
  .get("/metrics", async (c) => {
    const days = rangeDays(c.req.query("days"));
    const since = sql`now() - (${days} || ' days')::interval`;

    const funnelRow = async (eventName: string) => {
      const { rows } = await db.execute<{ n: number }>(
        sql`select count(distinct user_id)::int as n from events
            where user_id is not null and name = ${eventName}`,
      );
      return scalarRow(rows).n;
    };

    // All of these queries are independent, so run them concurrently.
    const [
      totalUsers,
      newUsers,
      dau,
      wau,
      mau,
      eventCount,
      signups,
      active,
      eventVolume,
      firstDog,
      firstJournal,
      firstBrief,
      topPages,
      eventsByDay,
    ] = await Promise.all([
      db
        .execute<{ totalUsers: number }>(sql`select count(*)::int as "totalUsers" from "user"`)
        .then((r) => scalarRow(r.rows).totalUsers),
      db
        .execute<{ newUsers: number }>(
          sql`select count(*)::int as "newUsers" from "user" where created_at >= ${since}`,
        )
        .then((r) => scalarRow(r.rows).newUsers),
      db
        .execute<{ dau: number }>(
          sql`select count(distinct user_id)::int as dau from events
              where user_id is not null and created_at >= now() - interval '1 day'`,
        )
        .then((r) => scalarRow(r.rows).dau),
      db
        .execute<{ wau: number }>(
          sql`select count(distinct user_id)::int as wau from events
              where user_id is not null and created_at >= now() - interval '7 days'`,
        )
        .then((r) => scalarRow(r.rows).wau),
      db
        .execute<{ mau: number }>(
          sql`select count(distinct user_id)::int as mau from events
              where user_id is not null and created_at >= now() - interval '30 days'`,
        )
        .then((r) => scalarRow(r.rows).mau),
      db
        .execute<{ eventCount: number }>(
          sql`select count(*)::int as "eventCount" from events where created_at >= ${since}`,
        )
        .then((r) => scalarRow(r.rows).eventCount),
      db
        .execute<{ day: string; count: number }>(
          sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
                     count(*)::int as count
              from "user" where created_at >= ${since}
              group by 1 order by 1`,
        )
        .then((r) => r.rows),
      db
        .execute<{ day: string; count: number }>(
          sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
                     count(distinct user_id)::int as count
              from events where user_id is not null and created_at >= ${since}
              group by 1 order by 1`,
        )
        .then((r) => r.rows),
      db
        .execute<{ name: string; count: number }>(
          sql`select name, count(*)::int as count
              from events where created_at >= ${since}
              group by 1 order by 2 desc`,
        )
        .then((r) => r.rows),
      funnelRow("dog.created"),
      funnelRow("journal.entry_created"),
      funnelRow("brief.generated"),
      db
        .execute<{ path: string; count: number }>(
          sql`select case
                       when coalesce(props->>'path', '') ~* '^/(b|%62|%42)/[^/?#]+/*([?#].*)?$'
                         then '/b/:token'
                       else coalesce(props->>'path', '(unknown)')
                     end as path,
                     count(*)::int as count
              from events
              where name = 'page.viewed' and created_at >= ${since}
              group by 1 order by 2 desc limit 10`,
        )
        .then((r) => r.rows),
      db
        .execute<{ day: string; name: string; count: number }>(
          sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
                     name, count(*)::int as count
              from events where created_at >= ${since}
              group by 1, 2 order by 1`,
        )
        .then((r) => r.rows),
    ]);

    const funnel = [
      { step: "signup", users: totalUsers },
      { step: "first_dog", users: firstDog },
      { step: "first_journal", users: firstJournal },
      { step: "first_brief", users: firstBrief },
    ];

    const mauSafe = mau || 1;
    return c.json({
      rangeDays: days,
      kpis: {
        totalUsers,
        newUsers,
        dau,
        wau,
        mau,
        stickiness: Math.round((dau / mauSafe) * 100) / 100,
        eventCount,
      },
      signups,
      active,
      eventVolume,
      funnel,
      topPages,
      eventsByDay,
    } as const);
  });
