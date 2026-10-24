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
} from './_shared';
import { mediaAssets } from './media';
import { exercises } from './exercises';
import { skills } from './skills';
import { programs } from './programs';

/**
 * A workout (rutina) in three sections (warm-up, main, stretch), each written
 * (blocks with that `section`), a video (`warmupVideoAssetId`, `videoAssetId`,
 * `cooldownVideoAssetId`) or both — the app then lets the user follow the
 * class or be guided. `hasVideo` / `isGuided` say what the main section has,
 * for lists, filters and analytics; `format` is the main section's first
 * part's. Video durations come from media_assets.
 */
export const workouts = pgTable('workouts', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  // Derived on save from the main section, for lists, filters and analytics:
  // it has a video class / it has a written rutina the app guides. Both can be true.
  hasVideo: boolean().notNull().default(false),
  isGuided: boolean().notNull().default(false),
  format: workoutFormatEnum(),
  difficulty: difficultyEnum().notNull(),
  estimatedDurationSeconds: integer(),
  thumbnailAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  scoringGoal: jsonb().$type<Goal>(),
  // The text the admin wrote in the editor; blocks are derived from it on save.
  sourceText: text(),
  // A skill level's rutina belongs to the skill: edited there, hidden from the
  // catalog, deleted with it.
  ownerSkillId: uuid().references(() => skills.id, { onDelete: 'cascade' }),
  // A program day's rutina belongs to the program the same way.
  ownerProgramId: uuid().references(() => programs.id, { onDelete: 'cascade' }),
  videoAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  warmupVideoAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  cooldownVideoAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
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
