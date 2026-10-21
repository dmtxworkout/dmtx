import { pgTable, text } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';

/** Reusable rutina text blocks ("bloques reutilizables") the admin editor offers in its suggestions. */
export const reusableBlocks = pgTable('reusable_blocks', {
  id: primaryId(),
  name: text().notNull(),
  text: text().notNull(),
  ...timestamps,
});
