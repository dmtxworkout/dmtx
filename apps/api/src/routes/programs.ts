import { createRoute, z } from '@hono/zod-openapi';
import { and, count, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { programDays, programs, workoutBlocks, workouts } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import { sectionValues } from '../lib/workout-sections';
import {
  createProgramSchema,
  paginated,
  paginationQuerySchema,
  programListItemSchema,
  programSchema,
  slugify,
  updateProgramSchema,
} from '@dmtx/schemas';
import type { ProgramDayInput } from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { requireAdmin } from '../middleware/auth';
import { insertBlocks, uniqueSlug } from './workouts';

const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });

type ProgramRow = typeof programs.$inferSelect;
type DayRow = typeof programDays.$inferSelect;
type WorkoutRow = typeof workouts.$inferSelect;

function base(p: ProgramRow) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    difficulty: p.difficulty,
    status: p.status,
    thumbnailAssetId: p.thumbnailAssetId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** The days of one or more programs with their owned workouts, in order. */
async function daysOf(db: Database, programIds: string[]) {
  if (!programIds.length) return [] as (DayRow & { workout: WorkoutRow | null })[];
  const rows = await db
    .select({ day: programDays, workout: workouts })
    .from(programDays)
    .leftJoin(workouts, eq(workouts.id, programDays.workoutId))
    .where(inArray(programDays.programId, programIds))
    .orderBy(programDays.position);
  return rows.map((r) => ({ ...r.day, workout: r.workout }));
}

function serializeDay(d: DayRow & { workout: WorkoutRow | null }) {
  return {
    id: d.id,
    isRestDay: d.isRestDay,
    workoutId: d.workout?.id ?? null,
    type: d.workout?.type ?? ('structured' as const),
    sourceText: d.workout?.sourceText ?? '',
    videoAssetId: d.workout?.videoAssetId ?? null,
    warmupVideoAssetId: d.workout?.warmupVideoAssetId ?? null,
    cooldownVideoAssetId: d.workout?.cooldownVideoAssetId ?? null,
    videoNotes: d.workout?.videoNotes ?? null,
  };
}

async function loadFull(db: Database, p: ProgramRow) {
  const days = await daysOf(db, [p.id]);
  return { ...base(p), days: days.map(serializeDay) };
}

/**
 * Write the program's days. A day with content owns a rutina (a workout row
 * hidden from the catalog) built from what the admin wrote; a rest day has
 * none. Days with an id are updated in place, new ones created, the rest
 * deleted with their rutina.
 */
async function syncDays(db: Database, program: ProgramRow, days: ProgramDayInput[]) {
  const existing = await db.select().from(programDays).where(eq(programDays.programId, program.id));
  const keep = new Set(days.map((d) => d.id).filter((id): id is string => !!id));
  const gone = existing.filter((d) => !keep.has(d.id));
  const retire = (workoutIds: string[]) =>
    workoutIds.length ? db.update(workouts).set({ deletedAt: new Date() }).where(inArray(workouts.id, workoutIds)) : Promise.resolve();
  if (gone.length) {
    await db.delete(programDays).where(inArray(programDays.id, gone.map((d) => d.id)));
    await retire(gone.map((d) => d.workoutId).filter((id): id is string => !!id));
  }
  const byId = new Map(existing.map((d) => [d.id, d]));
  for (let i = 0; i < days.length; i += 1) {
    const d = days[i]!;
    const current = d.id ? byId.get(d.id) : undefined;
    const label = `Día ${i + 1}`;
    // Each section of the day is text or a video; a day with neither is empty.
    const sections = await sectionValues(db, d);
    const hasContent = !d.isRestDay && (sections.hasContent || !!d.sourceText?.trim());
    let workoutId: string | null = null;
    if (hasContent) {
      const values = {
        name: `${program.name} · ${label}`,
        type: sections.type,
        format: sections.format,
        difficulty: program.difficulty,
        estimatedDurationSeconds: sections.estimatedDurationSeconds,
        status: program.status,
        sourceText: d.sourceText ?? null,
        videoAssetId: sections.videoAssetId,
        warmupVideoAssetId: sections.warmupVideoAssetId,
        cooldownVideoAssetId: sections.cooldownVideoAssetId,
        videoNotes: sections.videoNotes,
        ownerProgramId: program.id,
      };
      if (current?.workoutId) {
        workoutId = current.workoutId;
        await db.update(workouts).set(values).where(eq(workouts.id, workoutId));
        await db.delete(workoutBlocks).where(eq(workoutBlocks.workoutId, workoutId));
      } else {
        const [w] = await db
          .insert(workouts)
          .values({ ...values, slug: await uniqueSlug(db, slugify(`${program.name} ${label}`)) })
          .returning({ id: workouts.id });
        if (!w) throw new Error('No se pudo crear la rutina del día');
        workoutId = w.id;
      }
      if (sections.blocks.length) await insertBlocks(db, workoutId, sections.blocks);
    } else if (current?.workoutId) {
      // Became a rest day (or was emptied): its rutina goes.
      await retire([current.workoutId]);
    }
    const dayValues = { position: i, isRestDay: d.isRestDay, workoutId };
    if (current) await db.update(programDays).set(dayValues).where(eq(programDays.id, current.id));
    else await db.insert(programDays).values({ programId: program.id, ...dayValues });
  }
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
    const where = and(isNull(programs.deletedAt), search ? ilike(programs.name, `%${search}%`) : undefined);
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
    const counts = rows.length
      ? await db
          .select({ programId: programDays.programId, value: count() })
          .from(programDays)
          .where(inArray(programDays.programId, rows.map((r) => r.id)))
          .groupBy(programDays.programId)
      : [];
    const byP = new Map(counts.map((r) => [r.programId, r.value]));
    const data = rows.map((p) => ({ ...base(p), dayCount: byP.get(p.id) ?? 0 }));
    return c.json({ data, total: totals?.value ?? 0, page, pageSize }, 200);
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
        difficulty: input.difficulty,
        status: input.status,
        thumbnailAssetId: input.thumbnailAssetId ?? null,
      })
      .returning();
    if (!row) throw new Error('No se pudo crear el programa');
    await syncDays(db, row, input.days);
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
    const set: Partial<typeof programs.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) set.name = input.name;
    if (input.slug !== undefined) set.slug = input.slug;
    if (input.description !== undefined) set.description = input.description ?? null;
    if (input.difficulty !== undefined) set.difficulty = input.difficulty;
    if (input.status !== undefined) set.status = input.status;
    if (input.thumbnailAssetId !== undefined) set.thumbnailAssetId = input.thumbnailAssetId ?? null;

    const [row] = await db
      .update(programs)
      .set(set)
      .where(and(eq(programs.id, id), isNull(programs.deletedAt)))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);

    if (input.days !== undefined) await syncDays(db, row, input.days);
    else {
      // Name, status or difficulty changed: the days' rutinas follow the program.
      await db
        .update(workouts)
        .set({ status: row.status, difficulty: row.difficulty })
        .where(eq(workouts.ownerProgramId, row.id));
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
    await db.update(workouts).set({ deletedAt: new Date() }).where(eq(workouts.ownerProgramId, id));
    return c.body(null, 204);
  },
);
