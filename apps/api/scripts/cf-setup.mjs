#!/usr/bin/env node
/* global process, console, fetch, Buffer, FormData, Blob */
// One-time Cloudflare setup for media, run after CF_ACCOUNT_ID and
// CF_API_TOKEN are in apps/api/.dev.vars:
//   - Images: turns on flexible variants (sizes in the URL, `w=800,...`).
//   - Images: finds the account's delivery hash (a 1×1 PNG is uploaded and deleted).
//   - Stream: finds the customer subdomain code (a throwaway upload slot).
//   - Stream: creates a signing key, so playback URLs are signed.
//   - With --webhook <url>: registers the "video ready" webhook.
// Whatever it finds is appended to .dev.vars (existing values are kept).
// Production: `wrangler secret put` the same names.
import { readFileSync, appendFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars');
const path = realpathSync(file);
const vars = Object.fromEntries(
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"(.*)"$/, '$1')];
    }),
);
const account = vars.CF_ACCOUNT_ID;
const token = vars.CF_API_TOKEN;
if (!account || !token) {
  console.error(`Faltan CF_ACCOUNT_ID y/o CF_API_TOKEN en ${path}`);
  process.exit(1);
}
const webhookUrl = process.argv.includes('--webhook') ? process.argv[process.argv.indexOf('--webhook') + 1] : null;

const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
async function cf(p, init = {}) {
  const res = await fetch(`${base}${p}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) throw new Error(`${init.method ?? 'GET'} ${p}: ${body?.errors?.map((e) => e.message).join('; ') || res.status}`);
  return body.result;
}
const added = [];
function set(name, value) {
  if (vars[name]) {
    console.log(`${name}: ya estaba`);
    return;
  }
  appendFileSync(path, `${name}="${value}"\n`);
  vars[name] = value;
  added.push(name);
  console.log(`${name}: guardado`);
}

// Images ─ flexible variants
await cf('/images/v1/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ flexible_variants: true }) });
console.log('Images: variantes flexibles activadas');

// Images ─ account hash (only an uploaded image reveals it)
if (!vars.CF_IMAGES_ACCOUNT_HASH) {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const form = new FormData();
  form.set('file', new Blob([png], { type: 'image/png' }), 'probe.png');
  const img = await cf('/images/v1', { method: 'POST', body: form });
  const hash = img.variants?.[0]?.match(/imagedelivery\.net\/([^/]+)\//)?.[1];
  await cf(`/images/v1/${img.id}`, { method: 'DELETE' }).catch(() => undefined);
  if (!hash) throw new Error('No se pudo leer el account hash de Images');
  set('CF_IMAGES_ACCOUNT_HASH', hash);
}

// Stream ─ customer code (a throwaway upload slot carries the playback host)
if (!vars.CF_STREAM_CUSTOMER_CODE) {
  const slot = await cf('/stream/direct_upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ maxDurationSeconds: 60, expiry: new Date(Date.now() + 5 * 60 * 1000).toISOString() }),
  });
  const video = await cf(`/stream/${slot.uid}`);
  const code = video.playback?.hls?.match(/customer-([^.]+)\.cloudflarestream\.com/)?.[1];
  await cf(`/stream/${slot.uid}`, { method: 'DELETE' }).catch(() => undefined);
  if (!code) throw new Error('No se pudo leer el customer code de Stream');
  set('CF_STREAM_CUSTOMER_CODE', code);
}

// Stream ─ signing key
if (!vars.CF_STREAM_SIGNING_KEY_ID) {
  const key = await cf('/stream/keys', { method: 'POST' });
  set('CF_STREAM_SIGNING_KEY_ID', key.id);
  set('CF_STREAM_SIGNING_KEY_JWK', key.jwk);
}

// Stream ─ webhook
if (webhookUrl) {
  const hook = await cf('/stream/webhook', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notificationUrl: webhookUrl }) });
  set('CF_STREAM_WEBHOOK_SECRET', hook.secret);
}

console.log(added.length ? `\nListo. Reinicia la API para que lea ${added.join(', ')}.` : '\nListo, nada que añadir.');
