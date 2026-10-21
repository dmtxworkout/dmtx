import { z } from 'zod';
import { difficultySchema } from '../enums';
import { tempoSchema } from '../tempo';
import { slugSchema, updateSchemaOf, uuidSchema } from '../common';

/** Payload to create an exercise. `slug` is derived from `name` when omitted. */
export const createExerciseSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(5000).nullish(),
  cues: z.array(z.string().min(1).max(500)).default([]),
  // Alternate names the rutina text editor also matches (e.g. "Power Clean" for
  // "Cargada de potencia", or common abbreviations).
  aliases: z.array(z.string().min(1).max(200)).default([]),
  difficulty: difficultySchema,
  defaultTempo: tempoSchema.nullish(),
  demoVideoAssetId: uuidSchema.nullish(),
  thumbnailAssetId: uuidSchema.nullish(),
  muscleIds: z.array(uuidSchema).default([]),
  equipmentIds: z.array(uuidSchema).default([]),
});
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const updateExerciseSchema = updateSchemaOf(createExerciseSchema).extend({
  // true archives (hidden from suggestions and the default list), false restores.
  archived: z.boolean().optional(),
});
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

/**
 * One action over many exercises (the list's bulk bar). Tag actions add or
 * remove the given muscles / equipment on every selected exercise.
 */
export const bulkExerciseSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(500),
  action: z.enum(['archive', 'restore', 'delete', 'add_muscles', 'remove_muscles', 'add_equipment', 'remove_equipment']),
  muscleIds: z.array(uuidSchema).default([]),
  equipmentIds: z.array(uuidSchema).default([]),
});
export type BulkExerciseInput = z.infer<typeof bulkExerciseSchema>;
export const bulkExerciseResultSchema = z.object({
  done: z.number().int(),
  /** Exercises the action could not touch (a delete refused because something uses it). */
  refused: z.array(z.object({ id: uuidSchema, name: z.string(), reason: z.string() })),
});
export type BulkExerciseResult = z.infer<typeof bulkExerciseResultSchema>;

/** Full exercise as returned by the API. */
export const exerciseSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  cues: z.array(z.string()),
  aliases: z.array(z.string()),
  difficulty: difficultySchema,
  defaultTempo: tempoSchema.nullable(),
  demoVideoAssetId: uuidSchema.nullable(),
  thumbnailAssetId: uuidSchema.nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  muscleIds: z.array(uuidSchema),
  equipmentIds: z.array(uuidSchema),
});
export type Exercise = z.infer<typeof exerciseSchema>;
