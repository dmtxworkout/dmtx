import type { FormatConfig, Tempo, WorkoutFormat } from '@dmtx/schemas';
import type { LastResult, WorkoutBlock, WorkoutDetail, WorkoutItem } from './types';
import { loadLabel } from './format';

/**
 * The workout "engine": turns a rutina (format + blocks + items) into a flat,
 * playable sequence of steps. Each format decides how the exercises are
 * sequenced; the step screens (reps / time / rest / summary) are the same.
 *
 * Principle (matches packages/schemas/format-config.ts): `formatConfig` holds
 * the GLOBAL timing (AMRAP cap, EMOM interval, Tabata work/rest); sets/reps/load
 * on items hold the per-exercise prescription.
 */

export type StepMeasure = 'reps' | 'time' | 'distance';

export interface ExerciseStep {
  type: 'exercise';
  key: string;
  blockLabel: string;
  blockIndex: number;
  itemId: string;
  exerciseId: string;
  name: string;
  cue: string | null;
  demoVideoUrl: string | null;
  thumbnailUrl: string | null;
  tempo: Tempo | null;
  measure: StepMeasure;
  targetReps: number | null;
  targetSeconds: number | null;
  targetDistance: number | null;
  loadLabel: string;
  loadKg: number | null;
  perSide: boolean;
  set: number | null;
  totalSets: number | null;
  /** For EMOM: reps to complete within the interval (shown alongside the timer). */
  withinReps: number | null;
  /** This user's most recent result for the exercise ("beat your last"). */
  last: LastResult | null;
}

export interface RestStep {
  type: 'rest';
  key: string;
  seconds: number;
  nextName: string | null;
}

export type Step = ExerciseStep | RestStep;

export type SessionMode = 'sequential' | 'amrap';

export interface Session {
  workoutId: string;
  name: string;
  format: WorkoutFormat | null;
  mode: SessionMode;
  /** Global countdown for time-capped formats (AMRAP); null otherwise. */
  capSeconds: number | null;
  /** Number of exercise steps in one circuit pass (AMRAP round detection). */
  circuitLength: number;
  steps: Step[];
}

function measureOf(item: WorkoutItem): StepMeasure {
  const mt = item.exercise?.measurementType;
  if (mt === 'time' || (mt == null && item.workSeconds != null)) return 'time';
  if (mt === 'distance' || (mt == null && item.distanceMeters != null)) return 'distance';
  return 'reps';
}

let counter = 0;
const nextKey = () => `s${counter++}`;

function exerciseStep(
  block: WorkoutBlock,
  blockIndex: number,
  item: WorkoutItem,
  set: number | null,
  totalSets: number | null,
  opts?: { measure?: StepMeasure; targetSeconds?: number | null; withinReps?: number | null },
): ExerciseStep {
  const measure = opts?.measure ?? measureOf(item);
  const load = item.loadPrescription;
  const loadKg =
    load?.type === 'absolute' ? Math.round(load.unit === 'lb' ? load.value * 0.4536 : load.value) : null;
  return {
    type: 'exercise',
    key: nextKey(),
    blockLabel: block.label || `Bloque ${blockIndex + 1}`,
    blockIndex,
    itemId: item.id,
    exerciseId: item.exerciseId ?? '',
    name: item.exercise?.name ?? 'Ejercicio',
    cue: item.exercise?.cues?.[0] ?? item.exercise?.description ?? null,
    demoVideoUrl: item.exercise?.demoVideoUrl ?? null,
    thumbnailUrl: item.exercise?.thumbnailUrl ?? null,
    tempo: item.tempoOverride ?? item.exercise?.defaultTempo ?? null,
    measure,
    targetReps: measure === 'reps' ? item.reps : null,
    targetSeconds: opts?.targetSeconds !== undefined ? opts.targetSeconds : measure === 'time' ? item.workSeconds : null,
    targetDistance: measure === 'distance' ? item.distanceMeters : null,
    loadLabel: loadLabel(item.loadPrescription),
    loadKg,
    perSide: item.perSide,
    set,
    totalSets,
    withinReps: opts?.withinReps ?? null,
    last: item.exercise?.lastResult ?? null,
  };
}

const restStep = (seconds: number, nextName: string | null): RestStep => ({
  type: 'rest',
  key: nextKey(),
  seconds,
  nextName,
});

/** Exercise items across all (group) blocks, in order (one circuit pass). */
function circuit(workout: WorkoutDetail): WorkoutItem[] {
  return workout.blocks
    .filter((b) => b.kind !== 'rest')
    .flatMap((b) => b.items)
    .filter((it) => it.kind === 'exercise');
}

function firstName(workout: WorkoutDetail, fromBlock: number, fromItem: number): string | null {
  const b = workout.blocks[fromBlock];
  return b?.items[fromItem]?.exercise?.name ?? null;
}

