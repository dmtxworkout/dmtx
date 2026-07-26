import { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../context';

/**
 * Factory for an OpenAPIHono app wired with a default validation hook that
 * returns a consistent 422 payload on invalid input.
 */
export function createApp() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          { error: 'Datos inválidos', issues: result.error.issues },
          422,
        );
      }
    },
  });
}
