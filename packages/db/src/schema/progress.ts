import { doublePrecision, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { measurementTypeEnum, primaryId, timestamps, workoutFormatEnum } from './_shared';
import { user } from './auth';
import { workouts } from './workouts';
import { exercises } from './exercises';

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
