import { createRoute, z } from '@hono/zod-openapi';
import { and, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { collections, exercises, mediaAssets, programs, skillLevels, skills, workouts } from '@dmtx/db';
import { MEDIA_PROCESSING_STATUS, paginated, paginationQuerySchema } from '@dmtx/schemas';
import type { Database } from '@dmtx/db';
import type { Env } from '../env';
import { createApp } from '../lib/openapi';
import { imagesDelete, imagesDirectUpload, imagesGet, streamCreateUpload, streamDelete } from '../lib/cloudflare';
import { refreshVideo, serializeAsset } from '../lib/media';
import { requireAdmin } from '../middleware/auth';

const kindEnum = z.enum(['video', 'image']);
const statusEnum = z.enum(MEDIA_PROCESSING_STATUS);
const assetSchema = z.object({
  id: z.uuid(),
  kind: kindEnum,
  name: z.string(),
  altText: z.string().nullable(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  /** `uploading` until the bytes are in, `processing` while Stream encodes; only `ready` assets are served to the app. */
  status: statusEnum,
  /** Image: delivery URL (1600 px); video: HLS manifest. Null until ready. */
  viewUrl: z.string().nullable(),
  /** A 400 px square (image) or Stream's poster frame (video). Null until ready. */
  thumbnailUrl: z.string().nullable(),
  /** Video only: Stream's player, for an iframe. */
  embedUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
const createUploadRequest = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  kind: kindEnum,
  sizeBytes: z.number().int().positive(),
});
const createUploadResponse = z.object({
  asset: assetSchema,
  uploadUrl: z.string(),
  /** `form`: one multipart POST with the file (images); `tus`: resumable PATCHes (videos). */
  protocol: z.enum(['form', 'tus']),
});
const listQuery = paginationQuerySchema.extend({ kind: kindEnum.optional() });
const updateRequest = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  altText: z.string().trim().max(500).nullable().optional(),
});
const usageItem = z.object({
  /** What references the asset, and the field it is used as. */
  type: z.enum(['exercise', 'workout', 'program', 'skill', 'skillLevel', 'collection']),
  id: z.uuid(),
  name: z.string(),
  field: z.enum(['video', 'thumbnail']),
});
const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });

/** The media record exists from the moment an upload starts, as `uploading`, so the admin can keep working. */
async function createUploading(db: Database, externalId: string, name: string, kind: 'video' | 'image', contentType: string, sizeBytes: number) {
  const [row] = await db
    .insert(mediaAssets)
    .values({ externalId, name, kind, mimeType: contentType, sizeBytes, processingStatus: 'uploading' })
    .returning();
  if (!row) throw new Error('No se pudo crear el asset de medios');
  return row;
}

/** Remove the file at Cloudflare (best effort; the row is handled by the caller). */
async function deleteRemote(env: Env, kind: 'video' | 'image', externalId: string) {
  if (kind === 'image') await imagesDelete(env, externalId);
  else await streamDelete(env, externalId);
}

export const mediaRoute = createApp();
mediaRoute.use('*', requireAdmin);

// --- List --------------------------------------------------------------------
mediaRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['media'],
    request: { query: listQuery },
    responses: {
      200: {
        description: 'Biblioteca de medios',
        content: { 'application/json': { schema: paginated(assetSchema) } },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { page, pageSize, search, kind } = c.req.valid('query');
    const where = and(
      isNull(mediaAssets.deletedAt),
      kind ? eq(mediaAssets.kind, kind) : undefined,
      search ? ilike(mediaAssets.name, `%${search}%`) : undefined,
    );
    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(mediaAssets)
        .where(where)
        .orderBy(desc(mediaAssets.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(mediaAssets).where(where),
    ]);
    // Videos Stream is still encoding: ask how they are doing (a few per request).
    let polls = 0;
    const fresh = await Promise.all(
      rows.map((r) => (r.kind === 'video' && r.processingStatus === 'processing' && polls++ < 5 ? refreshVideo(db, c.env, r).catch(() => r) : r)),
    );
    const data = await Promise.all(fresh.map((r) => serializeAsset(c.env, r)));
    return c.json({ data, total: totals?.value ?? 0, page, pageSize }, 200);
  },
);

