import type {
  CreateSnippetInput,
  PaginationQuery,
  Snippet,
  UpdateSnippetInput,
} from '@dmtx/schemas';
import { type Http, listQuery } from './http';
import type { Paginated } from './exercises';

/** Saved rutina text blocks ("bloques guardados"). */
export function snippetsApi(http: Http) {
  return {
    list(query?: Partial<PaginationQuery>): Promise<Paginated<Snippet>> {
      return http.request(`/api/snippets${listQuery(query)}`);
    },
    create(input: CreateSnippetInput): Promise<Snippet> {
      return http.request('/api/snippets', { method: 'POST', body: JSON.stringify(input) });
    },
    update(id: string, input: UpdateSnippetInput): Promise<Snippet> {
      return http.request(`/api/snippets/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    },
    remove(id: string): Promise<void> {
      return http.request(`/api/snippets/${id}`, { method: 'DELETE' });
    },
  };
}
