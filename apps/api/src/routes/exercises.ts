import { createRoute, z } from '@hono/zod-openapi';
import { and, count, desc, eq, ilike, isNull, or, sql, isNotNull } from 'drizzle-orm';
import { exerciseEquipment, exerciseMuscles, exercises, setResults, workoutItems } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import {
  createExerciseSchema,
  exerciseSchema,
  paginated,
  paginationQuerySchema,
  slugify,
  updateExerciseSchema,
} from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { requireAdmin } from '../middleware/auth';

const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });
const listItemSchema = exerciseSchema.omit({ muscles: true, equipmentIds: true });

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
      .select({ muscleId: exerciseMuscles.muscleId, role: exerciseMuscles.role })
      .from(exerciseMuscles)
      .where(eq(exerciseMuscles.exerciseId, id)),
    db
      .select({ equipmentId: exerciseEquipment.equipmentId })
      .from(exerciseEquipment)
      .where(eq(exerciseEquipment.exerciseId, id)),
  ]);
  return {
    muscles: ms,
    equipmentIds: eq_.map((e) => e.equipmentId),
  };
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
    return c.json(
      { data: rows.map(serializeBase), total: totals?.value ?? 0, page, pageSize },
      200,
    );
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
    },
  }),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const [row] = await db
      .insert(exercises)
      .values({
        slug: input.slug ?? slugify(input.name),
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
    if (input.muscles.length) {
      await db.insert(exerciseMuscles).values(
        input.muscles.map((m) => ({ exerciseId: row.id, muscleId: m.muscleId, role: m.role })),
      );
    }
    if (input.equipmentIds.length) {
      await db
        .insert(exerciseEquipment)
        .values(input.equipmentIds.map((equipmentId) => ({ exerciseId: row.id, equipmentId })));
    }
    return c.json(
      { ...serializeBase(row), muscles: input.muscles, equipmentIds: input.equipmentIds },
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

    if (input.muscles !== undefined) {
      await db.delete(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, id));
      if (input.muscles.length) {
        await db.insert(exerciseMuscles).values(
          input.muscles.map((m) => ({ exerciseId: id, muscleId: m.muscleId, role: m.role })),
        );
      }
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
    // An exercise that rutinas or athletes' results point to is a reference:
    // archive it instead, so nothing breaks or loses its history.
    const [[inRutinas], [inResults]] = await Promise.all([
      db.select({ value: count() }).from(workoutItems).where(eq(workoutItems.exerciseId, id)),
      db.select({ value: count() }).from(setResults).where(eq(setResults.exerciseId, id)),
    ]);
    if ((inRutinas?.value ?? 0) > 0 || (inResults?.value ?? 0) > 0) {
      const parts = [
        inRutinas?.value ? `${inRutinas.value} línea${inRutinas.value === 1 ? '' : 's'} de rutina` : null,
        inResults?.value ? `${inResults.value} resultado${inResults.value === 1 ? '' : 's'} de usuarios` : null,
      ].filter(Boolean);
      return c.json({ error: `No se puede eliminar: lo usan ${parts.join(' y ')}. Archívalo en su lugar.` }, 409);
    }
    const [row] = await db
      .update(exercises)
      .set({ deletedAt: new Date() })
      .where(and(eq(exercises.id, id), isNull(exercises.deletedAt)))
      .returning({ id: exercises.id });
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.body(null, 204);
  },
);
