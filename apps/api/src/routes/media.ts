import { createRoute, z } from '@hono/zod-openapi';
import { AwsClient } from 'aws4fetch';
import { uuidv7 } from 'uuidv7';
import { slugify } from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { requireAdmin } from '../middleware/auth';

const presignRequest = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  kind: z.enum(['video', 'image']),
});

const presignResponse = z.object({
  key: z.string(),
  uploadUrl: z.string(),
  publicUrl: z.string().nullable(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
});

export const mediaRoute = createApp();
mediaRoute.use('*', requireAdmin);

/**
 * Issue a pre-signed R2 (S3-compatible) PUT URL for a direct browser upload.
 * The browser must PUT with the exact `headers` returned (the Content-Type is
 * signed, so a mismatch is rejected).
 */
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

    const aws = new AwsClient({
      accessKeyId: c.env.R2_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
      region: 'auto',
      service: 's3',
    });
    const endpoint = `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${c.env.R2_BUCKET}/${key}`;
    const signed = await aws.sign(endpoint, {
      method: 'PUT',
      headers: { 'content-type': contentType },
      aws: { signQuery: true },
    });

    const publicUrl = c.env.R2_PUBLIC_BASE_URL ? `${c.env.R2_PUBLIC_BASE_URL}/${key}` : null;
    return c.json(
      {
        key,
        uploadUrl: signed.url,
        publicUrl,
        method: 'PUT' as const,
        headers: { 'content-type': contentType },
      },
      200,
    );
  },
);
