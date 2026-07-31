import { z } from 'zod';
import { contentStatusSchema, difficultySchema, programTypeSchema } from '../enums';
import { slugSchema, uuidSchema } from '../common';

export const programDayInputSchema = z.object({
  title: z.string().max(200).nullish(),
  isRestDay: z.boolean().default(false),
  notes: z.string().max(2000).nullish(),
  workoutIds: z.array(uuidSchema).default([]),
});
export type ProgramDayInput = z.infer<typeof programDayInputSchema>;

export const programVideoItemInputSchema = z.object({
  mediaAssetId: uuidSchema,
  title: z.string().max(200).nullish(),
  description: z.string().max(2000).nullish(),
});
export type ProgramVideoItemInput = z.infer<typeof programVideoItemInputSchema>;

export const createProgramSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(5000).nullish(),
  type: programTypeSchema,
  difficulty: difficultySchema,
  durationDays: z.number().int().positive().nullish(),
  status: contentStatusSchema.default('draft'),
  thumbnailAssetId: uuidSchema.nullish(),
  days: z.array(programDayInputSchema).default([]),
  videoItems: z.array(programVideoItemInputSchema).default([]),
});
export type CreateProgramInput = z.infer<typeof createProgramSchema>;

export const updateProgramSchema = createProgramSchema.partial();
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;

// --- Responses ---------------------------------------------------------------
export const programDaySchema = z.object({
  id: uuidSchema,
  title: z.string().nullable(),
  isRestDay: z.boolean(),
  notes: z.string().nullable(),
  workoutIds: z.array(uuidSchema),
});
export const programVideoItemSchema = programVideoItemInputSchema.extend({ id: uuidSchema });

export const programSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: programTypeSchema,
  difficulty: difficultySchema,
  durationDays: z.number().nullable(),
  status: contentStatusSchema,
  thumbnailAssetId: uuidSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  days: z.array(programDaySchema),
  videoItems: z.array(programVideoItemSchema),
});
export type Program = z.infer<typeof programSchema>;

export const programListItemSchema = programSchema.omit({ days: true, videoItems: true });
export type ProgramListItem = z.infer<typeof programListItemSchema>;
