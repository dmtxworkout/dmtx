import { bigint, integer, pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { mediaKindEnum, mediaProcessingStatusEnum, primaryId, softDelete, timestamps } from './_shared';

/**
 * Single source of truth for every file hosted on Cloudflare: images live in
 * Cloudflare Images (resized on request), videos in Cloudflare Stream
 * (encoded to HLS, downloadable as MP4). `external_id` is the Images id or
 * the Stream uid; URLs are built from it and the account's delivery codes.
 */
/** Folders the admin sorts the library into (nested; a file is in at most one). */
export const mediaFolders = pgTable('media_folders', {
  id: primaryId(),
  name: text().notNull(),
  parentId: uuid().references((): AnyPgColumn => mediaFolders.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const mediaAssets = pgTable('media_assets', {
  id: primaryId(),
  externalId: text().notNull().unique(),
  // Where it was uploaded. A database branch also lists its parent's files, and only
  // the environment that uploaded a file may delete it at Cloudflare.
  uploadedIn: text().notNull().default('production'),
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
  /** The folder it is filed under; null = the library's root. */
  folderId: uuid().references(() => mediaFolders.id, { onDelete: 'set null' }),
  ...timestamps,
  ...softDelete,
});
