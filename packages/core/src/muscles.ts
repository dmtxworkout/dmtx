// What a rutina works, worked out from the exercises of its main section (the
// warm-up and the stretch don't count: stretching triceps at the end doesn't
// make a leg day an arm day). Shared by the API (stored on save) and the admin
// (shown live in the rutina's settings).
import type { MuscleRole, MuscleZone } from '@dmtx/schemas';

/** A muscle is primary when at least this share of the main section's exercises work it. */
export const PRIMARY_SHARE = 0.25;
/** A rutina is «Cuerpo completo» when it works at least this many zones as primary. */
export const FULL_BODY_ZONES = 4;

export interface RutinaMuscle {
  muscleId: string;
  role: MuscleRole;
  manual: boolean;
}

/**
 * @param exerciseIds the main section's exercises, once per line (repeats count).
 * @param musclesOf each exercise's muscles.
 * @param extra muscles added by hand (primary; they win over a derived one).
 */
export function deriveMuscles(
  exerciseIds: string[],
  musclesOf: (exerciseId: string) => string[],
  extra: string[] = [],
): RutinaMuscle[] {
  const uses = new Map<string, number>();
  for (const id of exerciseIds) for (const m of new Set(musclesOf(id))) uses.set(m, (uses.get(m) ?? 0) + 1);
  const out = new Map<string, RutinaMuscle>();
  for (const [muscleId, n] of [...uses].sort((a, b) => b[1] - a[1])) {
    out.set(muscleId, { muscleId, role: n / exerciseIds.length >= PRIMARY_SHARE ? 'primary' : 'secondary', manual: false });
  }
  for (const muscleId of extra) out.set(muscleId, { muscleId, role: 'primary', manual: true });
  return [...out.values()];
}

/** The zones a rutina works as primary. */
export function primaryZones(muscles: RutinaMuscle[], zoneOf: (muscleId: string) => MuscleZone | null): Set<MuscleZone> {
  const zones = new Set<MuscleZone>();
  for (const m of muscles) {
    const z = m.role === 'primary' ? zoneOf(m.muscleId) : null;
    if (z) zones.add(z);
  }
  return zones;
}

export const isFullBody = (muscles: RutinaMuscle[], zoneOf: (muscleId: string) => MuscleZone | null) =>
  primaryZones(muscles, zoneOf).size >= FULL_BODY_ZONES;
