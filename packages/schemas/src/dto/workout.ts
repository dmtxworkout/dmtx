import { z } from 'zod';
import {
  blockKindSchema,
  blockSectionSchema,
  blockTypeSchema,
  contentStatusSchema,
  difficultySchema,
  itemKindSchema,
  measurementTypeSchema,
  workoutFormatSchema,
  workoutTypeSchema,
} from '../enums';
import { formatConfigSchema } from '../format-config';
import { goalSchema } from '../goal';
import { loadPrescriptionSchema } from '../load';
import { tempoSchema } from '../tempo';
import { slugSchema, uuidSchema } from '../common';

export const workoutItemInputSchema = z.object({
  kind: itemKindSchema.default('exercise'),
  // null for rest items; workSeconds holds the rest duration then
  exerciseId: uuidSchema.nullish(),
  // Per-item measurement; null falls back to the exercise's measurementType.
  measure: measurementTypeSchema.nullish(),
  sets: z.number().int().positive().nullish(),
  reps: z.number().int().positive().nullish(),
  workSeconds: z.number().int().positive().nullish(),
  distanceMeters: z.number().int().positive().nullish(),
  restBetweenSeconds: z.number().int().nonnegative().nullish(),
  tempoOverride: tempoSchema.nullish(),
  loadPrescription: loadPrescriptionSchema.nullish(),
  perSide: z.boolean().default(false),
  intervalIndex: z.number().int().nonnegative().nullish(),
  notes: z.string().max(2000).nullish(),
});
export type WorkoutItemInput = z.infer<typeof workoutItemInputSchema>;

export const workoutBlockInputSchema = z.object({
  kind: blockKindSchema.default('group'),
  section: blockSectionSchema.default('main'),
  type: blockTypeSchema.default('single'),
  rounds: z.number().int().positive().nullish(),
  label: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
  items: z.array(workoutItemInputSchema).default([]),
});
export type WorkoutBlockInput = z.infer<typeof workoutBlockInputSchema>;

export const createWorkoutSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(5000).nullish(),
  type: workoutTypeSchema,
  format: workoutFormatSchema.nullish(),
  difficulty: difficultySchema,
  estimatedDurationSeconds: z.number().int().positive().nullish(),
  status: contentStatusSchema.default('draft'),
  thumbnailAssetId: uuidSchema.nullish(),
  videoAssetId: uuidSchema.nullish(),
  videoDurationSeconds: z.number().int().positive().nullish(),
  formatConfig: formatConfigSchema.nullish(),
  scoringGoal: goalSchema.nullish(),
  blocks: z.array(workoutBlockInputSchema).default([]),
});
export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;

export const updateWorkoutSchema = createWorkoutSchema.partial();
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;

// --- Responses ---------------------------------------------------------------
export const workoutItemSchema = workoutItemInputSchema.extend({ id: uuidSchema });
export const workoutBlockSchema = z.object({
  id: uuidSchema,
  kind: blockKindSchema,
  section: blockSectionSchema,
  type: blockTypeSchema,
  rounds: z.number().nullable(),
  label: z.string().nullable(),
  notes: z.string().nullable(),
  items: z.array(workoutItemSchema),
});

export const workoutSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: workoutTypeSchema,
  format: workoutFormatSchema.nullable(),
  difficulty: difficultySchema,
  estimatedDurationSeconds: z.number().nullable(),
  status: contentStatusSchema,
  thumbnailAssetId: uuidSchema.nullable(),
  videoAssetId: uuidSchema.nullable(),
  videoDurationSeconds: z.number().nullable(),
  formatConfig: formatConfigSchema.nullable(),
  scoringGoal: goalSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  blocks: z.array(workoutBlockSchema),
});
export type Workout = z.infer<typeof workoutSchema>;

export const workoutListItemSchema = workoutSchema.omit({
  blocks: true,
  formatConfig: true,
  scoringGoal: true,
});
export type WorkoutListItem = z.infer<typeof workoutListItemSchema>;
