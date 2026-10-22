import { createRoute, z } from '@hono/zod-openapi';
import { and, count, desc, eq, ilike, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { mediaAssets } from '@dmtx/db';
import { paginated, paginationQuerySchema, slugify } from '@dmtx/schemas';
import type { Env } from '../env';
import { createApp } from '../lib/openapi';
import { displayName, r2Client, r2Endpoint, viewUrl } from '../lib/media';
import { requireAdmin } from '../middleware/auth';

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

// --- Multipart upload (big files: parts in parallel, each one retried on its own)
// Start creates the S3 multipart upload and returns its id; sign presigns one
// PUT per part; complete asks R2 for the parts it received (ListParts, so the
// browser never needs to read ETag headers through CORS) and assembles the
// object. The media record is created afterwards with POST /media as usual.
const multipartStartRequest = presignRequest;
const multipartStartResponse = z.object({ key: z.string(), uploadId: z.string() });
const multipartSignRequest = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(10000),
});
const multipartSignResponse = z.object({ urls: z.array(z.object({ partNumber: z.number(), url: z.string() })) });
const multipartRef = z.object({ key: z.string().min(1), uploadId: z.string().min(1) });
const okResponse = z.object({ ok: z.literal(true) });

function xmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1]!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : null;
}
const xmlText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** What R2 said went wrong, for the error message. */
const r2Error = (xml: string) => [xmlTag(xml, 'Code'), xmlTag(xml, 'Message')].filter(Boolean).join(': ');

mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/multipart/start',
    tags: ['media'],
    request: { body: { content: { 'application/json': { schema: multipartStartRequest } } } },
    responses: {
      200: { description: 'Subida multipart iniciada', content: { 'application/json': { schema: multipartStartResponse } } },
    },
  }),
  async (c) => {
    const { filename, contentType, kind } = c.req.valid('json');
    const base = slugify(filename.replace(/\.[^.]+$/, '')) || 'file';
    const ext = filename.includes('.') ? `.${filename.split('.').pop()}` : '';
    const key = `${kind}/${uuidv7()}-${base}${ext}`;
    const res = await r2Client(c.env).fetch(`${r2Endpoint(c.env, key)}?uploads`, {
      method: 'POST',
      headers: { 'content-type': contentType },
    });
    const xml = await res.text();
    const uploadId = res.ok ? xmlTag(xml, 'UploadId') : null;
    if (!uploadId) throw new Error(`R2 no inició la subida (${res.status}${r2Error(xml) ? `: ${r2Error(xml)}` : ''})`);
    return c.json({ key, uploadId }, 200);
  },
);

mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/multipart/sign',
    tags: ['media'],
    request: { body: { content: { 'application/json': { schema: multipartSignRequest } } } },
    responses: {
      200: { description: 'URLs prefirmadas, una por parte', content: { 'application/json': { schema: multipartSignResponse } } },
    },
  }),
  async (c) => {
    const { key, uploadId, partNumbers } = c.req.valid('json');
    const client = r2Client(c.env);
    const urls = await Promise.all(
      partNumbers.map(async (partNumber) => {
        const url = new URL(r2Endpoint(c.env, key));
        url.searchParams.set('partNumber', String(partNumber));
        url.searchParams.set('uploadId', uploadId);
        url.searchParams.set('X-Amz-Expires', '7200');
        const signed = await client.sign(url.toString(), { method: 'PUT', aws: { signQuery: true } });
        return { partNumber, url: signed.url };
      }),
    );
    return c.json({ urls }, 200);
  },
);

mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/multipart/complete',
    tags: ['media'],
    request: { body: { content: { 'application/json': { schema: multipartRef } } } },
    responses: {
      200: { description: 'Objeto ensamblado en R2', content: { 'application/json': { schema: okResponse } } },
    },
  }),
  async (c) => {
    const { key, uploadId } = c.req.valid('json');
    const client = r2Client(c.env);
    const endpoint = r2Endpoint(c.env, key);
    // ListParts, paginated by part-number-marker.
    const parts: { partNumber: number; etag: string }[] = [];
    let marker: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const url = new URL(endpoint);
      url.searchParams.set('uploadId', uploadId);
      url.searchParams.set('max-parts', '1000');
      if (marker) url.searchParams.set('part-number-marker', marker);
      const res = await client.fetch(url.toString(), { method: 'GET' });
      const xml = await res.text();
      if (!res.ok) throw new Error(`R2 no listó las partes (${res.status}${r2Error(xml) ? `: ${r2Error(xml)}` : ''})`);
      for (const m of xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
        const n = Number(xmlTag(m[1]!, 'PartNumber'));
        const etag = xmlTag(m[1]!, 'ETag');
        if (n && etag) parts.push({ partNumber: n, etag });
      }
      if (xmlTag(xml, 'IsTruncated') !== 'true') break;
      marker = xmlTag(xml, 'NextPartNumberMarker');
      if (!marker) break;
    }
    if (!parts.length) throw new Error('R2 no recibió ninguna parte');
    parts.sort((a, b) => a.partNumber - b.partNumber);
    const body = `<CompleteMultipartUpload>${parts
      .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${xmlText(p.etag)}</ETag></Part>`)
      .join('')}</CompleteMultipartUpload>`;
    const res = await client.fetch(`${endpoint}?uploadId=${encodeURIComponent(uploadId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/xml' },
      body,
    });
    const xml = await res.text();
    if (!res.ok || xml.includes('<Error>')) throw new Error(`R2 no pudo ensamblar el archivo (${res.status}${r2Error(xml) ? `: ${r2Error(xml)}` : ''})`);
    return c.json({ ok: true as const }, 200);
  },
);

mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/multipart/abort',
    tags: ['media'],
    request: { body: { content: { 'application/json': { schema: multipartRef } } } },
    responses: {
      200: { description: 'Subida descartada; R2 borra las partes', content: { 'application/json': { schema: okResponse } } },
    },
  }),
  async (c) => {
    const { key, uploadId } = c.req.valid('json');
    await r2Client(c.env).fetch(`${r2Endpoint(c.env, key)}?uploadId=${encodeURIComponent(uploadId)}`, { method: 'DELETE' });
    return c.json({ ok: true as const }, 200);
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
