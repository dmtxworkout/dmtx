import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { subscriptions, user } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import { LIVE_SUBSCRIPTION_STATUS } from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { resolveEntitlement } from '../lib/entitlement';
import { requireAdmin } from '../middleware/auth';

const DAY_MS = 86_400_000;
const LIVE = [...LIVE_SUBSCRIPTION_STATUS];
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The compact subscription "card" shape shared by the list + detail. */
const subCard = (s: {
  status: string;
  unitAmount: number;
  currency: string;
  intervalUnit: string;
  intervalCount: number;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  nextChargeDate: string | null;
  startedAt: Date | null;
}) => ({
  status: s.status,
  comp: s.unitAmount === 0,
  unitAmount: s.unitAmount,
  currency: s.currency,
  intervalUnit: s.intervalUnit,
  intervalCount: s.intervalCount,
  trialEnd: iso(s.trialEnd),
  currentPeriodEnd: iso(s.currentPeriodEnd),
  nextChargeDate: s.nextChargeDate ?? null,
  startedAt: iso(s.startedAt),
});

/** End the user's current live episode (keeps the row as history). */
async function terminateLive(db: Database, userId: string, status: 'expired' | 'canceled', now: Date) {
  await db
    .update(subscriptions)
    .set({
      status,
      endedAt: now,
      ...(status === 'canceled' ? { canceledAt: now, cancelAtPeriodEnd: true } : {}),
    })
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, LIVE)));
}

export const subscriptionsRoute = createApp();
subscriptionsRoute.use('*', requireAdmin);

/** GET /api/subscriptions/users?search= — members + their access status. */
subscriptionsRoute.get('/users', async (c) => {
  const db = c.get('db');
  const search = c.req.query('search')?.trim();
  const where = search
    ? or(ilike(user.email, `%${search}%`), ilike(user.name, `%${search}%`))
    : undefined;
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      status: subscriptions.status,
      unitAmount: subscriptions.unitAmount,
      currency: subscriptions.currency,
      intervalUnit: subscriptions.intervalUnit,
      intervalCount: subscriptions.intervalCount,
      trialEnd: subscriptions.trialEnd,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      nextChargeDate: subscriptions.nextChargeDate,
      startedAt: subscriptions.startedAt,
    })
    .from(user)
    // Only the live episode (≤1 per user); history lives in the detail view.
    .leftJoin(
      subscriptions,
      and(eq(subscriptions.userId, user.id), inArray(subscriptions.status, LIVE)),
    )
    .where(where)
    .orderBy(desc(user.createdAt))
    .limit(100);
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      createdAt: r.createdAt.toISOString(),
      subscription:
        r.status && r.unitAmount !== null
          ? subCard({
              status: r.status,
              unitAmount: r.unitAmount,
              currency: r.currency!,
              intervalUnit: r.intervalUnit!,
              intervalCount: r.intervalCount!,
              trialEnd: r.trialEnd,
              currentPeriodEnd: r.currentPeriodEnd,
              nextChargeDate: r.nextChargeDate,
              startedAt: r.startedAt,
            })
          : null,
    })),
  });
});

/** GET /api/subscriptions/users/:id — one member, their live access + history. */
subscriptionsRoute.get('/users/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const [u] = await db
    .select({ id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  if (!u) return c.json({ error: 'Usuario no encontrado' }, 404);

  const subs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, id))
    .orderBy(desc(subscriptions.startedAt), desc(subscriptions.createdAt));
  const live = subs.find((s) => (LIVE as string[]).includes(s.status)) ?? null;

  return c.json({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    subscription: live ? subCard(live) : null,
    history: subs.map((s) => ({
      status: s.status,
      comp: s.unitAmount === 0,
      unitAmount: s.unitAmount,
      currency: s.currency,
      trialEnd: iso(s.trialEnd),
      currentPeriodStart: iso(s.currentPeriodStart),
      currentPeriodEnd: iso(s.currentPeriodEnd),
      startedAt: iso(s.startedAt),
      endedAt: iso(s.endedAt),
      canceledAt: iso(s.canceledAt),
    })),
  });
});

/** PATCH /api/subscriptions/users/:id — edit a member's name / email. */
subscriptionsRoute.patch('/users/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = (await c.req.json<{ name?: string; email?: string }>().catch(() => ({}))) as {
    name?: string;
    email?: string;
  };
  const set: Partial<typeof user.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === 'string' && body.name.trim()) set.name = body.name.trim();
  if (typeof body.email === 'string' && body.email.trim()) set.email = body.email.trim().toLowerCase();
  try {
    const [updated] = await db.update(user).set(set).where(eq(user.id, id)).returning({ id: user.id });
    if (!updated) return c.json({ error: 'Usuario no encontrado' }, 404);
  } catch {
    return c.json({ error: 'Ese correo ya está en uso' }, 409);
  }
  return c.json({ ok: true });
});

/**
 * POST /api/subscriptions/:userId/grant — comp a user free access.
 * Body: { days?: number|null, until?: string|null }. `until` (ISO date) wins;
 * otherwise `days`; both omitted = indefinite.
 */
subscriptionsRoute.post('/:userId/grant', async (c) => {
  const db = c.get('db');
  const userId = c.req.param('userId');
  const body = (await c.req.json<{ days?: number | null; until?: string | null }>().catch(() => ({}))) as {
    days?: number | null;
    until?: string | null;
  };
  const days = typeof body.days === 'number' && body.days > 0 ? Math.floor(body.days) : null;

  const [exists] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (!exists) return c.json({ error: 'Usuario no encontrado' }, 404);

  const now = new Date();
  let end: Date | null = null;
  if (body.until) {
    const d = new Date(body.until);
    if (!Number.isNaN(d.getTime())) end = d;
  } else if (days) {
    end = new Date(now.getTime() + days * DAY_MS);
  }
  // End the current episode, then start a fresh comp episode (keeps history).
  await terminateLive(db, userId, 'expired', now);
  await db.insert(subscriptions).values({
    userId,
    stripeCustomerId: '',
    unitAmount: 0,
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: end,
    startedAt: now,
  });

  return c.json({ ok: true, entitlement: await resolveEntitlement(db, c.env, userId) });
});

/**
 * POST /api/subscriptions/:userId/trial — (re)start a free trial of `days` days.
 * Body: { days: number } (defaults to 7).
 */
subscriptionsRoute.post('/:userId/trial', async (c) => {
  const db = c.get('db');
  const userId = c.req.param('userId');
  const body = (await c.req.json<{ days?: number }>().catch(() => ({}))) as { days?: number };
  const days = typeof body.days === 'number' && body.days > 0 ? Math.floor(body.days) : 7;

  const [exists] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (!exists) return c.json({ error: 'Usuario no encontrado' }, 404);

  const now = new Date();
  const trialEnd = new Date(now.getTime() + days * DAY_MS);
  await terminateLive(db, userId, 'expired', now);
  await db
    .insert(subscriptions)
    .values({ userId, stripeCustomerId: '', unitAmount: 0, status: 'trialing', trialEnd, startedAt: now });

  return c.json({ ok: true, entitlement: await resolveEntitlement(db, c.env, userId) });
});

/** POST /api/subscriptions/:userId/revoke — cancel the live episode (kept as history). */
subscriptionsRoute.post('/:userId/revoke', async (c) => {
  const db = c.get('db');
  const userId = c.req.param('userId');
  await terminateLive(db, userId, 'canceled', new Date());
  return c.json({ ok: true, entitlement: await resolveEntitlement(db, c.env, userId) });
});
