import { integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { SkillGoal } from '@dmtx/schemas';
import {
  contentStatusEnum,
  difficultyEnum,
  primaryId,
  publishable,
  softDelete,
  timestamps,
} from './_shared';
import { mediaAssets } from './media';
import { workouts } from './workouts';

/** A trainable skill, e.g. "Dominadas / Pull-up", made of ordered levels. */
export const skills = pgTable('skills', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  difficulty: difficultyEnum(),
  thumbnailAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  status: contentStatusEnum().notNull().default('draft'),
  ...publishable,
  ...timestamps,
  ...softDelete,
});

/** A level within a skill: a workout to train + the goals (from its "Objetivo" section) that unlock the next level. */
export const skillLevels = pgTable('skill_levels', {
  id: primaryId(),
  skillId: uuid()
    .notNull()
    .references(() => skills.id, { onDelete: 'cascade' }),
  position: integer().notNull().default(0),
  name: text().notNull(),
  description: text(),
  workoutId: uuid()
    .notNull()
    .references(() => workouts.id, { onDelete: 'restrict' }),
  unlockGoals: jsonb().$type<SkillGoal[]>().notNull().default([]),
  thumbnailAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  ...timestamps,
});
