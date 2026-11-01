import type { Http } from './http';

export interface ActivityReportItem {
  key: string;
  label: string;
  total: number;
  /** Different people, once each across the whole period. */
  people: number;
}

export interface ActivityReport {
  days: number;
  /** When the daily summary was last added up; null if it never was. */
  updatedAt: string | null;
  searches: ActivityReportItem[];
  emptySearches: ActivityReportItem[];
  filters: ActivityReportItem[];
  opened: (ActivityReportItem & { type: 'workout' | 'program' | 'skill' })[];
  trained: ActivityReportItem[];
}

export function reportsApi(http: Http) {
  return {
    activity(days: number): Promise<ActivityReport> {
      return http.request(`/api/reports/activity?days=${days}`);
    },
    refreshActivity(): Promise<{ ok: true }> {
      return http.request('/api/reports/activity/refresh', { method: 'POST' });
    },
  };
}
