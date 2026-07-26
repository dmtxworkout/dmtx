import { z } from 'zod';

/**
 * Per-format GLOBAL timing/config for a structured workout. The exercise
 * prescription (sets/reps/rest) lives on blocks/items; this holds only the
 * format-level timing. Discriminated on `format`.
 *
 * This is the single source of truth shared by API validation AND the mobile
 * timer/counter engine. `configVersion` lets the engine migrate old configs.
 */
const configVersion = z.number().int().positive().default(1);
const seconds = z.number().int().positive();

export const amrapConfigSchema = z.object({
  format: z.literal('amrap'),
  configVersion,
  totalSeconds: seconds,
});

export const emomConfigSchema = z.object({
  format: z.literal('emom'),
  configVersion,
  intervalSeconds: seconds,
  rounds: z.number().int().positive(),
});

export const tabataConfigSchema = z.object({
  format: z.literal('tabata'),
  configVersion,
  workSeconds: seconds,
  restSeconds: z.number().int().nonnegative(),
  rounds: z.number().int().positive(),
});

export const strengthConfigSchema = z.object({
  format: z.literal('strength'),
  configVersion,
});

export const chipperConfigSchema = z.object({
  format: z.literal('chipper'),
  configVersion,
  timeCapSeconds: seconds.optional(),
});

export const forTimeConfigSchema = z.object({
  format: z.literal('for_time'),
  configVersion,
  rounds: z.number().int().positive().optional(),
  timeCapSeconds: seconds.optional(),
});

export const circuitConfigSchema = z.object({
  format: z.literal('circuit'),
  configVersion,
  rounds: z.number().int().positive().optional(),
  restBetweenRoundsSeconds: z.number().int().nonnegative().optional(),
  timeCapSeconds: seconds.optional(),
});

export const formatConfigSchema = z.discriminatedUnion('format', [
  amrapConfigSchema,
  emomConfigSchema,
  tabataConfigSchema,
  strengthConfigSchema,
  chipperConfigSchema,
  forTimeConfigSchema,
  circuitConfigSchema,
]);
export type FormatConfig = z.infer<typeof formatConfigSchema>;
