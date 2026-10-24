import { createRoute, z } from '@hono/zod-openapi';
import { and, count, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { skillLevels, skills, workoutBlocks, workouts } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import { estimateDurationSeconds } from '@dmtx/core';
import { insertBlocks, uniqueSlug } from './workouts';
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

type LevelRow = typeof skillLevels.$inferSelect;

async function levelsOf(db: Database, skillIds: string[]) {
  if (!skillIds.length) return [] as (LevelRow & { sourceText: string })[];
  const rows = await db
    .select({ level: skillLevels, sourceText: workouts.sourceText })
    .from(skillLevels)
    .innerJoin(workouts, eq(workouts.id, skillLevels.workoutId))
    .where(inArray(skillLevels.skillId, skillIds))
    .orderBy(skillLevels.position);
  return rows.map((r) => ({ ...r.level, sourceText: r.sourceText ?? '' }));
}

function serializeLevel(l: LevelRow & { sourceText: string }) {
  return {
    id: l.id,
    name: l.name,
    description: l.description,
    workoutId: l.workoutId,
    sourceText: l.sourceText,
    unlockGoals: l.unlockGoals ?? [],
    thumbnailAssetId: l.thumbnailAssetId,
  };
}

async function loadFull(db: Database, s: SkillRow) {
  const levels = await levelsOf(db, [s.id]);
  return { ...base(s), levels: levels.map(serializeLevel) };
}

/**
 * Write the skill's levels: each level owns a rutina (a workout row hidden
 * from the catalog) built from the text the admin wrote. Levels with an id are
 * updated in place, new ones created, the rest deleted with their rutina.
 */
async function syncLevels(db: Database, skill: SkillRow, levels: SkillLevelInput[]) {
  const existing = await db.select().from(skillLevels).where(eq(skillLevels.skillId, skill.id));
  const keep = new Set(levels.map((l) => l.id).filter((id): id is string => !!id));
  const gone = existing.filter((l) => !keep.has(l.id));
  if (gone.length) {
    await db.delete(skillLevels).where(inArray(skillLevels.id, gone.map((l) => l.id)));
    await db.update(workouts).set({ deletedAt: new Date() }).where(inArray(workouts.id, gone.map((l) => l.workoutId)));
  }
  const byId = new Map(existing.map((l) => [l.id, l]));
  for (let i = 0; i < levels.length; i += 1) {
    const l = levels[i]!;
    const workoutValues = {
      name: `${skill.name} · ${l.name}`,
      description: l.description ?? null,
      // A level is always a written rutina (no video), the app guides it.
      hasVideo: false,
      isGuided: l.blocks.some((b) => b.section === 'main'),
      format: l.format ?? null,
      difficulty: skill.difficulty ?? 'beginner',
      estimatedDurationSeconds: estimateDurationSeconds(l.blocks),
      status: skill.status,
      thumbnailAssetId: l.thumbnailAssetId ?? null,
      sourceText: l.sourceText,
      ownerSkillId: skill.id,
    };
    const current = l.id ? byId.get(l.id) : undefined;
    if (current) {
      await db.update(workouts).set(workoutValues).where(eq(workouts.id, current.workoutId));
      await db.delete(workoutBlocks).where(eq(workoutBlocks.workoutId, current.workoutId));
      if (l.blocks.length) await insertBlocks(db, current.workoutId, l.blocks);
      await db
        .update(skillLevels)
        .set({ position: i, name: l.name, description: l.description ?? null, unlockGoals: l.unlockGoals, thumbnailAssetId: l.thumbnailAssetId ?? null })
        .where(eq(skillLevels.id, current.id));
    } else {
      const [w] = await db
        .insert(workouts)
        .values({ ...workoutValues, slug: await uniqueSlug(db, slugify(`${skill.name} ${l.name}`)) })
        .returning({ id: workouts.id });
      if (!w) throw new Error('No se pudo crear la rutina del nivel');
      if (l.blocks.length) await insertBlocks(db, w.id, l.blocks);
      await db.insert(skillLevels).values({
        skillId: skill.id,
        position: i,
        name: l.name,
        description: l.description ?? null,
        workoutId: w.id,
        unlockGoals: l.unlockGoals,
        thumbnailAssetId: l.thumbnailAssetId ?? null,
      });
    }
  }
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
    const levels = await levelsOf(db, rows.map((r) => r.id));
    const byS = new Map<string, (typeof levels)[number][]>();
    for (const l of levels) {
      const arr = byS.get(l.skillId) ?? [];
      arr.push(l);
      byS.set(l.skillId, arr);
    }
    const data = rows.map((s) => ({ ...base(s), levels: (byS.get(s.id) ?? []).map(serializeLevel) }));
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
    await syncLevels(db, row, input.levels);
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

    if (input.levels !== undefined) await syncLevels(db, row, input.levels);
    else {
      // Name, status or difficulty changed: the levels' rutinas follow the skill.
      await db
        .update(workouts)
        .set({ status: row.status, difficulty: row.difficulty ?? 'beginner' })
        .where(eq(workouts.ownerSkillId, row.id));
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
    await db.update(workouts).set({ deletedAt: new Date() }).where(eq(workouts.ownerSkillId, id));
    return c.body(null, 204);
  },
);
