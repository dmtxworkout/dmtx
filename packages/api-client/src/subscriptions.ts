import type { Http } from './http';

export interface UserSubscription {
  status: string;
  comp: boolean;
  unitAmount: number;
  currency: string;
  intervalUnit: string;
  intervalCount: number;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  nextChargeDate: string | null;
  startedAt: string | null;
}

export interface SubscriptionHistoryItem {
  status: string;
  comp: boolean;
  unitAmount: number;
  currency: string;
  trialEnd: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  startedAt: string | null;
  endedAt: string | null;
  canceledAt: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
  createdAt: string;
  subscription: UserSubscription | null;
  /** Present on the detail endpoint: all episodes, newest first. */
  history?: SubscriptionHistoryItem[];
}

export interface EntitlementResult {
  active: boolean;
  status: string;
  source: 'trial' | 'subscription' | 'grant' | 'none';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

export function subscriptionsApi(http: Http) {
  return {
    users(search?: string): Promise<{ data: AdminUser[] }> {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      return http.request(`/api/subscriptions/users${qs}`);
    },
    user(id: string): Promise<AdminUser> {
      return http.request(`/api/subscriptions/users/${id}`);
    },
    updateUser(id: string, patch: { name?: string; email?: string }): Promise<{ ok: true }> {
      return http.request(`/api/subscriptions/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },
    /** Comp free access. Pass `until` (ISO date) or `days`; both omitted → forever. */
    grant(
      userId: string,
      opts?: { days?: number | null; until?: string | null },
    ): Promise<{ ok: true; entitlement: EntitlementResult }> {
      return http.request(`/api/subscriptions/${userId}/grant`, {
        method: 'POST',
        body: JSON.stringify({ days: opts?.days ?? null, until: opts?.until ?? null }),
      });
    },
    /** (Re)start a free trial of `days` days. */
    trial(userId: string, days: number): Promise<{ ok: true; entitlement: EntitlementResult }> {
      return http.request(`/api/subscriptions/${userId}/trial`, {
        method: 'POST',
        body: JSON.stringify({ days }),
      });
    },
    revoke(userId: string): Promise<{ ok: true; entitlement: EntitlementResult }> {
      return http.request(`/api/subscriptions/${userId}/revoke`, { method: 'POST' });
    },
  };
}
