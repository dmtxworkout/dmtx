import { createRoute, z } from '@hono/zod-openapi';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { collections, exercises, mediaAssets, mediaFolders, programs, skillLevels, skills, workouts } from '@dmtx/db';
import { MEDIA_PROCESSING_STATUS, paginated, paginationQuerySchema } from '@dmtx/schemas';
import type { Database } from '@dmtx/db';
import type { Env } from '../env';
import { createApp } from '../lib/openapi';
import { imagesDelete, imagesDirectUpload, imagesGet, streamCreateUpload, streamDelete } from '../lib/cloudflare';
import { refreshVideo, serializeAsset } from '../lib/media';
import { requireAdmin } from '../middleware/auth';

const kindEnum = z.enum(['video', 'image']);
const usageItem = z.object({
  /** What references the asset, and the field it is used as. */
  type: z.enum(['exercise', 'workout', 'program', 'skill', 'skillLevel', 'collection']),
  id: z.uuid(),
  name: z.string(),
  field: z.enum(['video', 'thumbnail']),
});
const statusEnum = z.enum(MEDIA_PROCESSING_STATUS);
const assetSchema = z.object({
  id: z.uuid(),
  kind: kindEnum,
  name: z.string(),
  altText: z.string().nullable(),
  /** The folder it is filed under; null = the library's root. */
  folderId: z.uuid().nullable(),
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
  /** The content that references the asset (lists and GET carry it). */
  usage: z.array(usageItem).optional(),
});
const createUploadRequest = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  kind: kindEnum,
  sizeBytes: z.number().int().positive(),
  /** Filed under this folder from the start (the folder the admin had open). */
  folderId: z.uuid().nullish(),
});
const folderSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  parentId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
const folderInput = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: z.uuid().nullish(),
});
const serializeFolder = (f: typeof mediaFolders.$inferSelect) => ({ id: f.id, name: f.name, parentId: f.parentId, createdAt: f.createdAt.toISOString() });
const createUploadResponse = z.object({
  asset: assetSchema,
  uploadUrl: z.string(),
  /** `form`: one multipart POST with the file (images); `tus`: resumable PATCHes (videos). */
  protocol: z.enum(['form', 'tus']),
});
const listQuery = paginationQuerySchema.extend({
  kind: kindEnum.optional(),
  /** Only the files in this folder (`root` for the ones in none). Ignored while searching: a search spans the library. */
  folder: z.string().optional(),
});
const updateRequest = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  altText: z.string().trim().max(500).nullable().optional(),
  folderId: z.uuid().nullable().optional(),
});

const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });

/** The media record exists from the moment an upload starts, as `uploading`, so the admin can keep working. */
async function createUploading(db: Database, externalId: string, name: string, kind: 'video' | 'image', contentType: string, sizeBytes: number, folderId: string | null) {
  const [row] = await db
    .insert(mediaAssets)
    .values({ externalId, name, kind, mimeType: contentType, sizeBytes, processingStatus: 'uploading', folderId })
    .returning();
  if (!row) throw new Error('No se pudo crear el asset de medios');
  return row;
}

/** Remove the file at Cloudflare (best effort; the row is handled by the caller). */
async function deleteRemote(env: Env, kind: 'video' | 'image', externalId: string) {
  if (kind === 'image') await imagesDelete(env, externalId);
  else await streamDelete(env, externalId);
}

