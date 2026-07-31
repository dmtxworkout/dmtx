import { z } from 'zod';
import { contentStatusSchema, difficultySchema } from '../enums';
import { goalSchema } from '../goal';
import { slugSchema, uuidSchema } from '../common';

export const skillLevelInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  workoutId: uuidSchema,
  unlockGoal: goalSchema.nullish(),
});
export type SkillLevelInput = z.infer<typeof skillLevelInputSchema>;

export const createSkillSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(5000).nullish(),
  difficulty: difficultySchema.nullish(),
  status: contentStatusSchema.default('draft'),
  thumbnailAssetId: uuidSchema.nullish(),
  levels: z.array(skillLevelInputSchema).default([]),
});
export type CreateSkillInput = z.infer<typeof createSkillSchema>;

export const updateSkillSchema = createSkillSchema.partial();
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;

// --- Responses ---------------------------------------------------------------
export const skillLevelSchema = skillLevelInputSchema.extend({ id: uuidSchema });

export const skillSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  difficulty: difficultySchema.nullable(),
  status: contentStatusSchema,
  thumbnailAssetId: uuidSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  levels: z.array(skillLevelSchema),
});
export type Skill = z.infer<typeof skillSchema>;

export const skillListItemSchema = skillSchema.omit({ levels: true });
export type SkillListItem = z.infer<typeof skillListItemSchema>;
