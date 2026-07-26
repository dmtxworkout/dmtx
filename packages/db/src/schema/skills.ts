import { integer, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import type { Goal } from '@dmtx/schemas';
import {
  contentStatusEnum,
  difficultyEnum,
  primaryId,
  publishable,
  softDelete,
  timestamps,
} from './_shared';
import { mediaAssets } from './media';
import { muscles } from './taxonomy';
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

export const skillMuscles = pgTable(
  'skill_muscles',
  {
    skillId: uuid()
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    muscleId: uuid()
      .notNull()
      .references(() => muscles.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.skillId, t.muscleId] })],
);

/** A level within a skill: a workout to train + a goal to unlock the next level. */
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
  unlockGoal: jsonb().$type<Goal>(),
  thumbnailAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  ...timestamps,
});
