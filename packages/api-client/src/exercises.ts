import type {
  BulkExerciseInput,
  BulkExerciseResult,
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

/** List rows carry their muscles and equipment too (the list shows them). */
export type ExerciseListItem = Exercise;

export function exercisesApi(http: Http) {
  return {
    list(query?: Partial<PaginationQuery> & { archived?: 'false' | 'true' | 'all' }): Promise<Paginated<ExerciseListItem>> {
      const params = new URLSearchParams();
      if (query?.archived) params.set('archived', query.archived);
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
    /** One action over many exercises (archive, restore, delete, add/remove tags). */
    bulk(input: BulkExerciseInput): Promise<BulkExerciseResult> {
      return http.request('/api/exercises/bulk', { method: 'POST', body: JSON.stringify(input) });
    },
  };
}
