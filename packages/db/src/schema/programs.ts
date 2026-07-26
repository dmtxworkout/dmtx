import { boolean, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import {
  contentStatusEnum,
  difficultyEnum,
  primaryId,
  programTypeEnum,
  publishable,
  softDelete,
  timestamps,
} from './_shared';
import { mediaAssets } from './media';
import { muscles } from './taxonomy';
import { workouts } from './workouts';

/** Reusable objective tags (weight-loss, strength, hypertrophy, …). */
export const goalTags = pgTable('goal_tags', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  ...timestamps,
});

/**
 * A program. Polymorphic via `type`:
 *  - structured: a schedule of days -> workouts (`programDays` / `programItems`).
 *  - video_playlist: an ordered list of videos (`programVideoItems`).
 */
export const programs = pgTable('programs', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  type: programTypeEnum().notNull(),
  difficulty: difficultyEnum().notNull(),
  durationDays: integer(),
  thumbnailAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  status: contentStatusEnum().notNull().default('draft'),
  ...publishable,
  ...timestamps,
  ...softDelete,
});

export const programGoalTags = pgTable(
  'program_goal_tags',
  {
    programId: uuid()
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    goalTagId: uuid()
      .notNull()
      .references(() => goalTags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.programId, t.goalTagId] })],
);

export const programMuscles = pgTable(
  'program_muscles',
  {
    programId: uuid()
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    muscleId: uuid()
      .notNull()
      .references(() => muscles.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.programId, t.muscleId] })],
);

/** A single day in a structured program (`position` is the absolute day index). */
export const programDays = pgTable('program_days', {
  id: primaryId(),
  programId: uuid()
    .notNull()
    .references(() => programs.id, { onDelete: 'cascade' }),
  position: integer().notNull().default(0),
  weekNumber: integer(),
  dayOfWeek: integer(),
  isRestDay: boolean().notNull().default(false),
  title: text(),
  notes: text(),
  ...timestamps,
});

export const programItems = pgTable('program_items', {
  id: primaryId(),
  programDayId: uuid()
    .notNull()
    .references(() => programDays.id, { onDelete: 'cascade' }),
  position: integer().notNull().default(0),
  workoutId: uuid()
    .notNull()
    .references(() => workouts.id, { onDelete: 'restrict' }),
  notes: text(),
  ...timestamps,
});

/** Ordered videos for a video_playlist program. */
export const programVideoItems = pgTable('program_video_items', {
  id: primaryId(),
  programId: uuid()
    .notNull()
    .references(() => programs.id, { onDelete: 'cascade' }),
  position: integer().notNull().default(0),
  mediaAssetId: uuid()
    .notNull()
    .references(() => mediaAssets.id, { onDelete: 'restrict' }),
  title: text(),
  description: text(),
  durationSeconds: integer(),
  ...timestamps,
});
