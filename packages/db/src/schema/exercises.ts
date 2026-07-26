import { boolean, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import type { Tempo } from '@dmtx/schemas';
import {
  contentStatusEnum,
  difficultyEnum,
  measurementTypeEnum,
  muscleRoleEnum,
  primaryId,
  publishable,
  softDelete,
  timestamps,
} from './_shared';
import { mediaAssets } from './media';
import { equipment, muscles } from './taxonomy';

export const exercises = pgTable('exercises', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  cues: jsonb().$type<string[]>().notNull().default([]),
  difficulty: difficultyEnum().notNull(),
  measurementType: measurementTypeEnum().notNull(),
  isUnilateral: boolean().notNull().default(false),
  defaultTempo: jsonb().$type<Tempo>(),
  demoVideoAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  thumbnailAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  status: contentStatusEnum().notNull().default('draft'),
  ...publishable,
  ...timestamps,
  ...softDelete,
});

export const exerciseMuscles = pgTable(
  'exercise_muscles',
  {
    exerciseId: uuid()
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    muscleId: uuid()
      .notNull()
      .references(() => muscles.id, { onDelete: 'restrict' }),
    role: muscleRoleEnum().notNull(),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.muscleId] })],
);

export const exerciseEquipment = pgTable(
  'exercise_equipment',
  {
    exerciseId: uuid()
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    equipmentId: uuid()
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.equipmentId] })],
);
