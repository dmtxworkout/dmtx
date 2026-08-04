import { createRoute, z } from '@hono/zod-openapi';
import { and, count, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { workoutBlocks, workoutItems, workouts } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import {
  createWorkoutSchema,
  paginated,
  paginationQuerySchema,
  slugify,
  updateWorkoutSchema,
  workoutKindSchema,
  workoutListItemSchema,
  workoutSchema,
} from '@dmtx/schemas';
import type { WorkoutBlockInput } from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { requireAdmin } from '../middleware/auth';

const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });

type WorkoutRow = typeof workouts.$inferSelect;
type BlockRow = typeof workoutBlocks.$inferSelect;
type ItemRow = typeof workoutItems.$inferSelect;

function serializeItem(it: ItemRow) {
  return {
    id: it.id,
    kind: it.kind,
    exerciseId: it.exerciseId,
    measure: it.measure ?? null,
    sets: it.sets,
    reps: it.reps,
    workSeconds: it.workSeconds,
    distanceMeters: it.distanceMeters,
    restBetweenSeconds: it.restBetweenSeconds,
    tempoOverride: it.tempoOverride ?? null,
    loadPrescription: it.loadPrescription ?? null,
    perSide: it.perSide,
    intervalIndex: it.intervalIndex,
    notes: it.notes,
  };
}

function base(w: WorkoutRow) {
  return {
    id: w.id,
    slug: w.slug,
    name: w.name,
    description: w.description,
    kind: w.kind,
    type: w.type,
    format: w.format,
    difficulty: w.difficulty,
    estimatedDurationSeconds: w.estimatedDurationSeconds,
    status: w.status,
    thumbnailAssetId: w.thumbnailAssetId,
    videoAssetId: w.videoAssetId,
    videoDurationSeconds: w.videoDurationSeconds,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

async function loadFull(db: Database, w: WorkoutRow) {
  const blocks = await db
    .select()
    .from(workoutBlocks)
    .where(eq(workoutBlocks.workoutId, w.id))
    .orderBy(workoutBlocks.position);
  const blockIds = blocks.map((b) => b.id);
  const items = blockIds.length
    ? await db
        .select()
        .from(workoutItems)
        .where(inArray(workoutItems.blockId, blockIds))
        .orderBy(workoutItems.position)
    : [];
  const byBlock = new Map<string, ItemRow[]>();
  for (const it of items) {
    const arr = byBlock.get(it.blockId) ?? [];
    arr.push(it);
    byBlock.set(it.blockId, arr);
  }
  return {
    ...base(w),
    formatConfig: w.formatConfig ?? null,
    scoringGoal: w.scoringGoal ?? null,
    warmupWorkoutId: w.warmupWorkoutId,
    cooldownWorkoutId: w.cooldownWorkoutId,
    blocks: blocks.map((b: BlockRow) => ({
      id: b.id,
      kind: b.kind,
      section: b.section,
      type: b.type,
      rounds: b.rounds,
      label: b.label,
      notes: b.notes,
      items: (byBlock.get(b.id) ?? []).map(serializeItem),
    })),
  };
}

async function insertBlocks(db: Database, workoutId: string, blocks: WorkoutBlockInput[]) {
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i]!;
    const [block] = await db
      .insert(workoutBlocks)
      .values({
        workoutId,
        position: i,
        kind: b.kind,
        section: b.section,
        type: b.type,
        rounds: b.rounds ?? null,
        label: b.label ?? null,
        notes: b.notes ?? null,
      })
      .returning({ id: workoutBlocks.id });
    if (block && b.items.length) {
      await db.insert(workoutItems).values(
        b.items.map((it, j) => ({
          blockId: block.id,
          position: j,
          kind: it.kind,
          exerciseId: it.exerciseId ?? null,
          measure: it.measure ?? null,
          sets: it.sets ?? null,
          reps: it.reps ?? null,
          workSeconds: it.workSeconds ?? null,
          distanceMeters: it.distanceMeters ?? null,
          restBetweenSeconds: it.restBetweenSeconds ?? null,
          tempoOverride: it.tempoOverride ?? null,
          loadPrescription: it.loadPrescription ?? null,
          perSide: it.perSide,
          intervalIndex: it.intervalIndex ?? null,
          notes: it.notes ?? null,
        })),
      );
    }
  }
}

export const workoutsRoute = createApp();
workoutsRoute.use('*', requireAdmin);

workoutsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['workouts'],
    request: { query: paginationQuerySchema.extend({ kind: workoutKindSchema.optional() }) },
    responses: {
      200: {
        description: 'Lista de rutinas',
        content: { 'application/json': { schema: paginated(workoutListItemSchema) } },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { page, pageSize, search, kind } = c.req.valid('query');
    const where = and(
      isNull(workouts.deletedAt),
      kind ? eq(workouts.kind, kind) : undefined,
      search ? ilike(workouts.name, `%${search}%`) : undefined,
    );
    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(workouts)
        .where(where)
        .orderBy(desc(workouts.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(workouts).where(where),
    ]);
    return c.json({ data: rows.map(base), total: totals?.value ?? 0, page, pageSize }, 200);
  },
);

workoutsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['workouts'],
    request: { params: idParam },
    responses: {
      200: { description: 'Rutina', content: { 'application/json': { schema: workoutSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const [row] = await db
      .select()
      .from(workouts)
      .where(and(eq(workouts.id, id), isNull(workouts.deletedAt)))
      .limit(1);
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.json(await loadFull(db, row), 200);
  },
);

workoutsRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['workouts'],
    request: { body: { content: { 'application/json': { schema: createWorkoutSchema } } } },
    responses: {
      201: { description: 'Creada', content: { 'application/json': { schema: workoutSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const structured = input.type === 'structured';
    const [row] = await db
      .insert(workouts)
      .values({
        slug: input.slug ?? slugify(input.name),
        name: input.name,
        description: input.description ?? null,
        kind: input.kind,
        type: input.type,
        format: structured ? (input.format ?? null) : null,
        difficulty: input.difficulty,
        estimatedDurationSeconds: input.estimatedDurationSeconds ?? null,
        status: input.status,
        thumbnailAssetId: input.thumbnailAssetId ?? null,
        videoAssetId: structured ? null : (input.videoAssetId ?? null),
        videoDurationSeconds: structured ? null : (input.videoDurationSeconds ?? null),
        formatConfig: structured ? (input.formatConfig ?? null) : null,
        scoringGoal: input.scoringGoal ?? null,
        warmupWorkoutId: structured ? (input.warmupWorkoutId ?? null) : null,
        cooldownWorkoutId: structured ? (input.cooldownWorkoutId ?? null) : null,
      })
      .returning();
    if (!row) throw new Error('No se pudo crear la rutina');
    if (structured && input.blocks.length) await insertBlocks(db, row.id, input.blocks);
    return c.json(await loadFull(db, row), 201);
  },
);

workoutsRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['workouts'],
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: updateWorkoutSchema } } },
    },
    responses: {
      200: { description: 'Actualizada', content: { 'application/json': { schema: workoutSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const set: Partial<typeof workouts.$inferInsert> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.slug !== undefined) set.slug = input.slug;
    if (input.description !== undefined) set.description = input.description ?? null;
    if (input.kind !== undefined) set.kind = input.kind;
    if (input.type !== undefined) set.type = input.type;
    if (input.format !== undefined) set.format = input.format ?? null;
    if (input.difficulty !== undefined) set.difficulty = input.difficulty;
    if (input.estimatedDurationSeconds !== undefined)
      set.estimatedDurationSeconds = input.estimatedDurationSeconds ?? null;
    if (input.status !== undefined) set.status = input.status;
    if (input.thumbnailAssetId !== undefined) set.thumbnailAssetId = input.thumbnailAssetId ?? null;
    if (input.videoAssetId !== undefined) set.videoAssetId = input.videoAssetId ?? null;
    if (input.videoDurationSeconds !== undefined)
      set.videoDurationSeconds = input.videoDurationSeconds ?? null;
    if (input.formatConfig !== undefined) set.formatConfig = input.formatConfig ?? null;
    if (input.scoringGoal !== undefined) set.scoringGoal = input.scoringGoal ?? null;
    if (input.warmupWorkoutId !== undefined) set.warmupWorkoutId = input.warmupWorkoutId ?? null;
    if (input.cooldownWorkoutId !== undefined)
      set.cooldownWorkoutId = input.cooldownWorkoutId ?? null;

    const [row] = await db
      .update(workouts)
      .set(set)
      .where(and(eq(workouts.id, id), isNull(workouts.deletedAt)))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);

    if (input.blocks !== undefined) {
      await db.delete(workoutBlocks).where(eq(workoutBlocks.workoutId, id));
      if (input.blocks.length) await insertBlocks(db, id, input.blocks);
    }
    return c.json(await loadFull(db, row), 200);
  },
);

workoutsRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['workouts'],
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
      .update(workouts)
      .set({ deletedAt: new Date() })
      .where(and(eq(workouts.id, id), isNull(workouts.deletedAt)))
      .returning({ id: workouts.id });
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.body(null, 204);
  },
);