type UsageItem = z.infer<typeof usageItem>;
/** Every piece of content that references each asset (shown before deleting; deleting is refused while any exists). */
async function usageForMany(db: Database, ids: string[]): Promise<Map<string, UsageItem[]>> {
  const map = new Map<string, UsageItem[]>();
  if (!ids.length) return map;
  const add = (assetId: string | null, item: UsageItem) => {
    if (!assetId || !ids.includes(assetId)) return;
    const list = map.get(assetId) ?? [];
    // The same rutina using one video in two sections is one use.
    if (!list.some((x) => x.type === item.type && x.id === item.id && x.field === item.field)) list.push(item);
    map.set(assetId, list);
  };
  const [ex, wo, pr, sk, lv, co] = await Promise.all([
    db
      .select({ id: exercises.id, name: exercises.name, video: exercises.demoVideoAssetId, thumb: exercises.thumbnailAssetId })
      .from(exercises)
      .where(and(isNull(exercises.deletedAt), or(inArray(exercises.demoVideoAssetId, ids), inArray(exercises.thumbnailAssetId, ids)))),
    db
      .select({
        id: workouts.id,
        name: workouts.name,
        video: workouts.videoAssetId,
        warmupVideo: workouts.warmupVideoAssetId,
        cooldownVideo: workouts.cooldownVideoAssetId,
        thumb: workouts.thumbnailAssetId,
        ownerProgramId: workouts.ownerProgramId,
        ownerSkillId: workouts.ownerSkillId,
        variantLabel: workouts.variantLabel,
        variantOfId: workouts.variantOfId,
      })
      .from(workouts)
      .where(
        and(
          isNull(workouts.deletedAt),
          or(
            inArray(workouts.videoAssetId, ids),
            inArray(workouts.warmupVideoAssetId, ids),
            inArray(workouts.cooldownVideoAssetId, ids),
            inArray(workouts.thumbnailAssetId, ids),
          ),
        ),
      ),
    db.select({ id: programs.id, name: programs.name, thumb: programs.thumbnailAssetId }).from(programs).where(and(isNull(programs.deletedAt), inArray(programs.thumbnailAssetId, ids))),
    db.select({ id: skills.id, name: skills.name, thumb: skills.thumbnailAssetId }).from(skills).where(and(isNull(skills.deletedAt), inArray(skills.thumbnailAssetId, ids))),
    db.select({ id: skillLevels.skillId, name: skillLevels.name, thumb: skillLevels.thumbnailAssetId }).from(skillLevels).where(inArray(skillLevels.thumbnailAssetId, ids)),
    db.select({ id: collections.id, name: collections.name, thumb: collections.thumbnailAssetId }).from(collections).where(and(isNull(collections.deletedAt), inArray(collections.thumbnailAssetId, ids))),
  ]);
  for (const r of ex) {
    add(r.video, { type: 'exercise', id: r.id, name: r.name, field: 'video' });
    add(r.thumb, { type: 'exercise', id: r.id, name: r.name, field: 'thumbnail' });
  }
  for (const r of wo) {
    // A rutina owned by a program or a skill is edited from its owner's page.
    const type = r.ownerProgramId ? ('program' as const) : r.ownerSkillId ? ('skill' as const) : ('workout' as const);
    // A variant is edited from its base rutina's page, under its label.
    const id = r.ownerProgramId ?? r.ownerSkillId ?? r.variantOfId ?? r.id;
    const name = r.variantOfId && r.variantLabel ? `${r.name} · ${r.variantLabel}` : r.name;
    for (const v of [r.video, r.warmupVideo, r.cooldownVideo]) add(v, { type, id, name, field: 'video' });
    add(r.thumb, { type, id, name, field: 'thumbnail' });
  }
  for (const r of pr) add(r.thumb, { type: 'program', id: r.id, name: r.name, field: 'thumbnail' });
  for (const r of sk) add(r.thumb, { type: 'skill', id: r.id, name: r.name, field: 'thumbnail' });
  for (const r of lv) add(r.thumb, { type: 'skillLevel', id: r.id, name: r.name, field: 'thumbnail' });
  for (const r of co) add(r.thumb, { type: 'collection', id: r.id, name: r.name, field: 'thumbnail' });
  return map;
}
const usageOf = async (db: Database, id: string) => (await usageForMany(db, [id])).get(id) ?? [];

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
    const { page, pageSize, search, kind, folder } = c.req.valid('query');
    const where = and(
      isNull(mediaAssets.deletedAt),
      kind ? eq(mediaAssets.kind, kind) : undefined,
      search ? ilike(mediaAssets.name, `%${search}%`) : undefined,
      // A search spans every folder; browsing shows one folder at a time.
      !search && folder ? (folder === 'root' ? isNull(mediaAssets.folderId) : eq(mediaAssets.folderId, folder)) : undefined,
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
    const usage = await usageForMany(db, fresh.map((r) => r.id));
    const data = await Promise.all(fresh.map(async (r) => ({ ...(await serializeAsset(c.env, r)), usage: usage.get(r.id) ?? [] })));
    return c.json({ data, total: totals?.value ?? 0, page, pageSize }, 200);
  },
);

