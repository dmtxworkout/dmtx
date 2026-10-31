import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

/**
 * API origin. Defaults to localhost (works on the iOS simulator). For a
 * physical device, set EXPO_PUBLIC_API_URL to your machine's LAN IP, e.g.
 * `EXPO_PUBLIC_API_URL=http://192.168.1.20:8787`.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';

// The Expo client plugin's action generics clash with the base client under TS
// strict mode; the runtime contract is correct, so we erase the plugin from the
// static type and read its `getCookie` action through a typed accessor below.
const plugins = [
  expoClient({ scheme: 'dmtx', storagePrefix: 'dmtx', storage: SecureStore }),
] as unknown as [];

export const authClient = createAuthClient({ baseURL: API_URL, plugins });

export const { useSession, signIn, signUp, signOut } = authClient;

/** Session cookie header for authenticated fetches (provided by the Expo plugin). */
export function getSessionCookie(): string {
  const client = authClient as unknown as { getCookie?: () => string };
  return client.getCookie?.() ?? '';
}

const CODE_ERRORS: Record<string, string> = {
  INVALID_OTP: 'Ese código no coincide.',
  OTP_EXPIRED: 'Ese código venció. Pide otro.',
  TOO_MANY_ATTEMPTS: 'Demasiados intentos. Pide otro código.',
};

/** Checks the code against the email. Returns what went wrong. */
export async function verifyEmailCode(email: string, otp: string): Promise<string | null> {
  const { error } = await authClient.$fetch('/email-otp/verify-email', {
    method: 'POST',
    body: { email, otp },
  });
  if (!error) return null;
  const code = (error as { code?: string }).code;
  return (code && CODE_ERRORS[code]) ?? 'No pudimos verificar el código. Intenta de nuevo.';
}
