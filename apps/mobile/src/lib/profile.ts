import type { BodyFigure } from '@dmtx/schemas';
import type { Profile } from './types';

/** The body to draw: the member's choice, else their gender. */
export const figureOf = (p: Profile | undefined): BodyFigure => p?.bodyFigure ?? p?.gender ?? 'male';
