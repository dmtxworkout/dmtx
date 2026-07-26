import type {
  CreateExerciseInput,
  Exercise,
  PaginationQuery,
  UpdateExerciseInput,
} from '@dmtx/schemas';
import type { Http } from './http';

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** List rows omit the joined relations (loaded only on detail). */
export type ExerciseListItem = Omit<Exercise, 'muscles' | 'equipmentIds'>;

export function exercisesApi(http: Http) {
  return {
    list(query?: Partial<PaginationQuery>): Promise<Paginated<ExerciseListItem>> {
      const params = new URLSearchParams();
      if (query?.page) params.set('page', String(query.page));
      if (query?.pageSize) params.set('pageSize', String(query.pageSize));
      if (query?.search) params.set('search', query.search);
      const qs = params.toString();
      return http.request(`/api/exercises${qs ? `?${qs}` : ''}`);
    },
    get(id: string): Promise<Exercise> {
      return http.request(`/api/exercises/${id}`);
    },
    create(input: CreateExerciseInput): Promise<Exercise> {
      return http.request('/api/exercises', { method: 'POST', body: JSON.stringify(input) });
    },
    update(id: string, input: UpdateExerciseInput): Promise<Exercise> {
      return http.request(`/api/exercises/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    },
    remove(id: string): Promise<void> {
      return http.request(`/api/exercises/${id}`, { method: 'DELETE' });
    },
  };
}
