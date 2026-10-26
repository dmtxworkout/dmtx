import type {
  CreateEquipmentInput,
  CreateMuscleInput,
  Equipment,
  Muscle,
  SetMuscleZoneInput,
  Taxonomy,
  UpdateEquipmentInput,
  UpdateMuscleInput,
} from '@dmtx/schemas';
import type { Http } from './http';

/** Muscles and equipment, with how many exercises use each. */
export function taxonomyApi(http: Http) {
  const json = (body: unknown) => ({ body: JSON.stringify(body) });
  return {
    get(): Promise<Taxonomy> {
      return http.request('/api/taxonomy');
    },
    createMuscle(input: CreateMuscleInput): Promise<Muscle> {
      return http.request('/api/taxonomy/muscles', { method: 'POST', ...json(input) });
    },
    updateMuscle(id: string, input: UpdateMuscleInput): Promise<Muscle> {
      return http.request(`/api/taxonomy/muscles/${id}`, { method: 'PATCH', ...json(input) });
    },
    setMuscleZone(input: SetMuscleZoneInput): Promise<void> {
      return http.request('/api/taxonomy/muscles/zone', { method: 'POST', ...json(input) });
    },
    removeMuscle(id: string): Promise<void> {
      return http.request(`/api/taxonomy/muscles/${id}`, { method: 'DELETE' });
    },
    createEquipment(input: CreateEquipmentInput): Promise<Equipment> {
      return http.request('/api/taxonomy/equipment', { method: 'POST', ...json(input) });
    },
    updateEquipment(id: string, input: UpdateEquipmentInput): Promise<Equipment> {
      return http.request(`/api/taxonomy/equipment/${id}`, { method: 'PATCH', ...json(input) });
    },
    removeEquipment(id: string): Promise<void> {
      return http.request(`/api/taxonomy/equipment/${id}`, { method: 'DELETE' });
    },
  };
}
