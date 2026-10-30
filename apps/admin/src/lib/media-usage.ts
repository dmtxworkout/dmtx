import type { MediaUsageItem } from '@dmtx/api-client';

/** How a reference to a media asset is named and where it is edited. */
export const USAGE_LABEL: Record<MediaUsageItem['type'], string> = {
  exercise: 'Ejercicio',
  workout: 'Rutina',
  program: 'Programa',
  skill: 'Habilidad',
  skillLevel: 'Nivel de habilidad',
  muscle: 'Músculo',
};
export const USAGE_LABEL_PLURAL: Record<MediaUsageItem['type'], string> = {
  exercise: 'Ejercicios',
  workout: 'Rutinas',
  program: 'Programas',
  skill: 'Habilidades',
  skillLevel: 'Niveles de habilidad',
  muscle: 'Músculos',
};
const USAGE_PATH: Record<MediaUsageItem['type'], string> = {
  exercise: '/ejercicios',
  workout: '/rutinas',
  program: '/programas',
  skill: '/habilidades',
  skillLevel: '/habilidades',
  muscle: '/musculos',
};
/** Where a use is edited. Muscles have no page of their own: they open from their list. */
export const usageHref = (u: Pick<MediaUsageItem, 'type' | 'id'>) =>
  u.type === 'muscle' ? USAGE_PATH.muscle : `${USAGE_PATH[u.type]}/${u.id}`;
export const usageFieldLabel = (field: MediaUsageItem['field']) =>
  field === 'video' ? 'video' : 'portada';
