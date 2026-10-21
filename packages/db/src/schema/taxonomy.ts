import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { mediaAssets } from './media';

/** Top-level muscle grouping for browse/filter, e.g. "Espalda". */
export const muscleGroups = pgTable('muscle_groups', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(), // Spanish display
  position: integer().notNull().default(0),
  ...timestamps,
});

/** Specific muscle for exercise targeting, e.g. "Dorsal ancho". */
export const muscles = pgTable('muscles', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  muscleGroupId: uuid()
    .notNull()
    .references(() => muscleGroups.id, { onDelete: 'restrict' }),
  position: integer().notNull().default(0),
  ...timestamps,
});

export const equipment = pgTable('equipment', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  iconAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  position: integer().notNull().default(0),
  ...timestamps,
});
