import { z } from 'zod';
import { contentStatusSchema, difficultySchema, workoutFormatSchema, workoutTypeSchema } from '../enums';
import { slugSchema, uuidSchema, updateSchemaOf } from '../common';
import { workoutBlockInputSchema } from './workout';

/**
 * A day as the admin saves it. A program is whole weeks of days (seven per
 * week, `position` = index in the array); each day is a rest day or carries
 * its own rutina written in the editor — structured (text + parsed blocks,
 * like a workout) or a single video. The API owns the day's workout row.
 */
export const programDayInputSchema = z.object({
  /** Present for a day that already exists; missing days are deleted. */
  id: uuidSchema.optional(),
  /** Shown in the app instead of "Día N" when set. */
  title: z.string().max(200).nullish(),
  isRestDay: z.boolean().default(false),
  type: workoutTypeSchema.default('structured'),
  sourceText: z.string().max(50000).nullish(),
  format: workoutFormatSchema.nullish(),
  blocks: z.array(workoutBlockInputSchema).default([]),
  videoAssetId: uuidSchema.nullish(),
  videoDurationSeconds: z.number().int().positive().nullish(),
});
export type ProgramDayInput = z.infer<typeof programDayInputSchema>;

export const createProgramSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(5000).nullish(),
  difficulty: difficultySchema,
  status: contentStatusSchema.default('draft'),
  thumbnailAssetId: uuidSchema.nullish(),
  days: z.array(programDayInputSchema).default([]),
});
export type CreateProgramInput = z.infer<typeof createProgramSchema>;

export const updateProgramSchema = updateSchemaOf(createProgramSchema);
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;

// --- Responses ---------------------------------------------------------------
export const programDaySchema = z.object({
  id: uuidSchema,
  title: z.string().nullable(),
  isRestDay: z.boolean(),
  /** The owned workout; null on a rest day (or a day never written). */
  workoutId: uuidSchema.nullable(),
  type: workoutTypeSchema,
  sourceText: z.string(),
  videoAssetId: uuidSchema.nullable(),
  videoDurationSeconds: z.number().nullable(),
});
export type ProgramDay = z.infer<typeof programDaySchema>;

export const programSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  difficulty: difficultySchema,
  status: contentStatusSchema,
  thumbnailAssetId: uuidSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  days: z.array(programDaySchema),
});
export type Program = z.infer<typeof programSchema>;

export const programListItemSchema = programSchema.omit({ days: true }).extend({
  dayCount: z.number().int(),
});
export type ProgramListItem = z.infer<typeof programListItemSchema>;
