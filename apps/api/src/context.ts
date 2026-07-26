import type { Database } from '@dmtx/db';
import type { Env } from './env';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role?: string | null;
  banned?: boolean | null;
  image?: string | null;
}

/** Hono generics for the whole API: Worker bindings + per-request variables. */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Database;
    user: SessionUser | null;
    session: Record<string, unknown> | null;
  };
}
