import { createMiddleware } from 'hono/factory';
import { createAuth } from '@dmtx/auth';
import type { AppEnv, SessionUser } from '../context';
import { resolveEntitlement } from '../lib/entitlement';

/** Resolve the Better Auth session and expose `user`/`session` on the context. */
export const withSession = createMiddleware<AppEnv>(async (c, next) => {
  const auth = createAuth(c.env);
  const data = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set('user', (data?.user as SessionUser) ?? null);
  c.set('session', (data?.session as Record<string, unknown>) ?? null);
  await next();
});

const hasAdminRole = (role?: string | null): boolean =>
  (role ?? '')
    .split(',')
    .map((r) => r.trim())
    .includes('admin');

/** Gate: require an authenticated admin. 401 if anonymous, 403 otherwise. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'No autenticado' }, 401);
  if (!hasAdminRole(user.role)) return c.json({ error: 'No autorizado' }, 403);
  await next();
});

/** Gate: require any authenticated user (used by the consumer/mobile API). */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'No autenticado' }, 401);
  await next();
});

/**
 * Gate: require an authenticated user with an active entitlement (trial, paid
 * subscription, or admin grant). 401 if anonymous, 402 if no active access.
 */
export const requireAccess = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'No autenticado' }, 401);
  const entitlement = await resolveEntitlement(c.get('db'), c.env, user.id);
  if (!entitlement.active) {
    return c.json({ error: 'Suscripción requerida', code: 'subscription_required' }, 402);
  }
  await next();
});
