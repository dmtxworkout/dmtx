/**
 * Estimated duration of a structured rutina, computed from its blocks when it
 * is saved (the admin never types it). Timed formats are exact; everything
 * else is a rough pace heuristic, rounded up to whole minutes.
 */

export type DurationItem = {
  kind: 'exercise' | 'rest';
  measure?: 'reps' | 'time' | 'distance' | null;
  sets?: number | null;
  reps?: number | null;
  workSeconds?: number | null;
  distanceMeters?: number | null;
  restBetweenSeconds?: number | null;
  perSide?: boolean | null;
};

export type DurationBlock = {
  kind: 'group' | 'rest' | 'part';
  rounds?: number | null;
  format?: string | null;
  formatConfig?: unknown;
  items: DurationItem[];
  blocks: DurationBlock[];
};

/** Heuristic paces. */
const SECONDS_PER_REP = 3;
const SECONDS_PER_METER = 0.3; // ~5 min/km: run, row, bike alike
const TRANSITION_SECONDS = 5; // moving between exercises
const DEFAULT_SET_REST = 60; // strength sets without a stated rest

const cfgNum = (cfg: unknown, key: string): number | null => {
  const v = (cfg as Record<string, unknown> | null)?.[key];
  return typeof v === 'number' && v > 0 ? v : null;
};

function itemSeconds(it: DurationItem): number {
  if (it.kind === 'rest') return it.workSeconds ?? 0;
  const sets = Math.max(1, it.sets ?? 1);
  let work: number;
  if (it.workSeconds) work = it.workSeconds;
  else if (it.distanceMeters) work = it.distanceMeters * SECONDS_PER_METER;
  else work = Math.max(1, it.reps ?? 10) * SECONDS_PER_REP;
  if (it.perSide) work *= 2;
  const rest = sets > 1 ? (it.restBetweenSeconds ?? DEFAULT_SET_REST) * (sets - 1) : 0;
  return work * sets + rest + TRANSITION_SECONDS;
}

function blockSeconds(b: DurationBlock): number {
  return b.kind === 'part' ? partSeconds(b) : groupSeconds(b);
}

function groupSeconds(b: DurationBlock): number {
  if (b.kind === 'rest') return b.items.reduce((s, it) => s + (it.workSeconds ?? 0), 0);
  const once = b.items.reduce((s, it) => s + itemSeconds(it), 0) + b.blocks.reduce((s, c) => s + blockSeconds(c), 0);
  return once * Math.max(1, b.rounds ?? 1);
}

/** Seconds a part takes: its timer when it has one, else its content. */
function partSeconds(b: DurationBlock): number {
  const content = groupSeconds({ ...b, rounds: null });
  const cfg = b.formatConfig;
  switch (b.format) {
    case 'amrap':
      return cfgNum(cfg, 'totalSeconds') ?? content;
    case 'emom': {
      const interval = cfgNum(cfg, 'intervalSeconds') ?? 60;
      const rounds = cfgNum(cfg, 'rounds');
      return rounds ? interval * rounds : content;
    }
    case 'tabata': {
      const work = cfgNum(cfg, 'workSeconds') ?? 20;
      const rest = cfgNum(cfg, 'restSeconds') ?? 10;
      const rounds = cfgNum(cfg, 'rounds') ?? 8;
      return (work + rest) * rounds;
    }
    default: {
      // For time / chipper / circuit: the content, never past a time cap.
      const rounds = cfgNum(cfg, 'rounds') ?? 1;
      const est = content * rounds;
      const cap = cfgNum(cfg, 'timeCapSeconds');
      return cap ? Math.min(cap, est) : est;
    }
  }
}

/** Whole seconds, rounded up to the minute; null for an empty rutina. */
export function estimateDurationSeconds(blocks: DurationBlock[]): number | null {
  const total = blocks.reduce((s, b) => s + blockSeconds(b), 0);
  if (total <= 0) return null;
  return Math.ceil(total / 60) * 60;
}
