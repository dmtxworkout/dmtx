import { createRoute, z } from '@hono/zod-openapi';
import { and, count, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { skillLevels, skills } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import {
  createSkillSchema,
  paginated,
  paginationQuerySchema,
  skillSchema,
  slugify,
  updateSkillSchema,
} from '@dmtx/schemas';
import type { SkillLevelInput } from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { requireAdmin } from '../middleware/auth';

const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });

type SkillRow = typeof skills.$inferSelect;

function base(s: SkillRow) {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    difficulty: s.difficulty,
    status: s.status,
    thumbnailAssetId: s.thumbnailAssetId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

async function loadFull(db: Database, s: SkillRow) {
  const levels = await db
    .select()
    .from(skillLevels)
    .where(eq(skillLevels.skillId, s.id))
    .orderBy(skillLevels.position);
  return {
    ...base(s),
    levels: levels.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      workoutId: l.workoutId,
      unlockGoal: l.unlockGoal ?? null,
    })),
  };
}

async function insertLevels(db: Database, skillId: string, levels: SkillLevelInput[]) {
  if (!levels.length) return;
  await db.insert(skillLevels).values(
    levels.map((l, i) => ({
      skillId,
      position: i,
      name: l.name,
      description: l.description ?? null,
      workoutId: l.workoutId,
      unlockGoal: l.unlockGoal ?? null,
    })),
  );
}

export const skillsRoute = createApp();
skillsRoute.use('*', requireAdmin);

skillsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['skills'],
    request: { query: paginationQuerySchema },
    responses: {
      200: {
        description: 'Lista de habilidades (con niveles)',
        content: { 'application/json': { schema: paginated(skillSchema) } },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { page, pageSize, search } = c.req.valid('query');
    const where = and(isNull(skills.deletedAt), search ? ilike(skills.name, `%${search}%`) : undefined);
    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(skills)
        .where(where)
        .orderBy(desc(skills.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(skills).where(where),
    ]);
    const ids = rows.map((r) => r.id);
    const levels = ids.length
      ? await db.select().from(skillLevels).where(inArray(skillLevels.skillId, ids)).orderBy(skillLevels.position)
      : [];
    const byS = new Map<string, (typeof levels)[number][]>();
    for (const l of levels) {
      const arr = byS.get(l.skillId) ?? [];
      arr.push(l);
      byS.set(l.skillId, arr);
    }
    const data = rows.map((s) => ({
      ...base(s),
      levels: (byS.get(s.id) ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        workoutId: l.workoutId,
        unlockGoal: l.unlockGoal ?? null,
      })),
    }));
    return c.json({ data, total: totals?.value ?? 0, page, pageSize }, 200);
  },
);

skillsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['skills'],
    request: { params: idParam },
    responses: {
      200: { description: 'Habilidad', content: { 'application/json': { schema: skillSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const [row] = await db
      .select()
      .from(skills)
      .where(and(eq(skills.id, id), isNull(skills.deletedAt)))
      .limit(1);
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json(await loadFull(db, row), 200);
  },
);

skillsRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['skills'],
    request: { body: { content: { 'application/json': { schema: createSkillSchema } } } },
    responses: {
      201: { description: 'Creada', content: { 'application/json': { schema: skillSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const [row] = await db
      .insert(skills)
      .values({
        slug: input.slug ?? slugify(input.name),
        name: input.name,
        description: input.description ?? null,
        difficulty: input.difficulty ?? null,
        status: input.status,
        thumbnailAssetId: input.thumbnailAssetId ?? null,
      })
      .returning();
    if (!row) throw new Error('No se pudo crear la habilidad');
    await insertLevels(db, row.id, input.levels);
    return c.json(await loadFull(db, row), 201);
  },
);

skillsRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['skills'],
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: updateSkillSchema } } },
    },
    responses: {
      200: { description: 'Actualizada', content: { 'application/json': { schema: skillSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const set: Partial<typeof skills.$inferInsert> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.slug !== undefined) set.slug = input.slug;
    if (input.description !== undefined) set.description = input.description ?? null;
    if (input.difficulty !== undefined) set.difficulty = input.difficulty ?? null;
    if (input.status !== undefined) set.status = input.status;
    if (input.thumbnailAssetId !== undefined) set.thumbnailAssetId = input.thumbnailAssetId ?? null;

    const [row] = await db
      .update(skills)
      .set(set)
      .where(and(eq(skills.id, id), isNull(skills.deletedAt)))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);

    if (input.levels !== undefined) {
      await db.delete(skillLevels).where(eq(skillLevels.skillId, id));
      await insertLevels(db, id, input.levels);
    }
    return c.json(await loadFull(db, row), 200);
  },
);

skillsRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['skills'],
    request: { params: idParam },
    responses: {
      204: { description: 'Eliminada' },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const [row] = await db
      .update(skills)
      .set({ deletedAt: new Date() })
      .where(and(eq(skills.id, id), isNull(skills.deletedAt)))
      .returning({ id: skills.id });
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.body(null, 204);
  },
);
