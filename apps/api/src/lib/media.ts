import { AwsClient } from 'aws4fetch';
import { and, inArray, isNull, notInArray } from 'drizzle-orm';
import { mediaAssets } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import type { Env } from '../env';

export function r2Client(env: Env) {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: 'auto',
    service: 's3',
  });
}

export function r2Endpoint(env: Env, key: string) {
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
}

/** Human display name from an r2 key like `image/<uuid>-nombre.png` → `nombre.png`. */
export function displayName(r2Key: string): string {
  const base = r2Key.split('/').pop() ?? r2Key;
  return base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
}

/** Short-lived presigned GET URL for reading an R2 object. */
export async function viewUrl(env: Env, key: string): Promise<string> {
  const url = new URL(r2Endpoint(env, key));
  url.searchParams.set('X-Amz-Expires', '3600');
  const signed = await r2Client(env).sign(url.toString(), {
    method: 'GET',
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * Batch-resolve a set of media asset ids to short-lived view URLs. Nulls and
 * duplicates are ignored; the returned map only contains ids that resolved.
 * An asset still uploading (or processing / failed) does not resolve: the app
 * never gets a link to a file that isn't there yet.
 */
export async function resolveMediaUrls(
  db: Database,
  env: Env,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: mediaAssets.id, r2Key: mediaAssets.r2Key })
    .from(mediaAssets)
    .where(
      and(
        inArray(mediaAssets.id, unique),
        isNull(mediaAssets.deletedAt),
        notInArray(mediaAssets.processingStatus, ['uploading', 'processing', 'failed']),
      ),
    );
  const entries = await Promise.all(
    rows.map(async (r) => [r.id, await viewUrl(env, r.r2Key)] as const),
  );
  return new Map(entries);
}
