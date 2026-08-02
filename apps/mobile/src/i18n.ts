/** Spanish UI copy for the mobile app (single locale, mirrors admin/es.ts). */
import type { Difficulty, MeasurementType, WorkoutFormat } from '@dmtx/schemas';

export const es = {
  difficulty: {
    beginner: 'Principiante',
    intermediate: 'Intermedio',
    advanced: 'Avanzado',
  } as Record<Difficulty, string>,
  difficultyShort: {
    beginner: 'Princip.',
    intermediate: 'Interm.',
    advanced: 'Avanz.',
  } as Record<Difficulty, string>,
  measurement: {
    reps: 'Repeticiones',
    time: 'Tiempo',
    distance: 'Distancia',
  } as Record<MeasurementType, string>,
  format: {
    amrap: 'AMRAP',
    emom: 'EMOM',
    tabata: 'Tabata',
    strength: 'Fuerza',
    chipper: 'Chipper',
    for_time: 'For Time',
    circuit: 'Circuito',
  } as Record<WorkoutFormat, string>,
  common: {
    rest: 'Descanso',
    skip: 'Saltar',
    done: 'Hecho',
    start: 'Empezar',
    continue: 'Continuar',
    loading: 'Cargando…',
    retry: 'Reintentar',
    error: 'Ocurrió un error',
    empty: 'Nada por aquí todavía',
  },
} as const;

export const difficultyLabel = (d: Difficulty | null | undefined, short = false): string =>
  d ? (short ? es.difficultyShort[d] : es.difficulty[d]) : '';

export const formatLabel = (f: WorkoutFormat | null | undefined): string =>
  f ? es.format[f] : '';
