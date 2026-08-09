import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { subscriptions, user } from '@dmtx/db';
import { createApp } from '../lib/openapi';
import { resolveEntitlement } from '../lib/entitlement';
import { requireAdmin } from '../middleware/auth';

const DAY_MS = 86_400_000;

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
      trialEnd: subscriptions.trialEnd,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(user)
    .leftJoin(subscriptions, eq(subscriptions.userId, user.id))
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
      subscription: r.status
        ? {
            status: r.status,
            comp: r.unitAmount === 0,
            trialEnd: r.trialEnd ? r.trialEnd.toISOString() : null,
            currentPeriodEnd: r.currentPeriodEnd ? r.currentPeriodEnd.toISOString() : null,
          }
        : null,
    })),
  });
});

/** GET /api/subscriptions/users/:id — one member + their access status. */
subscriptionsRoute.get('/users/:id', async (c) => {
  const db = c.get('db');
  const [r] = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      status: subscriptions.status,
      unitAmount: subscriptions.unitAmount,
      trialEnd: subscriptions.trialEnd,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(user)
    .leftJoin(subscriptions, eq(subscriptions.userId, user.id))
    .where(eq(user.id, c.req.param('id')))
    .limit(1);
  if (!r) return c.json({ error: 'Usuario no encontrado' }, 404);
  return c.json({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    createdAt: r.createdAt.toISOString(),
    subscription: r.status
      ? {
          status: r.status,
          comp: r.unitAmount === 0,
          trialEnd: r.trialEnd ? r.trialEnd.toISOString() : null,
          currentPeriodEnd: r.currentPeriodEnd ? r.currentPeriodEnd.toISOString() : null,
        }
      : null,
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
  await db
    .insert(subscriptions)
    .values({
      userId,
      stripeCustomerId: '',
      unitAmount: 0,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: end,
      startedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        status: 'active',
        unitAmount: 0,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        canceledAt: null,
        cancelAtPeriodEnd: false,
      },
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
  await db
    .insert(subscriptions)
    .values({ userId, stripeCustomerId: '', unitAmount: 0, status: 'trialing', trialEnd, startedAt: now })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: { status: 'trialing', trialEnd, canceledAt: null, cancelAtPeriodEnd: false },
    });

  return c.json({ ok: true, entitlement: await resolveEntitlement(db, c.env, userId) });
});

/** POST /api/subscriptions/:userId/revoke — cancel access. */
subscriptionsRoute.post('/:userId/revoke', async (c) => {
  const db = c.get('db');
  const userId = c.req.param('userId');
  await db
    .update(subscriptions)
    .set({ status: 'canceled', canceledAt: new Date(), cancelAtPeriodEnd: true })
    .where(and(eq(subscriptions.userId, userId)));
  return c.json({ ok: true, entitlement: await resolveEntitlement(db, c.env, userId) });
});
