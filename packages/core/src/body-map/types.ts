import type { BodyPart } from '@dmtx/schemas';

export type BodyFigureKind = 'male' | 'female';
export type BodyView = 'front' | 'back';

/** One view of a figure: the outline, the parts that aren't muscles, and each muscle's shapes. */
export interface BodyFigureView {
  viewBox: string;
  border: string;
  base: string[];
  parts: Partial<Record<BodyPart, string[]>>;
}

export type BodyFigures = Record<BodyFigureKind, Record<BodyView, BodyFigureView>>;
