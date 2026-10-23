import type { MediaUsageItem } from '@dmtx/api-client';

/** How a reference to a media asset is named and where it is edited. */
export const USAGE_LABEL: Record<MediaUsageItem['type'], string> = {
  exercise: 'Ejercicio',
  workout: 'Rutina',
  program: 'Programa',
  skill: 'Habilidad',
  skillLevel: 'Nivel de habilidad',
  collection: 'Colección',
};
export const USAGE_LABEL_PLURAL: Record<MediaUsageItem['type'], string> = {
  exercise: 'Ejercicios',
  workout: 'Rutinas',
  program: 'Programas',
  skill: 'Habilidades',
  skillLevel: 'Niveles de habilidad',
  collection: 'Colecciones',
};
export const USAGE_PATH: Record<MediaUsageItem['type'], string> = {
  exercise: '/ejercicios',
  workout: '/rutinas',
  program: '/programas',
  skill: '/habilidades',
  skillLevel: '/habilidades',
  collection: '/colecciones',
};
export const usageFieldLabel = (field: MediaUsageItem['field']) =>
  field === 'video' ? 'video' : 'portada';
