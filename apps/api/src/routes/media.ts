import { createRoute, z } from '@hono/zod-openapi';
import { AwsClient } from 'aws4fetch';
import { and, count, desc, eq, ilike, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { mediaAssets } from '@dmtx/db';
import { paginated, paginationQuerySchema, slugify } from '@dmtx/schemas';
import type { Env } from '../env';
import { createApp } from '../lib/openapi';
import { requireAdmin } from '../middleware/auth';

function r2Client(env: Env) {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: 'auto',
    service: 's3',
  });
}

function r2Endpoint(env: Env, key: string) {
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
}

/** Human display name from an r2 key like `image/<uuid>-nombre.png` → `nombre.png`. */
function displayName(r2Key: string): string {
  const base = r2Key.split('/').pop() ?? r2Key;
  return base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
}

async function viewUrl(env: Env, key: string): Promise<string> {
  const url = new URL(r2Endpoint(env, key));
  url.searchParams.set('X-Amz-Expires', '3600');
  const signed = await r2Client(env).sign(url.toString(), { method: 'GET', aws: { signQuery: true } });
  return signed.url;
}

const kindEnum = z.enum(['video', 'image']);

const presignRequest = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  kind: kindEnum,
});
const presignResponse = z.object({
  key: z.string(),
  uploadUrl: z.string(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
});
const createRequest = z.object({
  key: z.string().min(1),
  kind: kindEnum,
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
const assetSchema = z.object({
  id: z.uuid(),
  kind: kindEnum,
  name: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  viewUrl: z.string(),
  createdAt: z.iso.datetime(),
});
const listQuery = paginationQuerySchema.extend({ kind: kindEnum.optional() });
const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });

type MediaRow = typeof mediaAssets.$inferSelect;
async function serialize(env: Env, r: MediaRow) {
  return {
    id: r.id,
    kind: r.kind,
    name: displayName(r.r2Key),
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt.toISOString(),
    viewUrl: await viewUrl(env, r.r2Key),
  };
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
      search ? ilike(mediaAssets.r2Key, `%${search}%`) : undefined,
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
    const data = await Promise.all(rows.map((r) => serialize(c.env, r)));
    return c.json({ data, total: totals?.value ?? 0, page, pageSize }, 200);
  },
);

// --- Presign (no DB write; the asset is created after a successful upload) ----
mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/presign',
    tags: ['media'],
    request: { body: { content: { 'application/json': { schema: presignRequest } } } },
    responses: {
      200: {
        description: 'URL prefirmada para subir a R2',
        content: { 'application/json': { schema: presignResponse } },
      },
    },
  }),
  async (c) => {
    const { filename, contentType, kind } = c.req.valid('json');
    const base = slugify(filename.replace(/\.[^.]+$/, '')) || 'file';
    const ext = filename.includes('.') ? `.${filename.split('.').pop()}` : '';
    const key = `${kind}/${uuidv7()}-${base}${ext}`;
    const signed = await r2Client(c.env).sign(r2Endpoint(c.env, key), {
      method: 'PUT',
      headers: { 'content-type': contentType },
      aws: { signQuery: true },
    });
    return c.json(
      { key, uploadUrl: signed.url, method: 'PUT' as const, headers: { 'content-type': contentType } },
      200,
    );
  },
);

// --- Create the media record (call after the R2 PUT succeeds) ----------------
mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['media'],
    request: { body: { content: { 'application/json': { schema: createRequest } } } },
    responses: {
      201: { description: 'Asset creado', content: { 'application/json': { schema: assetSchema } } },
    },
  }),
  async (c) => {
    const { key, kind, mimeType, sizeBytes } = c.req.valid('json');
    const [row] = await c
      .get('db')
      .insert(mediaAssets)
      .values({
        r2Key: key,
        bucket: c.env.R2_BUCKET,
        kind,
        mimeType: mimeType ?? null,
        sizeBytes: sizeBytes ?? null,
        processingStatus: 'ready',
      })
      .returning();
    if (!row) throw new Error('No se pudo crear el asset de medios');
    return c.json(await serialize(c.env, row), 201);
  },
);

// --- Get one -----------------------------------------------------------------
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
    const [row] = await c
      .get('db')
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
      .limit(1);
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json(await serialize(c.env, row), 200);
  },
);

// --- Delete (soft) -----------------------------------------------------------
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
    const [row] = await c
      .get('db')
      .update(mediaAssets)
      .set({ deletedAt: new Date() })
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
      .returning({ id: mediaAssets.id });
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.body(null, 204);
  },
);
