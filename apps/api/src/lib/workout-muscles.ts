import { and, eq, inArray } from 'drizzle-orm';
import { exerciseMuscles, muscles, workoutBlocks, workoutItems, workoutMuscles, workouts } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import { deriveMuscles, isFullBody } from '@dmtx/core';
import type { MuscleZone } from '@dmtx/schemas';

/**
 * Re-derive what these rutinas work and store it (`workout_muscles` and
 * `workouts.full_body`): from the exercises of their main section, plus the
 * muscles added by hand. `extra` replaces a single rutina's hand-picked
 * muscles; without it they are kept. Called on every save of a rutina (its
 * own, or its program's or skill's) and when an exercise's muscles or a
 * muscle's zone change.
 */
export async function syncWorkoutMuscles(db: Database, workoutIds: string[], extra?: string[]) {
  if (!workoutIds.length) return;
  const [items, manual] = await Promise.all([
    db
      .select({ workoutId: workoutBlocks.workoutId, exerciseId: workoutItems.exerciseId })
      .from(workoutItems)
      .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
      .where(and(inArray(workoutBlocks.workoutId, workoutIds), eq(workoutBlocks.section, 'main'), eq(workoutItems.kind, 'exercise'))),
    extra
      ? Promise.resolve([])
      : db
          .select({ workoutId: workoutMuscles.workoutId, muscleId: workoutMuscles.muscleId })
          .from(workoutMuscles)
          .where(and(inArray(workoutMuscles.workoutId, workoutIds), eq(workoutMuscles.manual, true))),
  ]);
  const exerciseIds = [...new Set(items.map((i) => i.exerciseId).filter((id): id is string => !!id))];
  const [em, zones] = await Promise.all([
    exerciseIds.length
      ? db.select().from(exerciseMuscles).where(inArray(exerciseMuscles.exerciseId, exerciseIds))
      : Promise.resolve([]),
    db.select({ id: muscles.id, zone: muscles.zone }).from(muscles),
  ]);
  const musclesOf = new Map<string, string[]>();
  for (const r of em) musclesOf.set(r.exerciseId, [...(musclesOf.get(r.exerciseId) ?? []), r.muscleId]);
  const zoneOf = new Map<string, MuscleZone | null>(zones.map((z) => [z.id, z.zone]));
  const known = (id: string) => zoneOf.has(id);

  for (const workoutId of workoutIds) {
    const ids = items.filter((i) => i.workoutId === workoutId && i.exerciseId).map((i) => i.exerciseId!);
    const hand = (extra ?? manual.filter((m) => m.workoutId === workoutId).map((m) => m.muscleId)).filter(known);
    const derived = deriveMuscles(ids, (id) => musclesOf.get(id) ?? [], [...new Set(hand)]);
    await db.delete(workoutMuscles).where(eq(workoutMuscles.workoutId, workoutId));
    if (derived.length) await db.insert(workoutMuscles).values(derived.map((m) => ({ workoutId, ...m })));
    await db
      .update(workouts)
      .set({ fullBody: isFullBody(derived, (id) => zoneOf.get(id) ?? null) })
      .where(eq(workouts.id, workoutId));
  }
}

/** The rutinas that use any of these exercises in their main section. */
export async function workoutsUsing(db: Database, exerciseIds: string[]): Promise<string[]> {
  if (!exerciseIds.length) return [];
  const rows = await db
    .selectDistinct({ id: workoutBlocks.workoutId })
    .from(workoutItems)
    .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
    .where(inArray(workoutItems.exerciseId, exerciseIds));
  return rows.map((r) => r.id);
}

/** The rutinas that work a muscle (its zone changing can change their «Cuerpo completo»). */
export async function workoutsWorking(db: Database, muscleId: string): Promise<string[]> {
  const rows = await db.select({ id: workoutMuscles.workoutId }).from(workoutMuscles).where(eq(workoutMuscles.muscleId, muscleId));
  return rows.map((r) => r.id);
}

/** A rutina's muscles for the admin. */
export async function musclesOfWorkout(db: Database, workoutId: string) {
  return db
    .select({ muscleId: workoutMuscles.muscleId, role: workoutMuscles.role, manual: workoutMuscles.manual })
    .from(workoutMuscles)
    .where(eq(workoutMuscles.workoutId, workoutId));
}
