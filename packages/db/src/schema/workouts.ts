import { boolean, integer, jsonb, pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { FormatConfig, Goal, LoadPrescription, Tempo } from '@dmtx/schemas';
import {
  blockKindEnum,
  blockSectionEnum,
  blockTypeEnum,
  contentStatusEnum,
  difficultyEnum,
  itemKindEnum,
  measurementTypeEnum,
  primaryId,
  publishable,
  softDelete,
  timestamps,
  workoutFormatEnum,
  workoutKindEnum,
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
  kind: workoutKindEnum().notNull().default('rutina'),
  type: workoutTypeEnum().notNull(),
  format: workoutFormatEnum(),
  difficulty: difficultyEnum().notNull(),
  estimatedDurationSeconds: integer(),
  thumbnailAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  scoringGoal: jsonb().$type<Goal>(),
  videoAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  videoDurationSeconds: integer(),
  // A variant (RX / Escalada / …) is a full rutina linked to its base rutina.
  variantOfId: uuid().references((): AnyPgColumn => workouts.id, { onDelete: 'cascade' }),
  variantLabel: text(),
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
  // A part's children point at it; top-level blocks have no parent.
  parentBlockId: uuid().references((): AnyPgColumn => workoutBlocks.id, { onDelete: 'cascade' }),
  position: integer().notNull().default(0),
  kind: blockKindEnum().notNull().default('group'),
  // A part (kind 'part') plays on its own format; null for ordinary blocks.
  format: workoutFormatEnum(),
  formatConfig: jsonb().$type<FormatConfig>(),
  section: blockSectionEnum().notNull().default('main'),
  type: blockTypeEnum().notNull().default('single'),
  rounds: integer(),
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
  kind: itemKindEnum().notNull().default('exercise'),
  exerciseId: uuid().references(() => exercises.id, { onDelete: 'restrict' }),
  // Per-item measurement override; null falls back to the exercise's type.
  measure: measurementTypeEnum(),
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
