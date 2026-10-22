import { and, eq, inArray, isNull } from 'drizzle-orm';
import { mediaAssets } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import type { Env } from '../env';
import { imageUrl, streamEnableDownloads, streamGet, streamToken, streamUrls } from './cloudflare';

export type MediaRow = typeof mediaAssets.$inferSelect;

/** What the admin sees for an asset: URLs are null until it is ready. */
export async function serializeAsset(env: Env, r: MediaRow) {
  const ready = r.processingStatus === 'ready';
  let viewUrl: string | null = null;
  let thumbnailUrl: string | null = null;
  let embedUrl: string | null = null;
  if (ready && r.kind === 'image') {
    viewUrl = imageUrl(env, r.externalId, { w: 1600, fit: 'scale-down' });
    thumbnailUrl = imageUrl(env, r.externalId, { w: 400, h: 400, fit: 'cover' });
  } else if (ready) {
    const s = streamUrls(env, await streamToken(env, r.externalId));
    viewUrl = s.hls;
    thumbnailUrl = s.thumbnail;
    embedUrl = s.iframe;
  }
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    durationSeconds: r.durationSeconds,
    width: r.width,
    height: r.height,
    status: r.processingStatus,
    createdAt: r.createdAt.toISOString(),
    viewUrl,
    thumbnailUrl,
    embedUrl,
  };
}

/**
 * Ask Stream how a video is doing and record it: `ready` with its duration,
 * size and dimensions (and the MP4 requested), `failed` with the reason, or
 * still `processing`. Returns the row as it is afterwards.
 */
export async function refreshVideo(db: Database, env: Env, row: MediaRow): Promise<MediaRow> {
  if (row.kind !== 'video' || row.processingStatus !== 'processing') return row;
  const v = await streamGet(env, row.externalId);
  if (v.status.state === 'ready' || v.readyToStream) {
    await streamEnableDownloads(env, row.externalId);
    const [done] = await db
      .update(mediaAssets)
      .set({
        processingStatus: 'ready',
        durationSeconds: v.duration > 0 ? Math.round(v.duration) : row.durationSeconds,
        sizeBytes: v.size || row.sizeBytes,
        width: v.input?.width || null,
        height: v.input?.height || null,
        updatedAt: new Date(),
      })
      .where(eq(mediaAssets.id, row.id))
      .returning();
    return done ?? row;
  }
  if (v.status.state === 'error') {
    const [failed] = await db
      .update(mediaAssets)
      .set({ processingStatus: 'failed', updatedAt: new Date() })
      .where(eq(mediaAssets.id, row.id))
      .returning();
    return failed ?? row;
  }
  return row;
}

export interface ResolvedMedia {
  /** Image: delivery URL at 1200 px (the app rewrites `w=`); video: HLS manifest. */
  url: string;
  /** Video only: the MP4 for offline use. */
  downloadUrl: string | null;
}

/**
 * Batch-resolve media asset ids to URLs for the app. Nulls and duplicates are
 * ignored; the map only contains ids that resolved. An asset still uploading
 * or processing (or failed) does not resolve: the app never gets a link to a
 * file that isn't there yet.
 */
export async function resolveMediaUrls(
  db: Database,
  env: Env,
  ids: (string | null | undefined)[],
): Promise<Map<string, ResolvedMedia>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: mediaAssets.id, kind: mediaAssets.kind, externalId: mediaAssets.externalId })
    .from(mediaAssets)
    .where(and(inArray(mediaAssets.id, unique), isNull(mediaAssets.deletedAt), eq(mediaAssets.processingStatus, 'ready')));
  const entries = await Promise.all(
    rows.map(async (r): Promise<[string, ResolvedMedia]> => {
      if (r.kind === 'image') return [r.id, { url: imageUrl(env, r.externalId, { w: 1200, fit: 'scale-down' }), downloadUrl: null }];
      const s = streamUrls(env, await streamToken(env, r.externalId));
      return [r.id, { url: s.hls, downloadUrl: s.download }];
    }),
  );
  return new Map(entries);
}
