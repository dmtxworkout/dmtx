import { z } from 'zod';
import { contentStatusSchema, difficultySchema } from '../enums';
import { slugSchema, uuidSchema, updateSchemaOf } from '../common';
import { workoutBlockInputSchema } from './workout';
import { workoutFormatSchema } from '../enums';

/**
 * What unlocks the next level, one entry per line of the level's "Objetivo"
 * section: an exercise and the mark to reach (always "at least"). Derived from
 * the level's text on save, never typed by hand.
 */
export const SKILL_GOAL_METRIC = ['reps', 'time_seconds', 'distance_meters', 'load_kg'] as const;
export const skillGoalMetricSchema = z.enum(SKILL_GOAL_METRIC);
export type SkillGoalMetric = z.infer<typeof skillGoalMetricSchema>;
export const skillGoalSchema = z.object({
  exerciseId: uuidSchema,
  exerciseName: z.string(),
  metric: skillGoalMetricSchema,
  value: z.number().positive(),
  /** For `load_kg`: the reps that load must be lifted for (e.g. 5 reps at 100 kg). */
  reps: z.number().int().positive().nullish(),
});
export type SkillGoal = z.infer<typeof skillGoalSchema>;

/**
 * A level as the admin saves it: its rutina written in the editor (text +
 * the parsed structure, like a workout) and the goals parsed from its
 * "Objetivo" section. The API owns the level's workout row.
 */
export const skillLevelInputSchema = z.object({
  /** Present for a level that already exists; missing levels are deleted. */
  id: uuidSchema.optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  sourceText: z.string().max(50000),
  format: workoutFormatSchema.nullish(),
  blocks: z.array(workoutBlockInputSchema).default([]),
  unlockGoals: z.array(skillGoalSchema).default([]),
  thumbnailAssetId: uuidSchema.nullish(),
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

export const updateSkillSchema = updateSchemaOf(createSkillSchema);
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;

// --- Responses ---------------------------------------------------------------
export const skillLevelSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  workoutId: uuidSchema,
  sourceText: z.string(),
  unlockGoals: z.array(skillGoalSchema),
  thumbnailAssetId: uuidSchema.nullable(),
});
export type SkillLevel = z.infer<typeof skillLevelSchema>;

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
