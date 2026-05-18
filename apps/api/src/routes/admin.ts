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

    const { rows: totalUsersRows } = await db.execute<{ totalUsers: number }>(
      sql`select count(*)::int as "totalUsers" from "user"`,
    );
    const totalUsers = scalarRow(totalUsersRows).totalUsers;
    const { rows: newUsersRows } = await db.execute<{ newUsers: number }>(
      sql`select count(*)::int as "newUsers" from "user" where created_at >= ${since}`,
    );
    const newUsers = scalarRow(newUsersRows).newUsers;
    const { rows: dauRows } = await db.execute<{ dau: number }>(
      sql`select count(distinct user_id)::int as dau from events
          where user_id is not null and created_at >= now() - interval '1 day'`,
    );
    const dau = scalarRow(dauRows).dau;
    const { rows: wauRows } = await db.execute<{ wau: number }>(
      sql`select count(distinct user_id)::int as wau from events
          where user_id is not null and created_at >= now() - interval '7 days'`,
    );
    const wau = scalarRow(wauRows).wau;
    const { rows: mauRows } = await db.execute<{ mau: number }>(
      sql`select count(distinct user_id)::int as mau from events
          where user_id is not null and created_at >= now() - interval '30 days'`,
    );
    const mau = scalarRow(mauRows).mau;
    const { rows: eventCountRows } = await db.execute<{ eventCount: number }>(
      sql`select count(*)::int as "eventCount" from events where created_at >= ${since}`,
    );
    const eventCount = scalarRow(eventCountRows).eventCount;

    const { rows: signups } = await db.execute<{ day: string; count: number }>(
      sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
                 count(*)::int as count
          from "user" where created_at >= ${since}
          group by 1 order by 1`,
    );
    const { rows: active } = await db.execute<{ day: string; count: number }>(
      sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
                 count(distinct user_id)::int as count
          from events where user_id is not null and created_at >= ${since}
          group by 1 order by 1`,
    );
    const { rows: eventVolume } = await db.execute<{ name: string; count: number }>(
      sql`select name, count(*)::int as count
          from events where created_at >= ${since}
          group by 1 order by 2 desc`,
    );

    const funnelRow = async (eventName: string) => {
      const { rows } = await db.execute<{ n: number }>(
        sql`select count(distinct user_id)::int as n from events
            where user_id is not null and name = ${eventName}`,
      );
      return scalarRow(rows).n;
    };
    const funnel = [
      { step: "signup", users: totalUsers },
      { step: "first_dog", users: await funnelRow("dog.created") },
      { step: "first_journal", users: await funnelRow("journal.entry_created") },
      { step: "first_brief", users: await funnelRow("brief.generated") },
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
    } as const);
  })
  .get("/activity", async (c) => {
    const { rows: items } = await db.execute<{
      id: string;
      name: string;
      userId: string | null;
      createdAt: string;
      props: unknown;
    }>(
      sql`select id, name, user_id as "userId",
                 to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as "createdAt",
                 props
          from events order by created_at desc limit 100`,
    );
    return c.json({ items } as const);
  });
