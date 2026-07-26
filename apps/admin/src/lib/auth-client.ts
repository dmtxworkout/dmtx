'use client';

import { createAuthBrowserClient } from '@dmtx/auth/client';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export const authClient = createAuthBrowserClient(baseUrl);

export const { useSession, signIn, signOut } = authClient;

export function isAdmin(role?: string | null): boolean {
  return (role ?? '')
    .split(',')
    .map((r) => r.trim())
    .includes('admin');
}
