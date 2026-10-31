import type { CreateWorkoutLogInput, UpdateProfileInput } from '@dmtx/schemas';
import { API_URL, getSessionCookie } from './auth';
import type { Browse, BrowseFilters, Home, Me, Profile, ProgramDetail, SkillDetail, WorkoutDetail } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Authenticated fetch against the DMTX API. Attaches the Better Auth cookie. */
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const cookie = getSessionCookie();
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let message = `Error ${res.status}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      if (body.error) message = body.error;
      code = body.code;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message, code);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => req<Me>('/app/me'),
  updateProfile: (input: UpdateProfileInput) =>
    req<Profile>('/app/me/profile', { method: 'PATCH', body: JSON.stringify(input) }),
  home: () => req<Home>('/app/home'),
  filters: () => req<BrowseFilters>('/app/filters'),
  browse: (opts?: {
    q?: string;
    type?: string;
    zones?: string[];
    muscles?: string[];
    fullBody?: boolean;
    equipment?: string;
    video?: boolean;
    guided?: boolean;
  }) => {
    const p = new URLSearchParams();
    if (opts?.q) p.set('q', opts.q);
    if (opts?.type && opts.type !== 'all') p.set('type', opts.type);
    if (opts?.zones?.length) p.set('zones', opts.zones.join(','));
    if (opts?.muscles?.length) p.set('muscles', opts.muscles.join(','));
    if (opts?.fullBody) p.set('fullBody', '1');
    if (opts?.equipment) p.set('equipment', opts.equipment);
    if (opts?.video) p.set('video', '1');
    if (opts?.guided) p.set('guided', '1');
    const qs = p.toString();
    return req<Browse>(`/app/browse${qs ? `?${qs}` : ''}`);
  },
  workout: (id: string) => req<WorkoutDetail>(`/app/workouts/${id}`),
  program: (id: string) => req<ProgramDetail>(`/app/programs/${id}`),
  skill: (id: string) => req<SkillDetail>(`/app/skills/${id}`),
  saveLog: (payload: CreateWorkoutLogInput) =>
    req<{ id: string }>('/app/logs', { method: 'POST', body: JSON.stringify(payload) }),
};
