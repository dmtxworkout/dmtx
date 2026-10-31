import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, emailOTP } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';
import { createDb } from '@dmtx/db';
import { Resend } from 'resend';
import { ac, roles } from './permissions';

export interface AuthEnv {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  /** Comma-separated list of allowed origins (admin app, mobile, …). */
  TRUSTED_ORIGINS?: string;
  /** The admin app origin — auto-added to trusted origins for cross-origin login. */
  ADMIN_ORIGIN?: string;
  /** The mobile app origin (web build), if any. */
  APP_ORIGIN?: string;
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

  const trustedOrigins = [
    ...(env.TRUSTED_ORIGINS?.split(',').map((s) => s.trim()) ?? []),
    env.ADMIN_ORIGIN,
    env.APP_ORIGIN,
    // Mobile app deep-link scheme (see apps/mobile app.json `scheme`).
    'dmtx://',
  ].filter((v): v is string => Boolean(v));

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins.length ? trustedOrigins : undefined,
    database: drizzleAdapter(db, { provider: 'pg' }),
    emailAndPassword: {
      enabled: true,
      // Sign-in stays open so an unverified member can come back to the code step;
      // the API keeps content from them (requireAccess).
      requireEmailVerification: false,
      // Whoever signed up with someone else's address loses the session when its
      // owner resets the password, before that owner verifies it.
      revokeSessionsOnPasswordReset: true,
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
      // Mobile app support: trusted-origin handling for the app scheme and
      // SecureStore-backed session cookies from the Expo client.
      expo(),
      // The six-digit code that proves a new member's email. Only this type is
      // ever sent: the plugin's sign-in and password flows stay unused.
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        storeOTP: 'hashed',
        disableSignUp: true,
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== 'email-verification' || !resend) return;
          const { error } = await resend.emails.send({
            from,
            to: email,
            subject: `${otp} es tu código de DMTX`,
            html: `<p>Tu código para verificar tu correo es:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p><p>Vence en 10 minutos. Si no creaste una cuenta en DMTX, ignora este correo.</p>`,
          });
          if (error) throw new Error(error.message);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export * from './permissions';