// --- Start an upload: the record is created right away -----------------------
// Images: a one-time URL the browser POSTs the file to. Videos: a resumable
// tus upload the browser drives in chunks. In both cases the bytes go straight
// to Cloudflare; the Worker never sees them.
mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/uploads',
    tags: ['media'],
    request: { body: { content: { 'application/json': { schema: createUploadRequest } } } },
    responses: {
      200: { description: 'Subida abierta', content: { 'application/json': { schema: createUploadResponse } } },
    },
  }),
  async (c) => {
    const { filename, contentType, kind, sizeBytes } = c.req.valid('json');
    const db = c.get('db');
    if (kind === 'image') {
      const { id, uploadURL } = await imagesDirectUpload(c.env, filename);
      const row = await createUploading(db, id, filename, kind, contentType, sizeBytes);
      return c.json({ asset: await serializeAsset(c.env, row), uploadUrl: uploadURL, protocol: 'form' as const }, 200);
    }
    const { uid, uploadUrl } = await streamCreateUpload(c.env, filename, sizeBytes);
    const row = await createUploading(db, uid, filename, kind, contentType, sizeBytes);
    return c.json({ asset: await serializeAsset(c.env, row), uploadUrl, protocol: 'tus' as const }, 200);
  },
);

// --- Complete: the bytes are at Cloudflare -----------------------------------
// An image is ready at once; a video goes to `processing` until Stream has
// encoded it (the admin polls GET /media/:id, or the webhook tells us).
mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/complete',
    tags: ['media'],
    request: { params: idParam },
    responses: {
      200: { description: 'Asset listo o en proceso', content: { 'application/json': { schema: assetSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const db = c.get('db');
    const [row] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
      .limit(1);
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    if (row.processingStatus !== 'uploading') return c.json(await serializeAsset(c.env, row), 200);
    if (row.kind === 'image') {
      const info = await imagesGet(c.env, row.externalId);
      if (info.draft) throw new Error('Cloudflare Images no recibió el archivo');
      const [done] = await db
        .update(mediaAssets)
        .set({ processingStatus: 'ready', updatedAt: new Date() })
        .where(eq(mediaAssets.id, id))
        .returning();
      return c.json(await serializeAsset(c.env, done!), 200);
    }
    const [processing] = await db
      .update(mediaAssets)
      .set({ processingStatus: 'processing', updatedAt: new Date() })
      .where(eq(mediaAssets.id, id))
      .returning();
    // A short video may be ready already.
    return c.json(await serializeAsset(c.env, await refreshVideo(db, c.env, processing!)), 200);
  },
);

// --- Abort: the upload broke or was cancelled; the record goes (references are set null) ---
// Also for a video Stream is still encoding: cancelling then drops the encode and the file.
mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/abort',
    tags: ['media'],
    request: { params: idParam },
    responses: {
      204: { description: 'Subida descartada' },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const db = c.get('db');
    const [row] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), inArray(mediaAssets.processingStatus, ['uploading', 'processing'])))
      .limit(1);
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    await deleteRemote(c.env, row.kind, row.externalId);
    await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
    return c.body(null, 204);
  },
);

