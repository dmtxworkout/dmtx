import { cors } from 'hono/cors';
import { createAuth } from '@dmtx/auth';
import { createDb } from '@dmtx/db';
import { createApp } from './lib/openapi';
import { withSession } from './middleware/auth';
import { exercisesRoute } from './routes/exercises';
import { mediaRoute } from './routes/media';
import { workoutsRoute } from './routes/workouts';
import { reusableBlocksRoute } from './routes/reusable-blocks';
import { taxonomyRoute } from './routes/taxonomy';
import { programsRoute } from './routes/programs';
import { skillsRoute } from './routes/skills';
import { subscriptionsRoute } from './routes/subscriptions';
import { appRoute } from './routes/app';
import { webhooksRoute } from './routes/webhooks';
import { filesRoute } from './routes/files';

const app = createApp();
// An unexpected error reaches the admin as JSON with its message (the UI shows
// it), and the log keeps the stack; never a bare "Internal Server Error" page.
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : 'Error inesperado' }, 500);
});

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

// Inbound webhooks (Cloudflare Stream): verified by signature, no session.
app.route('/api/webhooks', webhooksRoute);

// Public, permanent links to library files («Copiar enlace»): view only, no session.
app.route('/archivos', filesRoute);

// Resolve the session for the rest of the API surface.
app.use('/api/*', withSession);

app.get('/health', (c) => c.json({ ok: true, service: 'dmtx-api' }));

app.route('/api/exercises', exercisesRoute);
app.route('/api/media', mediaRoute);
app.route('/api/workouts', workoutsRoute);
app.route('/api/reusable-blocks', reusableBlocksRoute);
app.route('/api/taxonomy', taxonomyRoute);
app.route('/api/programs', programsRoute);
app.route('/api/skills', skillsRoute);
app.route('/api/subscriptions', subscriptionsRoute);
// Consumer / mobile-app API (read published content, entitlement-gated).
app.route('/api/app', appRoute);

// OpenAPI document (consumed by @dmtx/api-client codegen).
app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'DMTX API', version: '0.0.0', description: 'Admin API para DMTX' },
});

export default app;
