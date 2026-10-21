import { createRoute, z } from '@hono/zod-openapi';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { reusableBlocks } from '@dmtx/db';
import {
  createReusableBlockSchema,
  paginated,
  paginationQuerySchema,
  reusableBlockSchema,
  updateReusableBlockSchema,
} from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { requireAdmin } from '../middleware/auth';

const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });

type Row = typeof reusableBlocks.$inferSelect;
const serialize = (r: Row) => ({
  id: r.id,
  name: r.name,
  text: r.text,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const reusableBlocksRoute = createApp();
reusableBlocksRoute.use('*', requireAdmin);

reusableBlocksRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['reusable-blocks'],
    request: { query: paginationQuerySchema },
    responses: {
      200: {
        description: 'Bloques reutilizables',
        content: { 'application/json': { schema: paginated(reusableBlockSchema) } },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { page, pageSize, search } = c.req.valid('query');
    const where = and(search ? ilike(reusableBlocks.name, `%${search}%`) : undefined);
    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(reusableBlocks)
        .where(where)
        .orderBy(desc(reusableBlocks.updatedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(reusableBlocks).where(where),
    ]);
    return c.json({ data: rows.map(serialize), total: totals?.value ?? 0, page, pageSize }, 200);
  },
);

reusableBlocksRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['reusable-blocks'],
    request: { body: { content: { 'application/json': { schema: createReusableBlockSchema } } } },
    responses: {
      201: { description: 'Bloque creado', content: { 'application/json': { schema: reusableBlockSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const [row] = await db.insert(reusableBlocks).values(input).returning();
    if (!row) throw new Error('No se pudo crear el bloque');
    return c.json(serialize(row), 201);
  },
);

reusableBlocksRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['reusable-blocks'],
    request: { params: idParam },
    responses: {
      200: { description: 'Bloque', content: { 'application/json': { schema: reusableBlockSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const [row] = await db.select().from(reusableBlocks).where(eq(reusableBlocks.id, id));
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json(serialize(row), 200);
  },
);

reusableBlocksRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['reusable-blocks'],
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: updateReusableBlockSchema } } },
    },
    responses: {
      200: { description: 'Bloque actualizado', content: { 'application/json': { schema: reusableBlockSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const [row] = await db
      .update(reusableBlocks)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.text !== undefined ? { text: input.text } : {}),
      })
      .where(eq(reusableBlocks.id, id))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json(serialize(row), 200);
  },
);

reusableBlocksRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['reusable-blocks'],
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
      .delete(reusableBlocks)
      .where(eq(reusableBlocks.id, id))
      .returning({ id: reusableBlocks.id });
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.body(null, 204);
  },
);
