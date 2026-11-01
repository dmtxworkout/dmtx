import { sql } from 'drizzle-orm';
import { activityDaily } from '@dmtx/db';
import type { Database } from '@dmtx/db';

/** Report days run midnight to midnight in Ecuador, which has no daylight saving. */
export const REPORT_TIME_ZONE = sql.raw(`'America/Guayaquil'`);

/**
 * Adds up what members did into activity_daily, and who did it into
 * activity_daily_users. It redoes the last day it has and everything since, so a
 * missed run heals itself and the first run covers all of history. Running it again
 * changes nothing but today's running count.
 */
export async function rollupActivity(db: Database) {
  const [last] = await db.select({ day: sql<string | null>`max(${activityDaily.day})` }).from(activityDaily);
  const from = last?.day ? sql`((${last.day}::date - 1)::timestamp at time zone ${REPORT_TIME_ZONE})` : sql`'-infinity'::timestamptz`;
  const facts = sql`
    with events as (
      select *, (created_at at time zone ${REPORT_TIME_ZONE})::date as day from activity_events where created_at >= ${from}
    ),
    facts as (
      select day, 'search' as metric, unaccent(query) as key, query as label, user_id from events
        where kind = 'search' and query is not null
      union all
      select day, 'search_empty', unaccent(query), query, user_id from events
        where kind = 'search' and query is not null and results = 0
      union all
      select day, 'filter', f, f, user_id from events, jsonb_array_elements_text(filters) f
        where kind = 'search'
      union all
      select day, kind::text, content_id::text, content_name, user_id from events
        where content_id is not null
      union all
      select (created_at at time zone ${REPORT_TIME_ZONE})::date, 'session', workout_id::text, workout_name, user_id from workout_logs
        where workout_id is not null and created_at >= ${from}
    )`;
  await db.execute(sql`
    ${facts}
    insert into activity_daily (day, metric, key, label, count)
    select day, metric, key, max(label), count(*)::int from facts group by day, metric, key
    on conflict (day, metric, key) do update set label = excluded.label, count = excluded.count, updated_at = now()`);
  await db.execute(sql`
    ${facts}
    insert into activity_daily_users (day, metric, key, user_id)
    select distinct day, metric, key, user_id from facts
    on conflict do nothing`);
}
