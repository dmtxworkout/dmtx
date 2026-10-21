import type {
  CreateWorkoutInput,
  PaginationQuery,
  UpdateWorkoutInput,
  Workout,
  WorkoutListItem,
} from '@dmtx/schemas';
import { type Http, listQuery } from './http';
import type { Paginated } from './exercises';

export function workoutsApi(http: Http) {
  return {
    list(
      query?: Partial<PaginationQuery> & { },
    ): Promise<Paginated<WorkoutListItem>> {
      return http.request(`/api/workouts${listQuery(query)}`);
    },
    get(id: string): Promise<Workout> {
      return http.request(`/api/workouts/${id}`);
    },
    create(input: CreateWorkoutInput): Promise<Workout> {
      return http.request('/api/workouts', { method: 'POST', body: JSON.stringify(input) });
    },
    update(id: string, input: UpdateWorkoutInput): Promise<Workout> {
      return http.request(`/api/workouts/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    },
    remove(id: string): Promise<void> {
      return http.request(`/api/workouts/${id}`, { method: 'DELETE' });
    },
  };
}
