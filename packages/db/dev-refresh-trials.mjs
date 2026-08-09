/* eslint-disable */
// Dev helper: extend every trialing subscription so the free trial never lapses
// locally (it otherwise expires 7 days after signup and locks you out of the app).
//
//   Run from the repo root:  node packages/db/dev-refresh-trials.mjs
//
// Safe to re-run. Dev-only — do NOT run against production data.
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const vars = readFileSync(new URL('../../apps/api/.dev.vars', import.meta.url), 'utf8');
const url = (vars.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
if (!url) throw new Error('DATABASE_URL not found in apps/api/.dev.vars');

const sql = neon(url);
const rows = await sql`
  update subscriptions
  set trial_end = now() + interval '3650 days'
  where status = 'trialing'
  returning user_id`;
console.log(`Extended ${rows.length} trial(s) by ~10 years. Tap "Reintentar" in the app.`);
