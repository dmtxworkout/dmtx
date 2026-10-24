import { doublePrecision, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { measurementTypeEnum, primaryId, timestamps, trainingModeEnum, workoutFormatEnum } from './_shared';
import { user } from './auth';
import { workouts } from './workouts';
import { exercises } from './exercises';
import { skills } from './skills';

/**
 * One workout session performed by a user. Names are snapshotted so history
 * survives edits/deletes of the underlying content.
 */
export const workoutLogs = pgTable(
  'workout_logs',
  {
    id: primaryId(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workoutId: uuid().references(() => workouts.id, { onDelete: 'set null' }),
    workoutName: text().notNull(),
    format: workoutFormatEnum(),
    // Followed the video class or guided exercise by exercise (null: logged before modes existed).
    mode: trainingModeEnum(),
    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    durationSeconds: integer(),
    roundsCompleted: integer(),
    // kg (decimal) so weights entered in lb/kg round-trip without loss.
    totalVolume: doublePrecision(),
    notes: text(),
    ...timestamps,
  },
  (t) => [index('workout_logs_user_idx').on(t.userId, t.createdAt)],
);

/** One logged mark within a session (per exercise instance / round / set). */
export const setResults = pgTable(
  'set_results',
  {
    id: primaryId(),
    workoutLogId: uuid()
      .notNull()
      .references(() => workoutLogs.id, { onDelete: 'cascade' }),
    exerciseId: uuid().references(() => exercises.id, { onDelete: 'set null' }),
    exerciseName: text().notNull(),
    position: integer().notNull().default(0),
    round: integer(),
    setNumber: integer(),
    measure: measurementTypeEnum(),
    reps: integer(),
    seconds: integer(),
    distanceMeters: integer(),
    loadKg: doublePrecision(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('set_results_log_idx').on(t.workoutLogId)],
);

/**
 * How far a user got in a skill: the number of levels unlocked (1 = only the
 * first). Advanced by the server when a logged session meets the current
 * level's goals.
 */
export const skillProgress = pgTable(
  'skill_progress',
  {
    id: primaryId(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    skillId: uuid()
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    unlockedLevels: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [uniqueIndex('skill_progress_user_skill_idx').on(t.userId, t.skillId)],
);
