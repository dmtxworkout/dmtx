import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { createDb } from '@dmtx/db';
import { Resend } from 'resend';
import { ac, roles } from './permissions';

export interface AuthEnv {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  /** Comma-separated list of allowed origins (admin app, mobile, …). */
  TRUSTED_ORIGINS?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

/**
 * Build a Better Auth instance bound to the request env. Instantiate PER
 * REQUEST inside a Worker (env bindings differ per request); never a
 * module-scope singleton.
 */
export function createAuth(env: AuthEnv) {
  const db = createDb(env.DATABASE_URL);
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  const from = env.EMAIL_FROM ?? 'DMTX <no-reply@dmtx.app>';

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.TRUSTED_ORIGINS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    database: drizzleAdapter(db, { provider: 'pg' }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        if (!resend) return;
        await resend.emails.send({
          from,
          to: user.email,
          subject: 'Restablece tu contraseña — DMTX',
          html: `<p>Hola ${user.name ?? ''},</p><p>Para restablecer tu contraseña, haz clic <a href="${url}">aquí</a>. Si no lo solicitaste, ignora este correo.</p>`,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        if (!resend) return;
        await resend.emails.send({
          from,
          to: user.email,
          subject: 'Verifica tu correo — DMTX',
          html: `<p>Hola ${user.name ?? ''},</p><p>Verifica tu correo haciendo clic <a href="${url}">aquí</a>.</p>`,
        });
      },
    },
    plugins: [
      admin({
        ac,
        roles,
        defaultRole: 'user',
        adminRoles: ['admin'],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export * from './permissions';
