// Inbound webhooks (no session: each one is verified with its own secret).
import { and, eq, isNull } from 'drizzle-orm';
import { mediaAssets } from '@dmtx/db';
import { verifyStreamWebhook } from '../lib/cloudflare';
import { refreshVideo } from '../lib/media';
import { createApp } from '../lib/openapi';

export const webhooksRoute = createApp();

/**
 * Cloudflare Stream: "video ready" / "video errored". We only take the uid
 * from the payload and ask Stream for the rest, so a forged body can at most
 * trigger a refresh.
 */
webhooksRoute.post('/stream', async (c) => {
  const secret = c.env.CF_STREAM_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: 'Webhook no configurado' }, 404);
  const body = await c.req.text();
  if (!(await verifyStreamWebhook(secret, c.req.header('webhook-signature'), body))) {
    return c.json({ error: 'Firma inválida' }, 401);
  }
  let uid: string | undefined;
  try {
    uid = (JSON.parse(body) as { uid?: string }).uid;
  } catch {
    uid = undefined;
  }
  if (!uid) return c.json({ error: 'Sin uid' }, 400);
  const db = c.get('db');
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.externalId, uid), isNull(mediaAssets.deletedAt)))
    .limit(1);
  if (row) await refreshVideo(db, c.env, row);
  return c.json({ ok: true });
});