/** Sequential formats: expand blocks → rounds → items → sets, honouring rests. */
function buildSequential(workout: WorkoutDetail, defaultRounds: number): Step[] {
  const steps: Step[] = [];
  workout.blocks.forEach((block, bi) => {
    // A rest block: a single rest between groups.
    if (block.kind === 'rest') {
      const dur = block.items[0]?.workSeconds;
      if (dur) steps.push(restStep(dur, firstName(workout, bi + 1, 0)));
      return;
    }
    const rounds = block.rounds && block.rounds > 0 ? block.rounds : defaultRounds;
    for (let r = 0; r < rounds; r += 1) {
      block.items.forEach((item) => {
        if (item.kind === 'rest') {
          if (item.workSeconds) steps.push(restStep(item.workSeconds, null));
          return;
        }
        const totalSets = item.sets && item.sets > 1 ? item.sets : 1;
        for (let s = 0; s < totalSets; s += 1) {
          steps.push(exerciseStep(block, bi, item, totalSets > 1 ? s + 1 : null, totalSets > 1 ? totalSets : null));
          if (item.restBetweenSeconds && s < totalSets - 1) {
            steps.push(restStep(item.restBetweenSeconds, item.exercise?.name ?? null));
          }
        }
      });
    }
  });
  return steps;
}

function config<T extends FormatConfig['format']>(
  workout: WorkoutDetail,
  format: T,
): Extract<FormatConfig, { format: T }> | null {
  const fc = workout.formatConfig as FormatConfig | null;
  return fc && fc.format === format ? (fc as Extract<FormatConfig, { format: T }>) : null;
}

export function buildSession(workout: WorkoutDetail): Session {
  counter = 0;
  const base = {
    workoutId: workout.id,
    name: workout.name,
    format: workout.format,
  };

  // Video-only rutina → no steps.
  if (workout.type === 'video') {
    return { ...base, mode: 'sequential', capSeconds: null, circuitLength: 0, steps: [] };
  }

  switch (workout.format) {
    case 'amrap': {
      const cfg = config(workout, 'amrap');
      const steps = circuit(workout).map((item) => {
        const b = workout.blocks.find((bl) => bl.items.includes(item))!;
        const bi = workout.blocks.indexOf(b);
        return exerciseStep(b, bi, item, null, null);
      });
      return {
        ...base,
        mode: 'amrap',
        capSeconds: cfg?.totalSeconds ?? workout.estimatedDurationSeconds ?? null,
        circuitLength: steps.length,
        steps,
      };
    }

    case 'tabata': {
      const cfg = config(workout, 'tabata');
      const items = circuit(workout);
      const steps: Step[] = [];
      const rounds = cfg?.rounds ?? 8;
      const work = cfg?.workSeconds ?? 20;
      const rest = cfg?.restSeconds ?? 10;
      for (let r = 0; r < rounds; r += 1) {
        const item = items[r % Math.max(1, items.length)];
        if (!item) break;
        const b = workout.blocks.find((bl) => bl.items.includes(item))!;
        steps.push(exerciseStep(b, workout.blocks.indexOf(b), item, r + 1, rounds, { measure: 'time', targetSeconds: work }));
        if (rest > 0 && r < rounds - 1) {
          const nextItem = items[(r + 1) % Math.max(1, items.length)];
          steps.push(restStep(rest, nextItem?.exercise?.name ?? null));
        }
      }
      return { ...base, mode: 'sequential', capSeconds: null, circuitLength: 0, steps };
    }

    case 'emom': {
      const cfg = config(workout, 'emom');
      const items = circuit(workout);
      const steps: Step[] = [];
      const rounds = cfg?.rounds ?? 1;
      const interval = cfg?.intervalSeconds ?? 60;
      for (let r = 0; r < rounds; r += 1) {
        items.forEach((item) => {
          const b = workout.blocks.find((bl) => bl.items.includes(item))!;
          steps.push(
            exerciseStep(b, workout.blocks.indexOf(b), item, r + 1, rounds, {
              measure: 'time',
              targetSeconds: interval,
              withinReps: item.reps,
            }),
          );
        });
      }
      return { ...base, mode: 'sequential', capSeconds: null, circuitLength: 0, steps };
    }

    case 'circuit': {
      const cfg = config(workout, 'circuit');
      return { ...base, mode: 'sequential', capSeconds: null, circuitLength: 0, steps: buildSequential(workout, cfg?.rounds ?? 1) };
    }
    case 'for_time': {
      const cfg = config(workout, 'for_time');
      return { ...base, mode: 'sequential', capSeconds: null, circuitLength: 0, steps: buildSequential(workout, cfg?.rounds ?? 1) };
    }
    default:
      // strength, chipper, or unspecified → one pass, honour item sets.
      return { ...base, mode: 'sequential', capSeconds: null, circuitLength: 0, steps: buildSequential(workout, 1) };
  }
}