// --- Folders ------------------------------------------------------------------
// Nested folders the admin sorts the library into. Deleting one moves what it
// holds (files and subfolders) up to its parent, so nothing is lost.
mediaRoute.openapi(
  createRoute({
    method: 'get',
    path: '/folders',
    tags: ['media'],
    responses: { 200: { description: 'Todas las carpetas', content: { 'application/json': { schema: z.object({ items: z.array(folderSchema) }) } } } },
  }),
  async (c) => {
    const rows = await c.get('db').select().from(mediaFolders).orderBy(asc(mediaFolders.name));
    return c.json({ items: rows.map(serializeFolder) }, 200);
  },
);
mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/folders',
    tags: ['media'],
    request: { body: { content: { 'application/json': { schema: folderInput } } } },
    responses: { 201: { description: 'Carpeta creada', content: { 'application/json': { schema: folderSchema } } } },
  }),
  async (c) => {
    const { name, parentId } = c.req.valid('json');
    const [row] = await c.get('db').insert(mediaFolders).values({ name, parentId: parentId ?? null }).returning();
    if (!row) throw new Error('No se pudo crear la carpeta');
    return c.json(serializeFolder(row), 201);
  },
);
mediaRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/folders/{id}',
    tags: ['media'],
    request: { params: idParam, body: { content: { 'application/json': { schema: folderInput.partial() } } } },
    responses: {
      200: { description: 'Carpeta actualizada', content: { 'application/json': { schema: folderSchema } } },
      400: { description: 'Movimiento imposible', content: { 'application/json': { schema: errorSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const db = c.get('db');
    if (body.parentId !== undefined && body.parentId !== null) {
      // A folder cannot go inside itself or one of its own subfolders.
      const all = await db.select({ id: mediaFolders.id, parentId: mediaFolders.parentId }).from(mediaFolders);
      let cursor: string | null = body.parentId;
      while (cursor) {
        if (cursor === id) return c.json({ error: 'Una carpeta no puede ir dentro de sí misma' }, 400);
        cursor = all.find((f) => f.id === cursor)?.parentId ?? null;
      }
    }
    const [row] = await db
      .update(mediaFolders)
      .set({ ...(body.name !== undefined ? { name: body.name } : {}), ...(body.parentId !== undefined ? { parentId: body.parentId ?? null } : {}), updatedAt: new Date() })
      .where(eq(mediaFolders.id, id))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json(serializeFolder(row), 200);
  },
);
mediaRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/folders/{id}',
    tags: ['media'],
    request: { params: idParam },
    responses: {
      204: { description: 'Carpeta eliminada; su contenido pasa a la carpeta de arriba' },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const db = c.get('db');
    const [folder] = await db.select().from(mediaFolders).where(eq(mediaFolders.id, id)).limit(1);
    if (!folder) return c.json({ error: 'No encontrado' }, 404);
    await db.update(mediaAssets).set({ folderId: folder.parentId }).where(eq(mediaAssets.folderId, id));
    await db.update(mediaFolders).set({ parentId: folder.parentId }).where(eq(mediaFolders.parentId, id));
    await db.delete(mediaFolders).where(eq(mediaFolders.id, id));
    return c.body(null, 204);
  },
);

// --- Move files into a folder (or to the root) -------------------------------
mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/move',
    tags: ['media'],
    request: { body: { content: { 'application/json': { schema: z.object({ ids: z.array(z.uuid()).min(1), folderId: z.uuid().nullable() }) } } } },
    responses: { 200: { description: 'Movidos', content: { 'application/json': { schema: z.object({ moved: z.number() }) } } } },
  }),
  async (c) => {
    const { ids, folderId } = c.req.valid('json');
    const rows = await c
      .get('db')
      .update(mediaAssets)
      .set({ folderId, updatedAt: new Date() })
      .where(and(inArray(mediaAssets.id, ids), isNull(mediaAssets.deletedAt)))
      .returning({ id: mediaAssets.id });
    return c.json({ moved: rows.length }, 200);
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
    const { filename, contentType, kind, sizeBytes, folderId } = c.req.valid('json');
    const db = c.get('db');
    if (kind === 'image') {
      const { id, uploadURL } = await imagesDirectUpload(c.env, filename);
      const row = await createUploading(db, id, filename, kind, contentType, sizeBytes, folderId ?? null);
      return c.json({ asset: await serializeAsset(c.env, row), uploadUrl: uploadURL, protocol: 'form' as const }, 200);
    }
    const { uid, uploadUrl } = await streamCreateUpload(c.env, filename, sizeBytes);
    const row = await createUploading(db, uid, filename, kind, contentType, sizeBytes, folderId ?? null);
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
    return c.json({ ...(await serializeAsset(c.env, await refreshVideo(db, c.env, row))), usage: await usageOf(db, id) }, 200);
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
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.altText !== undefined ? { altText: body.altText || null } : {}),
        ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
        updatedAt: new Date(),
      })
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
    return c.json({ items: await usageOf(c.get('db'), id) }, 200);
  },
);

