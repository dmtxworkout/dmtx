import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { mediaAssets } from './media';

/** A muscle tag, e.g. "Pierna" or "Pecho": the app filters and labels rutinas by it. */
export const muscles = pgTable('muscles', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
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
