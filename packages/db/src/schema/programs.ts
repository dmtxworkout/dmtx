import { boolean, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { contentStatusEnum, difficultyEnum, primaryId, publishable, softDelete, timestamps } from './_shared';
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
 * A program: a calendar in whole weeks (`programDays`, seven per week). Each
 * day is a rest day or has its own rutina, written in the editor and owned by
 * the program (`workouts.owner_program_id`), structured or a video.
 */
export const programs = pgTable('programs', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  difficulty: difficultyEnum().notNull(),
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

/** A single day of a program: `position` is the absolute day index (week = position / 7). */
export const programDays = pgTable('program_days', {
  id: primaryId(),
  programId: uuid()
    .notNull()
    .references(() => programs.id, { onDelete: 'cascade' }),
  position: integer().notNull().default(0),
  isRestDay: boolean().notNull().default(false),
  title: text(),
  notes: text(),
  // The day's rutina (written in the editor, owned by the program); null on a rest day.
  workoutId: uuid().references(() => workouts.id, { onDelete: 'set null' }),
  ...timestamps,
});
