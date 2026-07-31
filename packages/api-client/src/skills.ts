import type {
  CreateSkillInput,
  PaginationQuery,
  Skill,
  SkillListItem,
  UpdateSkillInput,
} from '@dmtx/schemas';
import { type Http, listQuery } from './http';
import type { Paginated } from './exercises';

export function skillsApi(http: Http) {
  return {
    list(query?: Partial<PaginationQuery>): Promise<Paginated<SkillListItem>> {
      return http.request(`/api/skills${listQuery(query)}`);
    },
    get(id: string): Promise<Skill> {
      return http.request(`/api/skills/${id}`);
    },
    create(input: CreateSkillInput): Promise<Skill> {
      return http.request('/api/skills', { method: 'POST', body: JSON.stringify(input) });
    },
    update(id: string, input: UpdateSkillInput): Promise<Skill> {
      return http.request(`/api/skills/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    },
    remove(id: string): Promise<void> {
      return http.request(`/api/skills/${id}`, { method: 'DELETE' });
    },
  };
}
