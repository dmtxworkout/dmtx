import { createRoute, z } from '@hono/zod-openapi';
import { and, count, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { programDays, programItems, programVideoItems, programs } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import {
  createProgramSchema,
  paginated,
  paginationQuerySchema,
  programListItemSchema,
  programSchema,
  slugify,
  updateProgramSchema,
} from '@dmtx/schemas';
import type { ProgramDayInput, ProgramVideoItemInput } from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { requireAdmin } from '../middleware/auth';

const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });

type ProgramRow = typeof programs.$inferSelect;

function base(p: ProgramRow) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    type: p.type,
    difficulty: p.difficulty,
    durationDays: p.durationDays,
    status: p.status,
    thumbnailAssetId: p.thumbnailAssetId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function loadFull(db: Database, p: ProgramRow) {
  const [days, videoItems] = await Promise.all([
    db.select().from(programDays).where(eq(programDays.programId, p.id)).orderBy(programDays.position),
    db
      .select()
      .from(programVideoItems)
      .where(eq(programVideoItems.programId, p.id))
      .orderBy(programVideoItems.position),
  ]);
  const dayIds = days.map((d) => d.id);
  const items = dayIds.length
    ? await db
        .select()
        .from(programItems)
        .where(inArray(programItems.programDayId, dayIds))
        .orderBy(programItems.position)
    : [];
  const byDay = new Map<string, string[]>();
  for (const it of items) {
    const arr = byDay.get(it.programDayId) ?? [];
    arr.push(it.workoutId);
    byDay.set(it.programDayId, arr);
  }
  return {
    ...base(p),
    days: days.map((d) => ({
      id: d.id,
      title: d.title,
      isRestDay: d.isRestDay,
      notes: d.notes,
      workoutIds: byDay.get(d.id) ?? [],
    })),
    videoItems: videoItems.map((v) => ({
      id: v.id,
      mediaAssetId: v.mediaAssetId,
      title: v.title,
      description: v.description,
    })),
  };
}

async function insertDays(db: Database, programId: string, days: ProgramDayInput[]) {
  for (let i = 0; i < days.length; i += 1) {
    const d = days[i]!;
    const [day] = await db
      .insert(programDays)
      .values({
        programId,
        position: i,
        title: d.title ?? null,
        isRestDay: d.isRestDay,
        notes: d.notes ?? null,
      })
      .returning({ id: programDays.id });
    if (day && d.workoutIds.length) {
      await db
        .insert(programItems)
        .values(d.workoutIds.map((workoutId, j) => ({ programDayId: day.id, position: j, workoutId })));
    }
  }
}

async function insertVideoItems(db: Database, programId: string, videoItems: ProgramVideoItemInput[]) {
  if (!videoItems.length) return;
  await db.insert(programVideoItems).values(
    videoItems.map((v, i) => ({
      programId,
      position: i,
      mediaAssetId: v.mediaAssetId,
      title: v.title ?? null,
      description: v.description ?? null,
    })),
  );
}

export const programsRoute = createApp();
programsRoute.use('*', requireAdmin);

programsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['programs'],
    request: { query: paginationQuerySchema },
    responses: {
      200: {
        description: 'Lista de programas',
        content: { 'application/json': { schema: paginated(programListItemSchema) } },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { page, pageSize, search } = c.req.valid('query');
    const where = and(
      isNull(programs.deletedAt),
      search ? ilike(programs.name, `%${search}%`) : undefined,
    );
    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(programs)
        .where(where)
        .orderBy(desc(programs.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(programs).where(where),
    ]);
    return c.json({ data: rows.map(base), total: totals?.value ?? 0, page, pageSize }, 200);
  },
);

programsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['programs'],
    request: { params: idParam },
    responses: {
      200: { description: 'Programa', content: { 'application/json': { schema: programSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const [row] = await db
      .select()
      .from(programs)
      .where(and(eq(programs.id, id), isNull(programs.deletedAt)))
      .limit(1);
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json(await loadFull(db, row), 200);
  },
);

programsRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['programs'],
    request: { body: { content: { 'application/json': { schema: createProgramSchema } } } },
    responses: {
      201: { description: 'Creado', content: { 'application/json': { schema: programSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const [row] = await db
      .insert(programs)
      .values({
        slug: input.slug ?? slugify(input.name),
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        difficulty: input.difficulty,
        durationDays: input.durationDays ?? null,
        status: input.status,
        thumbnailAssetId: input.thumbnailAssetId ?? null,
      })
      .returning();
    if (!row) throw new Error('No se pudo crear el programa');
    if (input.type === 'structured') await insertDays(db, row.id, input.days);
    else await insertVideoItems(db, row.id, input.videoItems);
    return c.json(await loadFull(db, row), 201);
  },
);

programsRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['programs'],
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: updateProgramSchema } } },
    },
    responses: {
      200: { description: 'Actualizado', content: { 'application/json': { schema: programSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const set: Partial<typeof programs.$inferInsert> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.slug !== undefined) set.slug = input.slug;
    if (input.description !== undefined) set.description = input.description ?? null;
    if (input.type !== undefined) set.type = input.type;
    if (input.difficulty !== undefined) set.difficulty = input.difficulty;
    if (input.durationDays !== undefined) set.durationDays = input.durationDays ?? null;
    if (input.status !== undefined) set.status = input.status;
    if (input.thumbnailAssetId !== undefined) set.thumbnailAssetId = input.thumbnailAssetId ?? null;

    const [row] = await db
      .update(programs)
      .set(set)
      .where(and(eq(programs.id, id), isNull(programs.deletedAt)))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);

    if (input.days !== undefined) {
      await db.delete(programDays).where(eq(programDays.programId, id));
      await insertDays(db, id, input.days);
    }
    if (input.videoItems !== undefined) {
      await db.delete(programVideoItems).where(eq(programVideoItems.programId, id));
      await insertVideoItems(db, id, input.videoItems);
    }
    return c.json(await loadFull(db, row), 200);
  },
);

programsRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['programs'],
    request: { params: idParam },
    responses: {
      204: { description: 'Eliminado' },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const [row] = await db
      .update(programs)
      .set({ deletedAt: new Date() })
      .where(and(eq(programs.id, id), isNull(programs.deletedAt)))
      .returning({ id: programs.id });
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.body(null, 204);
  },
);
