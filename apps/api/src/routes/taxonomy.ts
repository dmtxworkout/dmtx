import { createRoute, z } from '@hono/zod-openapi';
import { and, asc, countDistinct, eq, inArray, isNull, max } from 'drizzle-orm';
import { equipment, exerciseEquipment, exerciseMuscles, exercises, muscles } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import {
  BODY_PART_ZONE,
  createEquipmentSchema,
  createMuscleSchema,
  equipmentSchema,
  muscleSchema,
  slugify,
  taxonomySchema,
  updateEquipmentSchema,
  updateMuscleSchema,
} from '@dmtx/schemas';
import { syncWorkoutMuscles, workoutsWorking } from '../lib/workout-muscles';
import { createApp } from '../lib/openapi';
import { requireAdmin } from '../middleware/auth';

const errorSchema = z.object({ error: z.string() });
const idParam = z.object({ id: z.uuid() });

export const taxonomyRoute = createApp();
taxonomyRoute.use('*', requireAdmin);

/** How many live exercises each muscle / equipment is tagged with. */
async function usage(db: Database) {
  const [byMuscle, byEquipment] = await Promise.all([
    db
      .select({ id: exerciseMuscles.muscleId, n: countDistinct(exerciseMuscles.exerciseId) })
      .from(exerciseMuscles)
      .innerJoin(exercises, and(eq(exercises.id, exerciseMuscles.exerciseId), isNull(exercises.deletedAt)))
      .groupBy(exerciseMuscles.muscleId),
    db
      .select({ id: exerciseEquipment.equipmentId, n: countDistinct(exerciseEquipment.exerciseId) })
      .from(exerciseEquipment)
      .innerJoin(exercises, and(eq(exercises.id, exerciseEquipment.exerciseId), isNull(exercises.deletedAt)))
      .groupBy(exerciseEquipment.equipmentId),
  ]);
  return {
    muscle: new Map(byMuscle.map((r) => [r.id, Number(r.n)])),
    equipment: new Map(byEquipment.map((r) => [r.id, Number(r.n)])),
  };
}

/**
 * A muscle's other names as stored: lower case, trimmed, once each, and none
 * that is the name of a muscle. Null with the offending name in `taken`.
 */
async function cleanAliases(db: Database, aliases: string[], ownId?: string) {
  const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const names = await db.select({ id: muscles.id, name: muscles.name }).from(muscles);
  const seen = new Map<string, string>();
  for (const a of aliases) if (!seen.has(fold(a))) seen.set(fold(a), a.toLowerCase());
  const taken = names.find((m) => m.id !== ownId && seen.has(fold(m.name)));
  return taken ? { taken: taken.name } : { aliases: [...seen.values()] };
}

async function loadAll(db: Database) {
  const [ms, eq_, use] = await Promise.all([
    db.select().from(muscles).orderBy(asc(muscles.position), asc(muscles.name)),
    db.select().from(equipment).orderBy(asc(equipment.position), asc(equipment.name)),
    usage(db),
  ]);
  return {
    muscles: ms.map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      zone: m.zone,
      aliases: m.aliases,
      bodyPart: m.bodyPart,
      position: m.position,
      exerciseCount: use.muscle.get(m.id) ?? 0,
    })),
    equipment: eq_.map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      position: e.position,
      exerciseCount: use.equipment.get(e.id) ?? 0,
    })),
  };
}

/** A slug that no row of the table holds yet: "pecho", "pecho-2", … */
async function freeSlug(
  taken: (slug: string) => Promise<boolean>,
  name: string,
): Promise<string> {
  const base = slugify(name) || 'item';
  let slug = base;
  for (let n = 2; await taken(slug); n += 1) slug = `${base}-${n}`;
  return slug;
}

taxonomyRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['taxonomy'],
    responses: {
      200: { description: 'Músculos y equipo', content: { 'application/json': { schema: taxonomySchema } } },
    },
  }),
  async (c) => c.json(await loadAll(c.get('db')), 200),
);

