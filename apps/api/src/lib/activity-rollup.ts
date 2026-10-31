import { sql } from 'drizzle-orm';
import { activityDaily } from '@dmtx/db';
import type { Database } from '@dmtx/db';

/**
 * Adds up what members did into activity_daily. It redoes the last day it has and
 * everything since, so a missed run heals itself and the first run covers all of
 * history. Running it again changes nothing but today's running count.
 */
export async function rollupActivity(db: Database) {
  const [last] = await db.select({ day: sql<string | null>`max(${activityDaily.day})` }).from(activityDaily);
  const from = last?.day ? sql`(${last.day}::date - 1)::timestamptz` : sql`'-infinity'::timestamptz`;
  await db.execute(sql`
    with events as (
      select *, (created_at at time zone 'UTC')::date as day from activity_events where created_at >= ${from}
    )
    insert into activity_daily (day, metric, key, label, count)
    select day, 'search', unaccent(query), min(query), count(*)::int from events
      where kind = 'search' and query is not null group by day, unaccent(query)
    union all
    select day, 'search_empty', unaccent(query), min(query), count(*)::int from events
      where kind = 'search' and query is not null and results = 0 group by day, unaccent(query)
    union all
    select day, 'filter', f, f, count(*)::int from events, jsonb_array_elements_text(filters) f
      where kind = 'search' group by day, f
    union all
    select day, kind::text, content_id::text, max(content_name), count(*)::int from events
      where content_id is not null group by day, kind, content_id
    union all
    select (created_at at time zone 'UTC')::date, 'session', workout_id::text, max(workout_name), count(*)::int from workout_logs
      where workout_id is not null and created_at >= ${from} group by 1, workout_id
    on conflict (day, metric, key) do update set label = excluded.label, count = excluded.count, updated_at = now()`);
}
