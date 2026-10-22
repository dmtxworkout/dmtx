import { bigint, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { mediaKindEnum, mediaProcessingStatusEnum, primaryId, softDelete, timestamps } from './_shared';

/**
 * Single source of truth for every file hosted on Cloudflare: images live in
 * Cloudflare Images (resized on request), videos in Cloudflare Stream
 * (encoded to HLS, downloadable as MP4). `external_id` is the Images id or
 * the Stream uid; URLs are built from it and the account's delivery codes.
 */
export const mediaAssets = pgTable('media_assets', {
  id: primaryId(),
  externalId: text().notNull().unique(),
  /** The original file name, as the admin sees it in the library. */
  name: text().notNull(),
  kind: mediaKindEnum().notNull(),
  mimeType: text(),
  durationSeconds: integer(),
  width: integer(),
  height: integer(),
  sizeBytes: bigint({ mode: 'number' }),
  processingStatus: mediaProcessingStatusEnum().notNull().default('uploading'),
  altText: text(),
  ...timestamps,
  ...softDelete,
});