// --- Muscles -----------------------------------------------------------------
taxonomyRoute.openapi(
  createRoute({
    method: 'post',
    path: '/muscles',
    tags: ['taxonomy'],
    request: { body: { content: { 'application/json': { schema: createMuscleSchema } } } },
    responses: {
      201: { description: 'Músculo creado', content: { 'application/json': { schema: muscleSchema } } },
      409: { description: 'Un sinónimo es el nombre de otro músculo', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const clean = await cleanAliases(db, input.aliases ?? []);
    if (clean.taken) return c.json({ error: `«${clean.taken}» ya es un músculo: no puede ser un sinónimo.` }, 409);
    const slug = await freeSlug(
      async (s) => (await db.select({ id: muscles.id }).from(muscles).where(eq(muscles.slug, s))).length > 0,
      input.name,
    );
    const [agg] = await db.select({ pos: max(muscles.position) }).from(muscles);
    const [row] = await db
      .insert(muscles)
      .values({
        slug,
        name: input.name.trim(),
        bodyPart: input.bodyPart ?? null,
        zone: input.bodyPart ? BODY_PART_ZONE[input.bodyPart] : null,
        aliases: clean.aliases,
        position: (agg?.pos ?? 0) + 1,
      })
      .returning();
    if (!row) throw new Error('No se pudo crear el músculo');
    return c.json({ ...row, exerciseCount: 0 }, 201);
  },
);

taxonomyRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/muscles/{id}',
    tags: ['taxonomy'],
    request: { params: idParam, body: { content: { 'application/json': { schema: updateMuscleSchema } } } },
    responses: {
      200: { description: 'Músculo', content: { 'application/json': { schema: muscleSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
      409: { description: 'Un sinónimo es el nombre de otro músculo', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const clean = input.aliases ? await cleanAliases(db, input.aliases, id) : null;
    if (clean?.taken) return c.json({ error: `«${clean.taken}» ya es un músculo: no puede ser un sinónimo.` }, 409);
    const [row] = await db
      .update(muscles)
      .set({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.bodyPart !== undefined
          ? { bodyPart: input.bodyPart ?? null, zone: input.bodyPart ? BODY_PART_ZONE[input.bodyPart] : null }
          : {}),
        ...(clean ? { aliases: clean.aliases } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      })
      .where(eq(muscles.id, id))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    // Another zone can change which rutinas count as «Cuerpo completo».
    if (input.bodyPart !== undefined) await syncWorkoutMuscles(db, await workoutsWorking(db, id));
    const use = await usage(db);
    return c.json({ ...row, exerciseCount: use.muscle.get(row.id) ?? 0 }, 200);
  },
);

taxonomyRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/muscles/{id}',
    tags: ['taxonomy'],
    request: { params: idParam },
    responses: {
      204: { description: 'Músculo eliminado (y quitado de los ejercicios que lo usaban)' },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    // Like deleting a tag: the exercises simply stop carrying it.
    const affected = await workoutsWorking(db, id);
    await db.delete(exerciseMuscles).where(eq(exerciseMuscles.muscleId, id));
    const [row] = await db.delete(muscles).where(eq(muscles.id, id)).returning({ id: muscles.id });
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    await syncWorkoutMuscles(db, affected);
    return c.body(null, 204);
  },
);

// --- Equipment ---------------------------------------------------------------
taxonomyRoute.openapi(
  createRoute({
    method: 'post',
    path: '/equipment',
    tags: ['taxonomy'],
    request: { body: { content: { 'application/json': { schema: createEquipmentSchema } } } },
    responses: {
      201: { description: 'Equipo creado', content: { 'application/json': { schema: equipmentSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const slug = await freeSlug(
      async (s) => (await db.select({ id: equipment.id }).from(equipment).where(eq(equipment.slug, s))).length > 0,
      input.name,
    );
    const [agg] = await db.select({ pos: max(equipment.position) }).from(equipment);
    const [row] = await db
      .insert(equipment)
      .values({ slug, name: input.name.trim(), position: (agg?.pos ?? 0) + 1 })
      .returning();
    if (!row) throw new Error('No se pudo crear el equipo');
    return c.json({ id: row.id, slug: row.slug, name: row.name, position: row.position, exerciseCount: 0 }, 201);
  },
);

taxonomyRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/equipment/{id}',
    tags: ['taxonomy'],
    request: { params: idParam, body: { content: { 'application/json': { schema: updateEquipmentSchema } } } },
    responses: {
      200: { description: 'Equipo', content: { 'application/json': { schema: equipmentSchema } } },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const [row] = await db
      .update(equipment)
      .set({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      })
      .where(eq(equipment.id, id))
      .returning();
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    const use = await usage(db);
    return c.json({ id: row.id, slug: row.slug, name: row.name, position: row.position, exerciseCount: use.equipment.get(row.id) ?? 0 }, 200);
  },
);

taxonomyRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/equipment/{id}',
    tags: ['taxonomy'],
    request: { params: idParam },
    responses: {
      204: { description: 'Equipo eliminado (y quitado de los ejercicios que lo usaban)' },
      404: { description: 'No encontrado', content: { 'application/json': { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    await db.delete(exerciseEquipment).where(eq(exerciseEquipment.equipmentId, id));
    const [row] = await db.delete(equipment).where(eq(equipment.id, id)).returning({ id: equipment.id });
    if (!row) return c.json({ error: 'No encontrado' }, 404);
    return c.body(null, 204);
  },
);

/** The muscles and the equipment behind a set of exercises (a rutina's tags). */
export async function tagsForExercises(db: Database, exerciseIds: string[]) {
  if (!exerciseIds.length) return { muscles: [] as { slug: string; name: string }[], equipment: [] as { slug: string; name: string }[] };
  const [g, e] = await Promise.all([
    db
      .selectDistinct({ slug: muscles.slug, name: muscles.name, position: muscles.position })
      .from(exerciseMuscles)
      .innerJoin(muscles, eq(muscles.id, exerciseMuscles.muscleId))
      .where(inArray(exerciseMuscles.exerciseId, exerciseIds)),
    db
      .selectDistinct({ slug: equipment.slug, name: equipment.name, position: equipment.position })
      .from(exerciseEquipment)
      .innerJoin(equipment, eq(equipment.id, exerciseEquipment.equipmentId))
      .where(inArray(exerciseEquipment.exerciseId, exerciseIds)),
  ]);
  const byPos = <T extends { position: number; name: string }>(xs: T[]) =>
    [...xs].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  return {
    muscles: byPos(g).map(({ slug, name }) => ({ slug, name })),
    equipment: byPos(e).map(({ slug, name }) => ({ slug, name })),
  };
}
