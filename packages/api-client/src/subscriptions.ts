import type { Http } from './http';

export interface UserSubscription {
  status: string;
  comp: boolean;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
  createdAt: string;
  subscription: UserSubscription | null;
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
    /** Comp free access. `days` omitted → indefinite (free forever). */
    grant(userId: string, days?: number | null): Promise<{ ok: true; entitlement: EntitlementResult }> {
      return http.request(`/api/subscriptions/${userId}/grant`, {
        method: 'POST',
        body: JSON.stringify({ days: days ?? null }),
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
