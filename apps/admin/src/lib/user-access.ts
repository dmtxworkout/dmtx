import type { UserSubscription } from '@dmtx/api-client';
import type { BadgeTone } from '@/components/ui/badge';

/** Derive a display access status from a raw subscription row. */
export function access(sub: UserSubscription | null): { tone: BadgeTone; label: string; ends: string | null } {
  if (!sub) return { tone: 'neutral', label: 'Sin acceso', ends: null };
  const now = Date.now();
  const trialEnd = sub.trialEnd ? new Date(sub.trialEnd).getTime() : null;
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null;
  if (sub.status === 'trialing' && trialEnd && trialEnd > now)
    return { tone: 'trialing', label: 'Prueba', ends: sub.trialEnd };
  if (sub.status === 'active' && (periodEnd === null || periodEnd > now))
    return {
      tone: 'active',
      label: sub.comp ? (periodEnd ? 'Cortesía' : 'Gratis') : 'Activa',
      ends: sub.currentPeriodEnd,
    };
  if (sub.status === 'trialing') return { tone: 'canceled', label: 'Prueba vencida', ends: sub.trialEnd };
  return { tone: 'canceled', label: 'Sin acceso', ends: sub.currentPeriodEnd ?? sub.trialEnd };
}
