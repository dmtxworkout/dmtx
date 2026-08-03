import { z } from 'zod';
import { contentStatusSchema, difficultySchema, muscleRoleSchema } from '../enums';
import { tempoSchema } from '../tempo';
import { slugSchema, uuidSchema } from '../common';

export const exerciseMuscleInputSchema = z.object({
  muscleId: uuidSchema,
  role: muscleRoleSchema,
});
export type ExerciseMuscleInput = z.infer<typeof exerciseMuscleInputSchema>;

/** Payload to create an exercise. `slug` is derived from `name` when omitted. */
export const createExerciseSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(5000).nullish(),
  cues: z.array(z.string().min(1).max(500)).default([]),
  difficulty: difficultySchema,
  isUnilateral: z.boolean().default(false),
  defaultTempo: tempoSchema.nullish(),
  demoVideoAssetId: uuidSchema.nullish(),
  thumbnailAssetId: uuidSchema.nullish(),
  status: contentStatusSchema.default('draft'),
  muscles: z.array(exerciseMuscleInputSchema).default([]),
  equipmentIds: z.array(uuidSchema).default([]),
});
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const updateExerciseSchema = createExerciseSchema.partial();
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

/** Full exercise as returned by the API. */
export const exerciseSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  cues: z.array(z.string()),
  difficulty: difficultySchema,
  isUnilateral: z.boolean(),
  defaultTempo: tempoSchema.nullable(),
  demoVideoAssetId: uuidSchema.nullable(),
  thumbnailAssetId: uuidSchema.nullable(),
  status: contentStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  muscles: z.array(exerciseMuscleInputSchema),
  equipmentIds: z.array(uuidSchema),
});
export type Exercise = z.infer<typeof exerciseSchema>;
