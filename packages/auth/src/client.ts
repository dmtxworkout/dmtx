import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { ac, roles } from './permissions';

/**
 * Browser auth client (React hooks: useSession, signIn, signOut, admin.*).
 * Pass the API base URL where Better Auth is mounted (e.g. https://api.dmtxworkout.com).
 */
export function createAuthBrowserClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [adminClient({ ac, roles })],
  });
}

export type AuthBrowserClient = ReturnType<typeof createAuthBrowserClient>;

export { ac, roles } from './permissions';
