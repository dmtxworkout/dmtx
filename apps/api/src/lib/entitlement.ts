import { eq } from 'drizzle-orm';
import { subscriptions } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import type { Env } from '../env';

export type EntitlementSource = 'trial' | 'subscription' | 'grant' | 'none';

export interface Entitlement {
  /** Whether the user may access paid content right now. */
  active: boolean;
  status: string;
  source: EntitlementSource;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

const DAY_MS = 86_400_000;

function trialDays(env: Env): number {
  const n = Number(env.TRIAL_DAYS ?? '7');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 7;
}

/**
 * Resolve a user's access entitlement.
 *
 * Product model: subscriptions are sold on the web only. Every account gets a
 * free trial (default 7 days, editable via TRIAL_DAYS); when the trial lapses,
 * paid access must be purchased on the web. Admins can comp a free grant by
 * writing an `active` subscription with `unitAmount = 0`.
 *
 * The trial is provisioned lazily the first time we see a user with no
 * subscription row, so signing up (in the app or on the web) immediately grants
 * access for the trial window. Idempotent via the unique `user_id` constraint.
 */
export async function resolveEntitlement(
  db: Database,
  env: Env,
  userId: string,
): Promise<Entitlement> {
  let [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!sub) {
    const now = new Date();
    const trialEnd = new Date(now.getTime() + trialDays(env) * DAY_MS);
    const inserted = await db
      .insert(subscriptions)
      .values({
        userId,
        stripeCustomerId: '',
        unitAmount: Number(env.DEFAULT_PLAN_AMOUNT_CENTS ?? '0') || 0,
        status: 'trialing',
        trialEnd,
        startedAt: now,
      })
      .onConflictDoNothing({ target: subscriptions.userId })
      .returning();
    sub =
      inserted[0] ??
      (
        await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, userId))
          .limit(1)
      )[0];
  }

  if (!sub) {
    return { active: false, status: 'none', source: 'none', trialEndsAt: null, currentPeriodEnd: null };
  }

  const now = Date.now();
  const trialEndsAt = sub.trialEnd ? sub.trialEnd.getTime() : null;
  const periodEnd = sub.currentPeriodEnd ? sub.currentPeriodEnd.getTime() : null;

  let active = false;
  let source: EntitlementSource = 'none';
  if (sub.status === 'trialing' && trialEndsAt !== null && trialEndsAt > now) {
    active = true;
    source = 'trial';
  } else if (sub.status === 'active' && (periodEnd === null || periodEnd > now)) {
    active = true;
    source = sub.unitAmount === 0 ? 'grant' : 'subscription';
  }

  return {
    active,
    status: sub.status,
    source,
    trialEndsAt: sub.trialEnd ? sub.trialEnd.toISOString() : null,
    currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
  };
}
