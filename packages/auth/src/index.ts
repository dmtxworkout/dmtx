import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, emailOTP } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';
import { createDb } from '@dmtx/db';
import { Resend } from 'resend';
import { ac, roles } from './permissions';

const DEFAULT_FROM = 'DMTX <no-reply@dmtx.app>';

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
  const from = env.EMAIL_FROM ?? DEFAULT_FROM;

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
    disabledPaths: [
      '/email-otp/send-verification-otp',
      '/email-otp/check-verification-otp',
      '/sign-in/email-otp',
      '/email-otp/request-password-reset',
      '/forget-password/email-otp',
      '/email-otp/reset-password',
      '/email-otp/request-email-change',
      '/email-otp/change-email',
    ],
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
      // The six-digit code that proves a new member's email. It's made and sent by
      // sendEmailCode: this plugin's own send swallows a failed delivery. Its other
      // flows stay off (disabledPaths above).
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        storeOTP: 'hashed',
        disableSignUp: true,
        sendVerificationOTP: async () => {},
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Emails a new six-digit code; any earlier one stops working. Throws if it can't be delivered. */
export async function sendEmailCode(env: AuthEnv, email: string): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
  const otp = await createAuth(env).api.createVerificationOTP({ body: { email, type: 'email-verification' } });
  const { error } = await new Resend(env.RESEND_API_KEY).emails.send({
    from: env.EMAIL_FROM ?? DEFAULT_FROM,
    to: email,
    subject: `${otp} es tu código de DMTX`,
    html: `<p>Tu código para verificar tu correo es:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p><p>Vence en 10 minutos. Si no creaste una cuenta en DMTX, ignora este correo.</p>`,
  });
  if (error) throw new Error(error.message);
}

export * from './permissions';
