import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Create a Drizzle client bound to a Neon connection string.
 *
 * Uses the Neon HTTP driver (pure `fetch`) so the same code runs unchanged on
 * Cloudflare Workers, Node, and Lambda. Instantiate PER REQUEST inside a Worker
 * — never as a module-scope singleton.
 *
 * Note: the HTTP driver does not support interactive multi-statement
 * transactions (batched `db.transaction([...])` only). Switch a specific path
 * to the Neon WebSocket pool if it needs interactive transactions.
 */
export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema, casing: 'snake_case' });
}

export type Database = ReturnType<typeof createDb>;
