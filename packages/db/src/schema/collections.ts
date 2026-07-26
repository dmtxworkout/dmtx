import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import {
  collectionLayoutEnum,
  contentStatusEnum,
  primaryId,
  publishable,
  softDelete,
  timestamps,
} from './_shared';
import { mediaAssets } from './media';
import { workouts } from './workouts';
import { programs } from './programs';
import { skills } from './skills';

/** A Netflix-style browse row that can mix content types. */
export const collections = pgTable('collections', {
  id: primaryId(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  layout: collectionLayoutEnum().notNull().default('row'),
  position: integer().notNull().default(0),
  thumbnailAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  status: contentStatusEnum().notNull().default('draft'),
  ...publishable,
  ...timestamps,
  ...softDelete,
});

/**
 * Polymorphic membership: exactly one of workout/program/skill is set (enforced
 * by CHECK), preserving real FK integrity across all content types.
 */
export const collectionItems = pgTable(
  'collection_items',
  {
    id: primaryId(),
    collectionId: uuid()
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
    workoutId: uuid().references(() => workouts.id, { onDelete: 'cascade' }),
    programId: uuid().references(() => programs.id, { onDelete: 'cascade' }),
    skillId: uuid().references(() => skills.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [
    check(
      'collection_item_exactly_one_target',
      sql`(
        (case when ${t.workoutId} is not null then 1 else 0 end) +
        (case when ${t.programId} is not null then 1 else 0 end) +
        (case when ${t.skillId} is not null then 1 else 0 end)
      ) = 1`,
    ),
  ],
);
