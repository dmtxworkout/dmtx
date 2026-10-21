import { createRoute, z } from '@hono/zod-openapi';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { rutinaSnippets } from '@dmtx/db';
import {
  createSnippetSchema,
  paginated,
  paginationQuerySchema,
  snippetSchema,
  updateSnippetSchema,
} from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { requireAdmin } from '../middleware/auth';

const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });

type Row = typeof rutinaSnippets.$inferSelect;
const serialize = (r: Row) => ({
  id: r.id,
  name: r.name,
  text: r.text,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const snippetsRoute = createApp();
snippetsRoute.use('*', requireAdmin);

snippetsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['snippets'],
    request: { query: paginationQuerySchema },
    responses: {
      200: {
        description: 'Bloques guardados',
        content: { 'application/json': { schema: paginated(snippetSchema) } },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { page, pageSize, search } = c.req.valid('query');
    const where = and(search ? ilike(rutinaSnippets.name, `%${search}%`) : undefined);
    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(rutinaSnippets)
        .where(where)
        .orderBy(desc(rutinaSnippets.updatedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(rutinaSnippets).where(where),
    ]);
    return c.json({ data: rows.map(serialize), total: totals?.value ?? 0, page, pageSize }, 200);
  },
);

snippetsRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['snippets'],
    request: { body: { content: { 'application/json': { schema: createSnippetSchema } } } },
    responses: {
      201: { description: 'Bloque creado', content: { 'application/json': { schema: snippetSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const [row] = await db.insert(rutinaSnippets).values(input).returning();
    if (!row) throw new Error('No se pudo crear el bloque');
    return c.json(serialize(row), 201);
  },
);

snippetsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['snippets'],
    request: { params: idParam },
    responses: {
      200: { description: 'Bloque', content: { 'application/json': { schema: snippetSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const [row] = await db.select().from(rutinaSnippets).where(eq(rutinaSnippets.id, id));
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json(serialize(row), 200);
  },
);

snippetsRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['snippets'],
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: updateSnippetSchema } } },
    },
    responses: {
      200: { description: 'Bloque actualizado', content: { 'application/json': { schema: snippetSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const [row] = await db
      .update(rutinaSnippets)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.text !== undefined ? { text: input.text } : {}),
      })
      .where(eq(rutinaSnippets.id, id))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json(serialize(row), 200);
  },
);

snippetsRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['snippets'],
    request: { params: idParam },
    responses: {
      204: { description: 'Bloque eliminado' },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const [row] = await db
      .delete(rutinaSnippets)
      .where(eq(rutinaSnippets.id, id))
      .returning({ id: rutinaSnippets.id });
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.body(null, 204);
  },
);
