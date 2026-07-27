/* eslint-disable */
// @ts-nocheck
/**
 * Create (or promote) the first admin user.
 *
 *   pnpm --filter @dmtx/auth seed:admin
 *
 * Override the defaults with env vars (or add them to the root .env):
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='tu-clave' ADMIN_NAME='Tu Nombre' \
 *     pnpm --filter @dmtx/auth seed:admin
 */
import { existsSync } from 'node:fs';
import process from 'node:process';
import { eq } from 'drizzle-orm';
import { createDb, user } from '@dmtx/db';
import { createAuth } from '../src/index';

for (const p of ['.env', '../.env', '../../.env']) {
  if (existsSync(p)) {
    process.loadEnvFile(p);
    break;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
if (!DATABASE_URL || !BETTER_AUTH_SECRET) {
  console.error('✗ Faltan DATABASE_URL o BETTER_AUTH_SECRET en el .env');
  process.exit(1);
}

const email = process.env.ADMIN_EMAIL ?? 'admin@dmtx.local';
const password = process.env.ADMIN_PASSWORD ?? 'dmtxadmin';
const name = process.env.ADMIN_NAME ?? 'Admin';

const auth = createAuth({
  DATABASE_URL,
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? 'http://localhost:8787',
});
const db = createDb(DATABASE_URL);

try {
  await auth.api.signUpEmail({ body: { email, password, name } });
  console.log(`✓ Usuario creado: ${email}`);
} catch (e) {
  console.log(`· ${email} ya existía (o no se recreó): ${e instanceof Error ? e.message : e}`);
}

await db.update(user).set({ role: 'admin', emailVerified: true }).where(eq(user.email, email));

console.log('');
console.log('✓ Administrador listo. Inicia sesión con:');
console.log(`   correo:      ${email}`);
console.log(`   contraseña:  ${password}`);
console.log('');
process.exit(0);