// --- Get one (a processing video is checked with Stream on the way) ----------
mediaRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['media'],
    request: { params: idParam },
    responses: {
      200: { description: 'Asset', content: { 'application/json': { schema: assetSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const db = c.get('db');
    const [row] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
      .limit(1);
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json(await serializeAsset(c.env, await refreshVideo(db, c.env, row)), 200);
  },
);

// --- Rename / alt text -----------------------------------------------------
mediaRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['media'],
    request: { params: idParam, body: { content: { 'application/json': { schema: updateRequest } } } },
    responses: {
      200: { description: 'Asset actualizado', content: { 'application/json': { schema: assetSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const db = c.get('db');
    const [row] = await db
      .update(mediaAssets)
      .set({ ...(body.name !== undefined ? { name: body.name } : {}), ...(body.altText !== undefined ? { altText: body.altText || null } : {}), updatedAt: new Date() })
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json(await serializeAsset(c.env, row), 200);
  },
);

// --- Where an asset is used (so deleting it is an informed choice) ---------
mediaRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/usage',
    tags: ['media'],
    request: { params: idParam },
    responses: {
      200: { description: 'Contenido que usa el asset', content: { 'application/json': { schema: z.object({ items: z.array(usageItem) }) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const db = c.get('db');
    type Item = z.infer<typeof usageItem>;
    const [ex, wo, pr, sk, lv, co] = await Promise.all([
      db
        .select({ id: exercises.id, name: exercises.name, video: exercises.demoVideoAssetId, thumb: exercises.thumbnailAssetId })
        .from(exercises)
        .where(and(isNull(exercises.deletedAt), or(eq(exercises.demoVideoAssetId, id), eq(exercises.thumbnailAssetId, id)))),
      db
        .select({
          id: workouts.id,
          name: workouts.name,
          video: workouts.videoAssetId,
          thumb: workouts.thumbnailAssetId,
          ownerProgramId: workouts.ownerProgramId,
          ownerSkillId: workouts.ownerSkillId,
        })
        .from(workouts)
        .where(and(isNull(workouts.deletedAt), or(eq(workouts.videoAssetId, id), eq(workouts.thumbnailAssetId, id)))),
      db.select({ id: programs.id, name: programs.name }).from(programs).where(and(isNull(programs.deletedAt), eq(programs.thumbnailAssetId, id))),
      db.select({ id: skills.id, name: skills.name }).from(skills).where(and(isNull(skills.deletedAt), eq(skills.thumbnailAssetId, id))),
      db
        .select({ id: skillLevels.skillId, name: skillLevels.name })
        .from(skillLevels)
        .where(eq(skillLevels.thumbnailAssetId, id)),
      db.select({ id: collections.id, name: collections.name }).from(collections).where(and(isNull(collections.deletedAt), eq(collections.thumbnailAssetId, id))),
    ]);
    const items: Item[] = [
      ...ex.map((r) => ({ type: 'exercise' as const, id: r.id, name: r.name, field: r.video === id ? ('video' as const) : ('thumbnail' as const) })),
      // A rutina owned by a program or a skill is edited from its owner's page.
      ...wo.map((r) => ({
        type: r.ownerProgramId ? ('program' as const) : r.ownerSkillId ? ('skill' as const) : ('workout' as const),
        id: r.ownerProgramId ?? r.ownerSkillId ?? r.id,
        name: r.name,
        field: r.video === id ? ('video' as const) : ('thumbnail' as const),
      })),
      ...pr.map((r) => ({ type: 'program' as const, id: r.id, name: r.name, field: 'thumbnail' as const })),
      ...sk.map((r) => ({ type: 'skill' as const, id: r.id, name: r.name, field: 'thumbnail' as const })),
      ...lv.map((r) => ({ type: 'skillLevel' as const, id: r.id, name: r.name, field: 'thumbnail' as const })),
      ...co.map((r) => ({ type: 'collection' as const, id: r.id, name: r.name, field: 'thumbnail' as const })),
    ];
    return c.json({ items }, 200);
  },
);

// --- Delete: the file goes at Cloudflare too (storage is billed) -------------
mediaRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['media'],
    request: { params: idParam },
    responses: {
      204: { description: 'Eliminado' },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const db = c.get('db');
    const [row] = await db
      .update(mediaAssets)
      .set({ deletedAt: new Date() })
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    await deleteRemote(c.env, row.kind, row.externalId);
    return c.body(null, 204);
  },
);
