import type { SubscriptionHistoryItem, UserSubscription } from '@dmtx/api-client';
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
  if (sub.status === 'expired') return { tone: 'canceled', label: 'Vencida', ends: sub.currentPeriodEnd ?? sub.trialEnd };
  if (sub.status === 'canceled') return { tone: 'canceled', label: 'Cancelada', ends: sub.currentPeriodEnd ?? sub.trialEnd };
  return { tone: 'canceled', label: 'Sin acceso', ends: sub.currentPeriodEnd ?? sub.trialEnd };
}

/** Status badge for one subscription episode in the history list. */
export function historyLabel(item: SubscriptionHistoryItem): { tone: BadgeTone; label: string } {
  switch (item.status) {
    case 'active':
      return { tone: 'active', label: item.comp ? (item.currentPeriodEnd ? 'Cortesía' : 'Gratis') : 'Activa' };
    case 'trialing':
      return { tone: 'trialing', label: 'Prueba' };
    case 'past_due':
      return { tone: 'past_due', label: 'Pago pendiente' };
    case 'paused':
      return { tone: 'paused', label: 'Pausada' };
    case 'expired':
      return { tone: 'canceled', label: 'Vencida' };
    case 'canceled':
      return { tone: 'canceled', label: 'Cancelada' };
    default:
      return { tone: 'neutral', label: item.status };
  }
}
