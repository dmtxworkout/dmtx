// Cloudflare Images + Stream, the two media stores. Images keeps the originals
// and resizes on request (`imagedelivery.net/<hash>/<id>/w=800,...`); Stream
// encodes a video to HLS and can hand back an MP4 for offline use. Both are
// reached with one account token.
import type { Env } from '../env';

const API = 'https://api.cloudflare.com/client/v4';

interface CfEnvelope<T> {
  success: boolean;
  result: T;
  errors?: { code: number; message: string }[];
}

export function accountUrl(env: Env, path: string) {
  return `${API}/accounts/${env.CF_ACCOUNT_ID}${path}`;
}

/** A JSON call to the Cloudflare API; throws with Cloudflare's own message. */
export async function cfRequest<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(accountUrl(env, path), {
    ...init,
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as CfEnvelope<T> | null;
  if (!res.ok || !body?.success) {
    const message = body?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(`Cloudflare: ${message}`);
  }
  return body.result;
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

// --- Images ------------------------------------------------------------------

/** Which environment this API is. All of them share one Cloudflare account. */
export const mediaEnvironment = (env: Env) => (env.BETTER_AUTH_URL === 'https://api.dmtxworkout.com' ? 'production' : 'development');

/** Cloudflare has no folders: the name's prefix is what tells environments apart in its dashboard. */
const remoteName = (env: Env, name: string) => `${mediaEnvironment(env)}/${name}`;

/** A one-time URL the browser POSTs the file to (multipart, field `file`). */
export async function imagesDirectUpload(env: Env, name: string): Promise<{ id: string; uploadURL: string }> {
  const form = new FormData();
  form.set('requireSignedURLs', 'false');
  form.set('metadata', JSON.stringify({ name: remoteName(env, name), environment: mediaEnvironment(env) }));
  return cfRequest(env, '/images/v2/direct_upload', { method: 'POST', body: form });
}

export interface ImageInfo {
  id: string;
  filename: string;
  uploaded: string;
  /** False until the browser's POST landed. */
  draft?: boolean;
}

export const imagesGet = (env: Env, id: string) => cfRequest<ImageInfo>(env, `/images/v1/${id}`);
export const imagesDelete = (env: Env, id: string) => cfRequest(env, `/images/v1/${id}`, { method: 'DELETE' }).catch(() => undefined);

/** Delivery URL with flexible-variant options, e.g. `w=800,fit=cover`. */
export function imageUrl(env: Env, id: string, options: Record<string, string | number> = {}) {
  const opts = Object.entries({ f: 'auto', q: 82, ...options })
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `https://imagedelivery.net/${env.CF_IMAGES_ACCOUNT_HASH}/${id}/${opts}`;
}

// --- Stream ------------------------------------------------------------------

export const streamSigned = (env: Env) => !!(env.CF_STREAM_SIGNING_KEY_ID && env.CF_STREAM_SIGNING_KEY_JWK);

/**
 * Open a resumable (tus) upload the browser drives directly. Returns the
 * video's uid and the upload URL; the bytes never pass through the Worker.
 */
export async function streamCreateUpload(env: Env, name: string, sizeBytes: number): Promise<{ uid: string; uploadUrl: string }> {
  const meta = [`name ${b64(remoteName(env, name))}`, `maxDurationSeconds ${b64('21600')}`];
  if (streamSigned(env)) meta.push('requiresignedurls');
  const res = await fetch(accountUrl(env, '/stream?direct_user=true'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.CF_API_TOKEN}`,
      'tus-resumable': '1.0.0',
      'upload-length': String(sizeBytes),
      'upload-metadata': meta.join(','),
    },
  });
  const uploadUrl = res.headers.get('location');
  const uid = res.headers.get('stream-media-id');
  if (!res.ok || !uploadUrl || !uid) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cloudflare Stream no abrió la subida (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  return { uid, uploadUrl };
}

export interface StreamVideo {
  uid: string;
  readyToStream: boolean;
  status: { state: 'pendingupload' | 'downloading' | 'queued' | 'inprogress' | 'ready' | 'error'; pctComplete?: string; errorReasonText?: string };
  duration: number;
  size: number;
  input: { width: number; height: number };
  meta?: Record<string, string>;
}

export const streamGet = (env: Env, uid: string) => cfRequest<StreamVideo>(env, `/stream/${uid}`);
export const streamDelete = (env: Env, uid: string) => cfRequest(env, `/stream/${uid}`, { method: 'DELETE' }).catch(() => undefined);

const keyCache = new Map<string, Promise<CryptoKey>>();
function signingKey(env: Env): Promise<CryptoKey> {
  const jwk = env.CF_STREAM_SIGNING_KEY_JWK!;
  let p = keyCache.get(jwk);
  if (!p) {
    p = crypto.subtle.importKey('jwk', JSON.parse(atob(jwk)) as JsonWebKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    keyCache.set(jwk, p);
  }
  return p;
}
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * The path segment that identifies the video in a playback URL: a signed
 * token (RS256 JWT) when signing is configured, else the uid itself.
 */
export async function streamToken(env: Env, uid: string, ttlSeconds = 24 * 3600): Promise<string> {
  if (!streamSigned(env)) return uid;
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: 'RS256', kid: env.CF_STREAM_SIGNING_KEY_ID })));
  const payload = b64url(
    enc.encode(JSON.stringify({ sub: uid, kid: env.CF_STREAM_SIGNING_KEY_ID, exp: Math.floor(Date.now() / 1000) + ttlSeconds })),
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(env), enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

export function streamUrls(env: Env, token: string) {
  const base = `https://customer-${env.CF_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${token}`;
  return {
    hls: `${base}/manifest/video.m3u8`,
    thumbnail: `${base}/thumbnails/thumbnail.jpg?time=1s&width=800`,
    iframe: `${base}/iframe`,
  };
}

/** Verify a Stream webhook (`Webhook-Signature: time=…,sig1=…`, HMAC-SHA256 of `${time}.${body}`). */
export async function verifyStreamWebhook(secret: string, signature: string | undefined, body: string): Promise<boolean> {
  if (!signature) return false;
  const parts = Object.fromEntries(signature.split(',').map((kv) => kv.split('=') as [string, string]));
  const time = parts.time;
  const sig1 = parts.sig1;
  if (!time || !sig1) return false;
  if (Math.abs(Date.now() / 1000 - Number(time)) > 10 * 60) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${time}.${body}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.length === sig1.length && hex === sig1.toLowerCase();
}
