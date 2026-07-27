import { cors } from 'hono/cors';
import { createAuth } from '@dmtx/auth';
import { createDb } from '@dmtx/db';
import { createApp } from './lib/openapi';
import { withSession } from './middleware/auth';
import { exercisesRoute } from './routes/exercises';
import { mediaRoute } from './routes/media';

const app = createApp();

// CORS — credentials require an explicit origin (never "*").
app.use('*', (c, next) =>
  cors({
    origin: c.env.ADMIN_ORIGIN ?? 'http://localhost:3001',
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })(c, next),
);

// Per-request Drizzle client (no module-scope singletons on Workers).
app.use('*', async (c, next) => {
  c.set('db', createDb(c.env.DATABASE_URL));
  await next();
});

// Better Auth handles all of /api/auth/* (public — before the session/admin gate).
app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));

// Resolve the session for the rest of the API surface.
app.use('/api/*', withSession);

app.get('/health', (c) => c.json({ ok: true, service: 'dmtx-api' }));

app.route('/api/exercises', exercisesRoute);
app.route('/api/media', mediaRoute);

// OpenAPI document (consumed by @dmtx/api-client codegen).
app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'DMTX API', version: '0.0.0', description: 'Admin API para DMTX' },
});

export default app;
