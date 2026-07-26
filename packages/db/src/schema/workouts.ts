import { boolean, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { FormatConfig, Goal, LoadPrescription, Tempo } from '@dmtx/schemas';
import {
  blockTypeEnum,
  contentStatusEnum,
  difficultyEnum,
  primaryId,
  publishable,
  softDelete,
  timestamps,
  workoutFormatEnum,
  workoutTypeEnum,
} from './_shared';
import { mediaAssets } from './media';
import { exercises } from './exercises';

/**
 * A workout (rutina). Polymorphic via `type`:
 *  - structured: built from blocks/items; `format` + `formatConfig` drive timing.
 *  - video: a single video (`videoAssetId`); `format`/blocks are null.
 */
export const workouts = pgTable('workouts', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  type: workoutTypeEnum().notNull(),
  format: workoutFormatEnum(),
  difficulty: difficultyEnum().notNull(),
  estimatedDurationSeconds: integer(),
  thumbnailAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  formatConfig: jsonb().$type<FormatConfig>(),
  scoringGoal: jsonb().$type<Goal>(),
  videoAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  videoDurationSeconds: integer(),
  status: contentStatusEnum().notNull().default('draft'),
  ...publishable,
  ...timestamps,
  ...softDelete,
});

/** An ordered group of items within a structured workout (superset/circuit/…). */
export const workoutBlocks = pgTable('workout_blocks', {
  id: primaryId(),
  workoutId: uuid()
    .notNull()
    .references(() => workouts.id, { onDelete: 'cascade' }),
  position: integer().notNull().default(0),
  type: blockTypeEnum().notNull().default('single'),
  rounds: integer(),
  restAfterSeconds: integer(),
  label: text(),
  notes: text(),
  ...timestamps,
});

/** One exercise instance (a prescription) inside a block. */
export const workoutItems = pgTable('workout_items', {
  id: primaryId(),
  blockId: uuid()
    .notNull()
    .references(() => workoutBlocks.id, { onDelete: 'cascade' }),
  position: integer().notNull().default(0),
  exerciseId: uuid()
    .notNull()
    .references(() => exercises.id, { onDelete: 'restrict' }),
  // EMOM/Tabata: which minute/interval this item belongs to
  intervalIndex: integer(),
  sets: integer(),
  reps: integer(),
  workSeconds: integer(),
  distanceMeters: integer(),
  restBetweenSeconds: integer(),
  tempoOverride: jsonb().$type<Tempo>(),
  loadPrescription: jsonb().$type<LoadPrescription>(),
  perSide: boolean().notNull().default(false),
  goal: jsonb().$type<Goal>(),
  notes: text(),
  ...timestamps,
});
