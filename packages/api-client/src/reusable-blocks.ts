import type {
  CreateReusableBlockInput,
  PaginationQuery,
  ReusableBlock,
  UpdateReusableBlockInput,
} from '@dmtx/schemas';
import { type Http, listQuery } from './http';
import type { Paginated } from './exercises';

/** Reusable rutina text blocks ("bloques reutilizables"). */
export function reusableBlocksApi(http: Http) {
  return {
    list(query?: Partial<PaginationQuery>): Promise<Paginated<ReusableBlock>> {
      return http.request(`/api/reusable-blocks${listQuery(query)}`);
    },
    get(id: string): Promise<ReusableBlock> {
      return http.request(`/api/reusable-blocks/${id}`);
    },
    create(input: CreateReusableBlockInput): Promise<ReusableBlock> {
      return http.request('/api/reusable-blocks', { method: 'POST', body: JSON.stringify(input) });
    },
    update(id: string, input: UpdateReusableBlockInput): Promise<ReusableBlock> {
      return http.request(`/api/reusable-blocks/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    },
    remove(id: string): Promise<void> {
      return http.request(`/api/reusable-blocks/${id}`, { method: 'DELETE' });
    },
  };
}
