import type { ActivityLevel, Gender } from '@dmtx/schemas';
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
  id: string;
  status: string;
  comp: boolean;
  unitAmount: number;
  currency: string;
  intervalUnit: string;
  intervalCount: number;
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

export interface UserActivity {
  summary: { sessions: number; sessions30d: number; minutes: number; lastActiveAt: string | null };
  profile: {
    gender: Gender | null;
    dateOfBirth: string | null;
    heightCm: number | null;
    weightKg: number | null;
    activityLevel: ActivityLevel | null;
  };
  workouts: { id: string | null; name: string; sessions: number; minutes: number; lastAt: string }[];
  programs: { id: string; name: string; sessions: number; daysDone: number; daysTotal: number; lastAt: string }[];
  skills: { id: string; name: string; sessions: number; level: number; levels: number; lastAt: string | null }[];
  /** Opened or started, not yet done: the most looked at first. */
  interest: { type: 'workout' | 'program' | 'skill'; id: string; name: string; views: number; starts: number; lastAt: string }[];
}

export type UserHistoryType = 'all' | 'session' | 'view' | 'start' | 'search';

export interface UserHistoryPage {
  items: {
    id: string;
    type: Exclude<UserHistoryType, 'all'>;
    title: string;
    detail: string | null;
    query: string | null;
    filters: string[];
    results: number;
    at: string;
  }[];
  nextCursor: string | null;
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
    activity(id: string): Promise<UserActivity> {
      return http.request(`/api/subscriptions/users/${id}/activity`);
    },
    activityHistory(id: string, opts: { type: UserHistoryType; cursor?: string | null; limit: number }): Promise<UserHistoryPage> {
      const qs = new URLSearchParams({ type: opts.type, limit: String(opts.limit) });
      if (opts.cursor) qs.set('cursor', opts.cursor);
      return http.request(`/api/subscriptions/users/${id}/activity/history?${qs}`);
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
