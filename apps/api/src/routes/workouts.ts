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
  workoutListItemSchema,
  workoutSchema,
} from '@dmtx/schemas';
import type { WorkoutBlockInput } from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { missingVideosMessage, sectionValues } from '../lib/workout-sections';
import { musclesOfWorkout, syncWorkoutMuscles } from '../lib/workout-muscles';
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
    hasVideo: w.hasVideo,
    isGuided: w.isGuided,
    fullBody: w.fullBody,
    format: w.format,
    difficulty: w.difficulty,
    estimatedDurationSeconds: w.estimatedDurationSeconds,
    status: w.status,
    thumbnailAssetId: w.thumbnailAssetId,
    videoAssetId: w.videoAssetId,
    warmupVideoAssetId: w.warmupVideoAssetId,
    cooldownVideoAssetId: w.cooldownVideoAssetId,
    variantOfId: w.variantOfId,
    variantLabel: w.variantLabel,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export type Nested<T> = T & { blocks: Nested<T>[] };
/** Rows → a tree of blocks (parts and groups nest to any depth) in position order. */
export function nestBlocks<T extends { id: string; parentBlockId: string | null; position: number }>(
  rows: T[],
): Nested<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const r of rows) {
    const arr = byParent.get(r.parentBlockId) ?? [];
    arr.push(r);
    byParent.set(r.parentBlockId, arr);
  }
  const build = (parent: string | null): Nested<T>[] =>
    [...(byParent.get(parent) ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((b) => ({ ...b, blocks: build(b.id) }));
  return build(null);
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
  const variants = w.variantOfId
    ? []
    : await db
        .select({ id: workouts.id, label: workouts.variantLabel })
        .from(workouts)
        .where(and(eq(workouts.variantOfId, w.id), isNull(workouts.deletedAt)))
        .orderBy(workouts.createdAt);
  const muscles = await musclesOfWorkout(db, w.id);
  return {
    ...base(w),
    muscles,
    variants: variants.map((v) => ({ id: v.id, label: v.label ?? '' })),
    scoringGoal: w.scoringGoal ?? null,
    sourceText: w.sourceText ?? null,
    blocks: nestBlocks(blocks).map(function tree(b): WorkoutBlockOut {
      return { ...serializeBlock(b, byBlock), blocks: b.blocks.map(tree) };
    }),
  };
}

type WorkoutBlockOut = ReturnType<typeof serializeBlock> & { blocks: WorkoutBlockOut[] };
function serializeBlock(b: BlockRow, byBlock: Map<string, ItemRow[]>) {
  return {
    id: b.id,
    kind: b.kind,
    section: b.section,
    type: b.type,
    rounds: b.rounds,
    label: b.label,
    notes: b.notes,
    format: b.format ?? null,
    formatConfig: b.formatConfig ?? null,
    items: (byBlock.get(b.id) ?? []).map(serializeItem),
  };
}

export async function insertBlocks(
  db: Database,
  workoutId: string,
  blocks: WorkoutBlockInput[],
  parentBlockId: string | null = null,
) {
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i]!;
    const [block] = await db
      .insert(workoutBlocks)
      .values({
        workoutId,
        parentBlockId,
        position: i,
        kind: b.kind,
        section: b.section,
        type: b.type,
        rounds: b.rounds ?? null,
        label: b.label ?? null,
        notes: b.notes ?? null,
        format: b.kind === 'part' ? (b.format ?? null) : null,
        formatConfig: b.kind === 'part' ? (b.formatConfig ?? null) : null,
      })
      .returning({ id: workoutBlocks.id });
    if (block && b.blocks?.length) await insertBlocks(db, workoutId, b.blocks, block.id);
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

/** A slug nobody else has: the base slug, else base-2, base-3, … */
export async function uniqueSlug(db: Database, wanted: string): Promise<string> {
  const taken = new Set(
    (
      await db
        .select({ slug: workouts.slug })
        .from(workouts)
        .where(ilike(workouts.slug, `${wanted}%`))
    ).map((r) => r.slug),
  );
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; ; n += 1) {
    const candidate = `${wanted}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const workoutsRoute = createApp();
workoutsRoute.use('*', requireAdmin);

workoutsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['workouts'],
    request: { query: paginationQuerySchema },
    responses: {
      200: {
        description: 'Lista de rutinas',
        content: { 'application/json': { schema: paginated(workoutListItemSchema) } },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { page, pageSize, search } = c.req.valid('query');
    const where = and(
      isNull(workouts.deletedAt),
      isNull(workouts.variantOfId),
      // A skill level's or a program day's rutina is edited from its owner, not here.
      isNull(workouts.ownerSkillId), isNull(workouts.ownerProgramId),
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
      400: { description: 'No se puede publicar', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    if (input.status === 'published') {
      const missing = await missingVideosMessage(db, [input]);
      if (missing) return c.json({ error: missing }, 400);
    }
    // Each section is written, a video or both; the flags, format and duration follow from that.
    const sections = await sectionValues(db, input);
    // Variants share the base name; their slug carries the level label.
    const wantedSlug =
      input.slug ?? slugify(input.variantOfId ? `${input.name} ${input.variantLabel ?? 'variante'}` : input.name);
    const [row] = await db
      .insert(workouts)
      .values({
        slug: await uniqueSlug(db, wantedSlug),
        name: input.name,
        description: input.description ?? null,
        hasVideo: sections.hasVideo,
        isGuided: sections.isGuided,
        format: sections.format,
        difficulty: input.difficulty,
        estimatedDurationSeconds: sections.estimatedDurationSeconds,
        status: input.status,
        thumbnailAssetId: input.thumbnailAssetId ?? null,
        videoAssetId: sections.videoAssetId,
        warmupVideoAssetId: sections.warmupVideoAssetId,
        cooldownVideoAssetId: sections.cooldownVideoAssetId,
        scoringGoal: input.scoringGoal ?? null,
        sourceText: input.sourceText ?? null,
        variantOfId: input.variantOfId ?? null,
        variantLabel: input.variantLabel ?? null,
      })
      .returning();
    if (!row) throw new Error('No se pudo crear la rutina');
    if (sections.blocks.length) await insertBlocks(db, row.id, sections.blocks);
    await syncWorkoutMuscles(db, [row.id], input.extraMuscleIds ?? []);
    const [fresh] = await db.select().from(workouts).where(eq(workouts.id, row.id)).limit(1);
    return c.json(await loadFull(db, fresh ?? row), 201);
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
      400: { description: 'No se puede publicar', content: { 'application/json': { schema: errorSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    // Published (now or already): every video it will point at must still be in the library.
    {
      const [now] = await db.select().from(workouts).where(eq(workouts.id, id)).limit(1);
      if (!now) return c.json({ error: 'No encontrado' }, 404);
      if ((input.status ?? now.status) === 'published') {
        const missing = await missingVideosMessage(db, [
          {
            warmupVideoAssetId: input.warmupVideoAssetId !== undefined ? input.warmupVideoAssetId : now.warmupVideoAssetId,
            videoAssetId: input.videoAssetId !== undefined ? input.videoAssetId : now.videoAssetId,
            cooldownVideoAssetId: input.cooldownVideoAssetId !== undefined ? input.cooldownVideoAssetId : now.cooldownVideoAssetId,
          },
        ]);
        if (missing) return c.json({ error: missing }, 400);
      }
    }
    const set: Partial<typeof workouts.$inferInsert> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.slug !== undefined) set.slug = input.slug;
    if (input.description !== undefined) set.description = input.description ?? null;
    if (input.difficulty !== undefined) set.difficulty = input.difficulty;
    if (input.status !== undefined) set.status = input.status;
    if (input.thumbnailAssetId !== undefined) set.thumbnailAssetId = input.thumbnailAssetId ?? null;
    // The sections travel together: blocks plus the three videos (the editor always sends them all).
    let blocks: WorkoutBlockInput[] | undefined;
    if (input.blocks !== undefined || input.videoAssetId !== undefined || input.warmupVideoAssetId !== undefined || input.cooldownVideoAssetId !== undefined) {
      const [current] = await db.select().from(workouts).where(eq(workouts.id, id)).limit(1);
      if (!current) return c.json({ error: 'No encontrado' }, 404);
      // Without blocks in the request, the stored ones stay (and still count for the estimate).
      const existing = input.blocks === undefined ? (await loadFull(db, current)).blocks : undefined;
      const sections = await sectionValues(db, {
        blocks: input.blocks ?? (existing as unknown as WorkoutBlockInput[]),
        format: input.format !== undefined ? input.format : current.format,
        videoAssetId: input.videoAssetId !== undefined ? input.videoAssetId : current.videoAssetId,
        warmupVideoAssetId: input.warmupVideoAssetId !== undefined ? input.warmupVideoAssetId : current.warmupVideoAssetId,
        cooldownVideoAssetId: input.cooldownVideoAssetId !== undefined ? input.cooldownVideoAssetId : current.cooldownVideoAssetId,
      });
      set.hasVideo = sections.hasVideo;
      set.isGuided = sections.isGuided;
      set.format = sections.format;
      set.videoAssetId = sections.videoAssetId;
      set.warmupVideoAssetId = sections.warmupVideoAssetId;
      set.cooldownVideoAssetId = sections.cooldownVideoAssetId;
      set.estimatedDurationSeconds = sections.estimatedDurationSeconds;
      if (input.blocks !== undefined) blocks = sections.blocks;
    } else if (input.format !== undefined) set.format = input.format ?? null;
    if (input.scoringGoal !== undefined) set.scoringGoal = input.scoringGoal ?? null;
    if (input.sourceText !== undefined) set.sourceText = input.sourceText ?? null;
    if (input.variantOfId !== undefined) set.variantOfId = input.variantOfId ?? null;
    if (input.variantLabel !== undefined) set.variantLabel = input.variantLabel ?? null;

    const [row] = await db
      .update(workouts)
      .set(set)
      .where(and(eq(workouts.id, id), isNull(workouts.deletedAt)))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);

    if (blocks !== undefined) {
      await db.delete(workoutBlocks).where(eq(workoutBlocks.workoutId, id));
      if (blocks.length) await insertBlocks(db, id, blocks);
    }
    if (blocks !== undefined || input.extraMuscleIds !== undefined) await syncWorkoutMuscles(db, [id], input.extraMuscleIds);
    const [fresh] = await db.select().from(workouts).where(eq(workouts.id, id)).limit(1);
    return c.json(await loadFull(db, fresh ?? row), 200);
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
    // Variants go with their base.
    await db.update(workouts).set({ deletedAt: new Date() }).where(eq(workouts.variantOfId, id));
    return c.body(null, 204);
  },
);
