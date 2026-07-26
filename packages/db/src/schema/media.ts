import { bigint, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import type { MediaVariants } from '@dmtx/schemas';
import {
  mediaKindEnum,
  mediaProcessingStatusEnum,
  primaryId,
  softDelete,
  timestamps,
} from './_shared';

/** Single source of truth for every object stored in Cloudflare R2. */
export const mediaAssets = pgTable('media_assets', {
  id: primaryId(),
  r2Key: text().notNull().unique(),
  bucket: text(),
  kind: mediaKindEnum().notNull(),
  mimeType: text(),
  durationSeconds: integer(),
  width: integer(),
  height: integer(),
  sizeBytes: bigint({ mode: 'number' }),
  checksum: text(),
  processingStatus: mediaProcessingStatusEnum().notNull().default('uploaded'),
  variants: jsonb().$type<MediaVariants>().notNull().default([]),
  altText: text(),
  blurhash: text(),
  ...timestamps,
  ...softDelete,
});
