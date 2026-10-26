import { createRoute, z } from '@hono/zod-openapi';
import { and, count, desc, eq, ilike, inArray, isNull, or, sql, isNotNull } from 'drizzle-orm';
import { exerciseEquipment, exerciseMuscles, exercises, reusableBlocks, setResults, workoutItems } from '@dmtx/db';
import { Catalog, parseRutina } from '@dmtx/core';
import type { Database } from '@dmtx/db';
import {
  bulkExerciseResultSchema,
  bulkExerciseSchema,
  createExerciseSchema,
  exerciseSchema,
  paginated,
  paginationQuerySchema,
  slugify,
  updateExerciseSchema,
} from '@dmtx/schemas';
import { syncWorkoutMuscles, workoutsUsing } from '../lib/workout-muscles';
import { createApp } from '../lib/openapi';
import { requireAdmin } from '../middleware/auth';

const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });
const listItemSchema = exerciseSchema;

type ExerciseRow = typeof exercises.$inferSelect;

function serializeBase(row: ExerciseRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    cues: row.cues,
    aliases: row.aliases,
    difficulty: row.difficulty,
    defaultTempo: row.defaultTempo ?? null,
    demoVideoAssetId: row.demoVideoAssetId,
    thumbnailAssetId: row.thumbnailAssetId,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadRelations(db: Database, id: string) {
  const [ms, eq_] = await Promise.all([
    db
      .select({ muscleId: exerciseMuscles.muscleId })
      .from(exerciseMuscles)
      .where(eq(exerciseMuscles.exerciseId, id)),
    db
      .select({ equipmentId: exerciseEquipment.equipmentId })
      .from(exerciseEquipment)
      .where(eq(exerciseEquipment.exerciseId, id)),
  ]);
  return {
    muscleIds: ms.map((m) => m.muscleId),
    equipmentIds: eq_.map((e) => e.equipmentId),
  };
}

/**
 * Why an exercise cannot be deleted, or null when nothing references it. An
 * exercise that rutinas or athletes' results point to is a reference: archive
 * it instead, so nothing breaks or loses its history.
 */
async function deleteBlocker(db: Database, id: string): Promise<string | null> {
  const [[inRutinas], [inResults], blocks, catalogRows] = await Promise.all([
    db.select({ value: count() }).from(workoutItems).where(eq(workoutItems.exerciseId, id)),
    db.select({ value: count() }).from(setResults).where(eq(setResults.exerciseId, id)),
    db.select({ text: reusableBlocks.text }).from(reusableBlocks),
    db
      .select({ id: exercises.id, name: exercises.name, aliases: exercises.aliases })
      .from(exercises)
      .where(isNull(exercises.deletedAt)),
  ]);
  // Reusable blocks keep text, not ids: parse them to see which resolve to this exercise.
  const catalog = new Catalog(catalogRows);
  const inBlocks = blocks.filter((b) => {
    const parsed = parseRutina(b.text, { catalog });
    const uses = (list: typeof parsed.blocks): boolean =>
      list.some((blk) => blk.items.some((it) => it.match?.id === id) || uses(blk.children ?? []));
    return uses(parsed.blocks);
  }).length;
  if ((inRutinas?.value ?? 0) === 0 && (inResults?.value ?? 0) === 0 && inBlocks === 0) return null;
  const parts = [
    inRutinas?.value ? `${inRutinas.value} línea${inRutinas.value === 1 ? '' : 's'} de rutina` : null,
    inBlocks ? `${inBlocks} bloque${inBlocks === 1 ? '' : 's'} reutilizable${inBlocks === 1 ? '' : 's'}` : null,
    inResults?.value ? `${inResults.value} resultado${inResults.value === 1 ? '' : 's'} de usuarios` : null,
  ].filter(Boolean);
  return `lo usan ${parts.join(', ')}`;
}

export const exercisesRoute = createApp();
exercisesRoute.use('*', requireAdmin);

// --- List --------------------------------------------------------------------
exercisesRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['exercises'],
    request: { query: paginationQuerySchema.extend({ archived: z.enum(['false', 'true', 'all']).default('false') }) },
    responses: {
      200: {
        description: 'Lista paginada de ejercicios',
        content: { 'application/json': { schema: paginated(listItemSchema) } },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { page, pageSize, search, archived } = c.req.valid('query');
    const where = and(
      isNull(exercises.deletedAt),
      archived === 'all' ? undefined : archived === 'true' ? isNotNull(exercises.archivedAt) : isNull(exercises.archivedAt),
      search
        ? or(
            ilike(exercises.name, `%${search}%`),
            // aliases is a jsonb string[]; match any alias by text.
            sql`${exercises.aliases}::text ilike ${`%${search}%`}`,
          )
        : undefined,
    );
    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(exercises)
        .where(where)
        .orderBy(desc(exercises.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(exercises).where(where),
    ]);
    // Relations for the page in two queries, not two per row.
    const ids = rows.map((r) => r.id);
    const [ms, eqs] = ids.length
      ? await Promise.all([
          db
            .select({ exerciseId: exerciseMuscles.exerciseId, muscleId: exerciseMuscles.muscleId })
            .from(exerciseMuscles)
            .where(inArray(exerciseMuscles.exerciseId, ids)),
          db
            .select({ exerciseId: exerciseEquipment.exerciseId, equipmentId: exerciseEquipment.equipmentId })
            .from(exerciseEquipment)
            .where(inArray(exerciseEquipment.exerciseId, ids)),
        ])
      : [[], []];
    const data = rows.map((r) => ({
      ...serializeBase(r),
      muscleIds: ms.filter((m) => m.exerciseId === r.id).map((m) => m.muscleId),
      equipmentIds: eqs.filter((e) => e.exerciseId === r.id).map((e) => e.equipmentId),
    }));
    return c.json({ data, total: totals?.value ?? 0, page, pageSize }, 200);
  },
);

// --- Bulk --------------------------------------------------------------------
exercisesRoute.openapi(
  createRoute({
    method: 'post',
    path: '/bulk',
    tags: ['exercises'],
    request: { body: { content: { 'application/json': { schema: bulkExerciseSchema } } } },
    responses: {
      200: { description: 'Resultado', content: { 'application/json': { schema: bulkExerciseResultSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const rows = await db
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(and(inArray(exercises.id, input.ids), isNull(exercises.deletedAt)));
    const ids = rows.map((r) => r.id);
    const refused: { id: string; name: string; reason: string }[] = [];
    if (!ids.length) return c.json({ done: 0, refused }, 200);
    const now = new Date();

    switch (input.action) {
      case 'archive':
      case 'restore':
        await db
          .update(exercises)
          .set({ archivedAt: input.action === 'archive' ? now : null, updatedAt: now })
          .where(inArray(exercises.id, ids));
        break;
      case 'delete': {
        const ok: string[] = [];
        for (const r of rows) {
          const why = await deleteBlocker(db, r.id);
          if (why) refused.push({ id: r.id, name: r.name, reason: why });
          else ok.push(r.id);
        }
        if (ok.length) await db.update(exercises).set({ deletedAt: now }).where(inArray(exercises.id, ok));
        return c.json({ done: ok.length, refused }, 200);
      }
      case 'add_muscles': {
        if (!input.muscleIds.length) break;
        const existing = await db
          .select({ exerciseId: exerciseMuscles.exerciseId, muscleId: exerciseMuscles.muscleId })
          .from(exerciseMuscles)
          .where(inArray(exerciseMuscles.exerciseId, ids));
        const has = new Set(existing.map((e) => `${e.exerciseId}:${e.muscleId}`));
        const values = ids.flatMap((exerciseId) =>
          input.muscleIds.filter((muscleId) => !has.has(`${exerciseId}:${muscleId}`)).map((muscleId) => ({ exerciseId, muscleId })),
        );
        if (values.length) await db.insert(exerciseMuscles).values(values);
        await db.update(exercises).set({ updatedAt: now }).where(inArray(exercises.id, ids));
        await syncWorkoutMuscles(db, await workoutsUsing(db, ids));
        break;
      }
      case 'remove_muscles':
        if (!input.muscleIds.length) break;
        await db
          .delete(exerciseMuscles)
          .where(and(inArray(exerciseMuscles.exerciseId, ids), inArray(exerciseMuscles.muscleId, input.muscleIds)));
        await db.update(exercises).set({ updatedAt: now }).where(inArray(exercises.id, ids));
        await syncWorkoutMuscles(db, await workoutsUsing(db, ids));
        break;
      case 'add_equipment': {
        if (!input.equipmentIds.length) break;
        const existing = await db
          .select({ exerciseId: exerciseEquipment.exerciseId, equipmentId: exerciseEquipment.equipmentId })
          .from(exerciseEquipment)
          .where(inArray(exerciseEquipment.exerciseId, ids));
        const has = new Set(existing.map((e) => `${e.exerciseId}:${e.equipmentId}`));
        const values = ids.flatMap((exerciseId) =>
          input.equipmentIds.filter((equipmentId) => !has.has(`${exerciseId}:${equipmentId}`)).map((equipmentId) => ({ exerciseId, equipmentId })),
        );
        if (values.length) await db.insert(exerciseEquipment).values(values);
        await db.update(exercises).set({ updatedAt: now }).where(inArray(exercises.id, ids));
        break;
      }
      case 'remove_equipment':
        if (!input.equipmentIds.length) break;
        await db
          .delete(exerciseEquipment)
          .where(and(inArray(exerciseEquipment.exerciseId, ids), inArray(exerciseEquipment.equipmentId, input.equipmentIds)));
        await db.update(exercises).set({ updatedAt: now }).where(inArray(exercises.id, ids));
        break;
    }
    return c.json({ done: ids.length, refused }, 200);
  },
);

// --- Get by id ---------------------------------------------------------------
exercisesRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['exercises'],
    request: { params: idParam },
    responses: {
      200: {
        description: 'Ejercicio',
        content: { 'application/json': { schema: exerciseSchema } },
      },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const [row] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, id), isNull(exercises.deletedAt)))
      .limit(1);
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    const rel = await loadRelations(db, id);
    return c.json({ ...serializeBase(row), ...rel }, 200);
  },
);

// --- Create ------------------------------------------------------------------
exercisesRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['exercises'],
    request: {
      body: { content: { 'application/json': { schema: createExerciseSchema } } },
    },
    responses: {
      201: {
        description: 'Ejercicio creado',
        content: { 'application/json': { schema: exerciseSchema } },
      },
      409: { description: 'Ya existe', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    // The same name, live, is a duplicate (archived or not). The slug must also
    // dodge soft-deleted rows, which still hold theirs: "handstand-2", …
    const [dup] = await db
      .select({ id: exercises.id, name: exercises.name, archivedAt: exercises.archivedAt })
      .from(exercises)
      .where(and(ilike(exercises.name, input.name.trim()), isNull(exercises.deletedAt)));
    const base = input.slug ?? slugify(input.name);
    const taken = new Set(
      (
        await db
          .select({ slug: exercises.slug })
          .from(exercises)
          .where(or(eq(exercises.slug, base), ilike(exercises.slug, `${base}-%`)))
      ).map((r) => r.slug),
    );
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
    if (dup) {
      return c.json(
        {
          error: dup.archivedAt
            ? `Ya existe «${dup.name}», archivado. Restáuralo desde Ejercicios en vez de crearlo de nuevo.`
            : `Ya existe un ejercicio llamado «${dup.name}».`,
        },
        409,
      );
    }
    const [row] = await db
      .insert(exercises)
      .values({
        slug,
        name: input.name,
        description: input.description ?? null,
        cues: input.cues,
        aliases: input.aliases,
        difficulty: input.difficulty,
        defaultTempo: input.defaultTempo ?? null,
        demoVideoAssetId: input.demoVideoAssetId ?? null,
        thumbnailAssetId: input.thumbnailAssetId ?? null,
      })
      .returning();
    if (!row) throw new Error('No se pudo crear el ejercicio');
    if (input.muscleIds.length) {
      await db.insert(exerciseMuscles).values(input.muscleIds.map((muscleId) => ({ exerciseId: row.id, muscleId })));
    }
    if (input.equipmentIds.length) {
      await db
        .insert(exerciseEquipment)
        .values(input.equipmentIds.map((equipmentId) => ({ exerciseId: row.id, equipmentId })));
    }
    return c.json(
      { ...serializeBase(row), muscleIds: input.muscleIds, equipmentIds: input.equipmentIds },
      201,
    );
  },
);

// --- Update ------------------------------------------------------------------
exercisesRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['exercises'],
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: updateExerciseSchema } } },
    },
    responses: {
      200: {
        description: 'Ejercicio actualizado',
        content: { 'application/json': { schema: exerciseSchema } },
      },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');

    const [row] = await db
      .update(exercises)
      .set({
        // Always touch updatedAt: a tag-only change (muscles / equipment) still
        // edits the exercise, and Drizzle refuses an update with no columns.
        updatedAt: new Date(),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.cues !== undefined ? { cues: input.cues } : {}),
        ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
        ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
        ...(input.defaultTempo !== undefined ? { defaultTempo: input.defaultTempo ?? null } : {}),
        ...(input.demoVideoAssetId !== undefined
          ? { demoVideoAssetId: input.demoVideoAssetId ?? null }
          : {}),
        ...(input.thumbnailAssetId !== undefined
          ? { thumbnailAssetId: input.thumbnailAssetId ?? null }
          : {}),
        ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
      })
      .where(and(eq(exercises.id, id), isNull(exercises.deletedAt)))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);

    if (input.muscleIds !== undefined) {
      await db.delete(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, id));
      if (input.muscleIds.length) {
        await db.insert(exerciseMuscles).values(input.muscleIds.map((muscleId) => ({ exerciseId: id, muscleId })));
      }
      // The rutinas that use it now work different muscles.
      await syncWorkoutMuscles(db, await workoutsUsing(db, [id]));
    }
    if (input.equipmentIds !== undefined) {
      await db.delete(exerciseEquipment).where(eq(exerciseEquipment.exerciseId, id));
      if (input.equipmentIds.length) {
        await db
          .insert(exerciseEquipment)
          .values(input.equipmentIds.map((equipmentId) => ({ exerciseId: id, equipmentId })));
      }
    }

    const rel = await loadRelations(db, id);
    return c.json({ ...serializeBase(row), ...rel }, 200);
  },
);

// --- Delete (soft) -----------------------------------------------------------
exercisesRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['exercises'],
    request: { params: idParam },
    responses: {
      204: { description: 'Ejercicio eliminado' },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
      409: { description: 'En uso', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const why = await deleteBlocker(db, id);
    if (why) return c.json({ error: `No se puede eliminar: ${why}. Archívalo en su lugar.` }, 409);
    const [row] = await db
      .update(exercises)
      .set({ deletedAt: new Date() })
      .where(and(eq(exercises.id, id), isNull(exercises.deletedAt)))
      .returning({ id: exercises.id });
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.body(null, 204);
  },
);
