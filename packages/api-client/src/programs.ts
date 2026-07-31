import type {
  CreateProgramInput,
  PaginationQuery,
  Program,
  ProgramListItem,
  UpdateProgramInput,
} from '@dmtx/schemas';
import { type Http, listQuery } from './http';
import type { Paginated } from './exercises';

export function programsApi(http: Http) {
  return {
    list(query?: Partial<PaginationQuery>): Promise<Paginated<ProgramListItem>> {
      return http.request(`/api/programs${listQuery(query)}`);
    },
    get(id: string): Promise<Program> {
      return http.request(`/api/programs/${id}`);
    },
    create(input: CreateProgramInput): Promise<Program> {
      return http.request('/api/programs', { method: 'POST', body: JSON.stringify(input) });
    },
    update(id: string, input: UpdateProgramInput): Promise<Program> {
      return http.request(`/api/programs/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    },
    remove(id: string): Promise<void> {
      return http.request(`/api/programs/${id}`, { method: 'DELETE' });
    },
  };
}
