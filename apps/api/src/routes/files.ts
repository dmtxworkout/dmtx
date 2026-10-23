// Public, permanent links to library files (no session): what «Copiar enlace»
// hands out. The URL is ours and never expires, so it can be pasted anywhere;
// an image is served as itself (the browser shows it, like a Shopify CDN
// link) and a video gets a bare page with Stream's player, with a fresh
// signed token minted on every visit. Nothing can be edited from here.
import { and, eq, isNull } from 'drizzle-orm';
import { mediaAssets } from '@dmtx/db';
import { imageUrl, streamToken, streamUrls } from '../lib/cloudflare';
import { createApp } from '../lib/openapi';

export const filesRoute = createApp();

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

filesRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  // Anything but a UUID cannot be a file (and would make Postgres throw).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return c.text('No encontrado', 404);
  const [row] = await c
    .get('db')
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
    .limit(1);
  if (!row || row.processingStatus !== 'ready') return c.text('No encontrado', 404);

  if (row.kind === 'image') {
    // The file at its stored size; the browser renders it on its own.
    const upstream = await fetch(imageUrl(c.env, row.externalId, { w: row.width ?? 4000, fit: 'scale-down', q: 90 }));
    if (!upstream.ok) return c.text('No encontrado', 404);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? row.mimeType ?? 'application/octet-stream',
        'content-disposition': `inline; filename="${encodeURIComponent(row.name)}"`,
        // Short: a replaced file keeps this URL.
        'cache-control': 'public, max-age=300',
      },
    });
  }

  const { iframe } = streamUrls(c.env, await streamToken(c.env, row.externalId));
  const title = escapeHtml(row.name);
  return c.html(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; }
  iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<iframe src="${iframe}" title="${title}" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
</body>
</html>`);
});
