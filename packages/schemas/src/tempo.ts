import { z } from 'zod';

/**
 * Tempo notation — the 4 phases of a rep. Each phase is a duration in seconds,
 * or `'X'` meaning explosive / as fast as possible.
 *
 * Spanish mapping (see docs/domain-glossary-es.md):
 *   holdTop    = hold arriba
 *   eccentric  = negativa (bajando)
 *   holdBottom = hold abajo
 *   concentric = positiva (subiendo)
 */
export const tempoPhaseSchema = z.union([z.number().int().min(0).max(60), z.literal('X')]);
export type TempoPhase = z.infer<typeof tempoPhaseSchema>;

export const tempoSchema = z.object({
  holdTop: tempoPhaseSchema,
  eccentric: tempoPhaseSchema,
  holdBottom: tempoPhaseSchema,
  concentric: tempoPhaseSchema,
});
export type Tempo = z.infer<typeof tempoSchema>;
