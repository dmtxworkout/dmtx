import { sql } from 'drizzle-orm';
import { activityDaily } from '@dmtx/db';
import { createApp } from '../lib/openapi';
import { rollupActivity } from '../lib/activity-rollup';
import { requireAdmin } from '../middleware/auth';

const TOP = 20;

export const reportsRoute = createApp();
reportsRoute.use('*', requireAdmin);

type Row = { metric: string; key: string; label: string; total: number };

/** GET /api/reports/activity?days=7|30|90 — what everyone searches, opens and trains, from the daily summary. */
reportsRoute.get('/activity', async (c) => {
  const db = c.get('db');
  const days = [7, 30, 90].includes(Number(c.req.query('days'))) ? Number(c.req.query('days')) : 30;
  const [{ rows }, [fresh]] = await Promise.all([
    db.execute<Row>(sql`
      select metric, key, label, total from (
        select metric, key, (array_agg(label order by day desc))[1] as label, sum(count)::int as total,
               row_number() over (partition by metric order by sum(count) desc, key) as rank
        from activity_daily
        where day > (now() at time zone 'UTC')::date - ${days}::int
        group by metric, key
      ) ranked
      where rank <= ${TOP}
      order by metric, total desc`),
    db.select({ at: sql<string | null>`max(${activityDaily.updatedAt})` }).from(activityDaily),
  ]);
  const of = (...metrics: string[]) => rows.filter((r) => metrics.includes(r.metric));
  const item = (r: Row) => ({ key: r.key, label: r.label, total: r.total });
  return c.json({
    days,
    updatedAt: fresh?.at ? new Date(fresh.at).toISOString() : null,
    searches: of('search').map(item),
    emptySearches: of('search_empty').map(item),
    filters: of('filter').map(item),
    opened: of('view_workout', 'view_program', 'view_skill')
      .map((r) => ({ ...item(r), type: r.metric === 'view_program' ? ('program' as const) : r.metric === 'view_skill' ? ('skill' as const) : ('workout' as const) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, TOP),
    trained: of('session').map(item),
  });
});

/** POST /api/reports/activity/refresh — adds up the latest now instead of waiting for tonight. */
reportsRoute.post('/activity/refresh', async (c) => {
  await rollupActivity(c.get('db'));
  return c.json({ ok: true });
});