// --- Replace: a newly uploaded file takes the place of this one ---------------
// The admin uploads the correction as a new asset; this moves its file into
// the existing row (same id, so every reference keeps pointing here), deletes
// the old file at Cloudflare and drops the temporary row.
mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/replace',
    tags: ['media'],
    request: { params: idParam, body: { content: { 'application/json': { schema: z.object({ sourceId: z.uuid() }) } } } },
    responses: {
      200: { description: 'Reemplazado', content: { 'application/json': { schema: assetSchema } } },
      400: { description: 'El archivo nuevo no sirve', content: { 'application/json': { schema: errorSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { sourceId } = c.req.valid('json');
    const db = c.get('db');
    const [target] = await db.select().from(mediaAssets).where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt))).limit(1);
    const [source] = await db.select().from(mediaAssets).where(and(eq(mediaAssets.id, sourceId), isNull(mediaAssets.deletedAt))).limit(1);
    if (!target || !source) return c.json({ error: 'No encontrado' }, 404);
    if (source.id === target.id) return c.json({ error: 'Es el mismo archivo' }, 400);
    if (source.kind !== target.kind) return c.json({ error: target.kind === 'video' ? 'Un video solo se puede reemplazar por otro video' : 'Una imagen solo se puede reemplazar por otra imagen' }, 400);
    if (source.processingStatus === 'uploading' || source.processingStatus === 'failed') return c.json({ error: 'El archivo nuevo no terminó de subir' }, 400);
    // external_id is unique: the temporary row lets go of it first, and the old
    // file is deleted only once the row points at the new one.
    await db.update(mediaAssets).set({ externalId: `replaced:${source.id}` }).where(eq(mediaAssets.id, sourceId));
    const [row] = await db
      .update(mediaAssets)
      .set({
        externalId: source.externalId,
        mimeType: source.mimeType,
        sizeBytes: source.sizeBytes,
        durationSeconds: source.durationSeconds,
        width: source.width,
        height: source.height,
        processingStatus: source.processingStatus,
        updatedAt: new Date(),
      })
      .where(eq(mediaAssets.id, id))
      .returning();
    // The temporary row goes without touching the file, which now belongs to the target.
    await db.delete(mediaAssets).where(eq(mediaAssets.id, sourceId));
    await deleteRemote(c.env, target.kind, target.externalId);
    return c.json({ ...(await serializeAsset(c.env, row!)), usage: await usageOf(db, id) }, 200);
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
      409: {
        description: 'En uso: el contenido que lo referencia debe soltarlo antes',
        content: { 'application/json': { schema: z.object({ error: z.string(), usage: z.array(usageItem) }) } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const db = c.get('db');
    const usage = await usageOf(db, id);
    if (usage.length) {
      return c.json({ error: `El archivo se usa en ${usage.length === 1 ? '1 contenido' : `${usage.length} contenidos`}; quítalo de ahí antes de eliminarlo.`, usage }, 409);
    }
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
