import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { muscleZoneEnum, primaryId, timestamps } from './_shared';
import { mediaAssets } from './media';

/** A muscle tag, e.g. "Bíceps", in a body zone (Brazos): the app browses rutinas by zone and muscle. */
export const muscles = pgTable('muscles', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  zone: muscleZoneEnum(),
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
