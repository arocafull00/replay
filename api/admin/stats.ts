import { handle, requireAdmin } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';

export const GET = handle(async request => {
  await requireAdmin(request);
  const [[totals], days] = await Promise.all([
    sql`select count(*) filter (where type = 'clip')::int as clips, count(*) filter (where type = 'session')::int as sessions, count(*) filter (where type = 'open')::int as opens, count(distinct user_id) filter (where created_at > now() - interval '7 days')::int as active from events`,
    sql`select to_char(day, 'YYYY-MM-DD') as day, count(e.id) filter (where e.type = 'clip')::int as clips, count(e.id) filter (where e.type = 'session')::int as sessions, count(e.id) filter (where e.type = 'open')::int as opens
      from generate_series((now() at time zone 'Europe/Madrid')::date - 29, (now() at time zone 'Europe/Madrid')::date, interval '1 day') as day
      left join events e on (e.created_at at time zone 'Europe/Madrid')::date = day
      group by day order by day`,
  ]);
  return Response.json({ totals, days });
});
