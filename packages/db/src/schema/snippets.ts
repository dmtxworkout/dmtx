import { pgTable, text } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';

/** Reusable rutina text blocks the admin editor offers in its suggestions. */
export const rutinaSnippets = pgTable('rutina_snippets', {
  id: primaryId(),
  name: text().notNull(),
  text: text().notNull(),
  ...timestamps,
});
