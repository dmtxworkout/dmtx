import { createRoute, z } from '@hono/zod-openapi';
import { AwsClient } from 'aws4fetch';
import { and, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { mediaAssets } from '@dmtx/db';
import { slugify } from '@dmtx/schemas';
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

const presignRequest = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  kind: z.enum(['video', 'image']),
});

const presignResponse = z.object({
  assetId: z.string(),
  key: z.string(),
  uploadUrl: z.string(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
});

const assetResponse = z.object({
  id: z.string(),
  kind: z.enum(['video', 'image']),
  mimeType: z.string().nullable(),
  viewUrl: z.string(),
});

const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });

export const mediaRoute = createApp();
mediaRoute.use('*', requireAdmin);

/**
 * Presign a direct-to-R2 upload AND create the media_assets row it will fill.
 * Returns the asset id so the caller can link it (e.g. exercise thumbnail).
 * The browser must PUT with the exact `headers` returned (Content-Type is signed).
 */
mediaRoute.openapi(
  createRoute({
    method: 'post',
    path: '/presign',
    tags: ['media'],
    request: { body: { content: { 'application/json': { schema: presignRequest } } } },
    responses: {
      200: {
        description: 'URL prefirmada + asset creado',
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

    const [asset] = await c
      .get('db')
      .insert(mediaAssets)
      .values({
        r2Key: key,
        bucket: c.env.R2_BUCKET,
        kind,
        mimeType: contentType,
        processingStatus: 'ready',
      })
      .returning({ id: mediaAssets.id });
    if (!asset) throw new Error('No se pudo crear el asset de medios');

    return c.json(
      {
        assetId: asset.id,
        key,
        uploadUrl: signed.url,
        method: 'PUT' as const,
        headers: { 'content-type': contentType },
      },
      200,
    );
  },
);

/** Return an asset + a short-lived presigned GET URL for display. */
mediaRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['media'],
    request: { params: idParam },
    responses: {
      200: {
        description: 'Asset con URL de visualización',
        content: { 'application/json': { schema: assetResponse } },
      },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const [asset] = await c
      .get('db')
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
      .limit(1);
    if (!asset) return c.json({ error: 'No encontrado' }, 404);

    const url = new URL(r2Endpoint(c.env, asset.r2Key));
    url.searchParams.set('X-Amz-Expires', '3600');
    const signed = await r2Client(c.env).sign(url.toString(), {
      method: 'GET',
      aws: { signQuery: true },
    });

    return c.json(
      { id: asset.id, kind: asset.kind, mimeType: asset.mimeType, viewUrl: signed.url },
      200,
    );
  },
);
