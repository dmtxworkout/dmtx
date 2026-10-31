// The body drawn in the admin's muscle form and the app. Its own entry point
// (`@dmtx/core/body-map`): only the screens that draw it pay for the paths.
export { BODY_FIGURES } from './data';
import type { BodyPart } from '@dmtx/schemas';

/** Parts drawn plain, like the body, until they light up: the rest are drawn as muscle. */
export const PLAIN_BODY_PARTS: readonly BodyPart[] = ['neck', 'hands', 'feet'];

export type { BodyFigureKind, BodyFigureView, BodyFigures, BodyView } from './types';
