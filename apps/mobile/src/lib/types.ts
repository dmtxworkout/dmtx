/**
 * Response shapes from the consumer API (`/api/app/*`). Hand-written to mirror
 * apps/api/src/routes/app.ts (these endpoints aren't in the OpenAPI client).
 */
import type { Difficulty, Goal, LoadPrescription, Tempo, WorkoutFormat } from '@dmtx/schemas';

export type ContentKind = 'workout' | 'program' | 'skill';

export interface Entitlement {
  active: boolean;
  status: string;
  source: 'trial' | 'subscription' | 'grant' | 'none';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

export interface Me {
  user: { id: string; email: string; name: string; image: string | null };
  entitlement: Entitlement;
}

/** Card as shown in home/browse rows. */
export interface ContentCard {
  id: string;
  kind: ContentKind;
  slug: string;
  name: string;
  difficulty: Difficulty | null;
  thumbnailUrl: string | null;
  tag: string;
  ratio: string;
  meta: string;
  progressPct: number;
  format?: WorkoutFormat | null;
  durationSeconds?: number | null;
  durationDays?: number | null;
  weeks?: number | null;
  levelCount?: number;
}

export interface ContentRow {
  title: string;
  layout: 'row' | 'poster' | 'square';
  items: ContentCard[];
}

export interface Home {
  hero: ContentCard | null;
  rows: ContentRow[];
}

export interface Browse {
  rows: ContentRow[];
}

export interface WorkoutSummary {
  id: string;
  slug: string;
  name: string;
  type: 'structured' | 'video';
  format: WorkoutFormat | null;
  difficulty: Difficulty | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  meta: string;
}

export interface LastResult {
  reps: number | null;
  seconds: number | null;
  distanceMeters: number | null;
  loadKg: number | null;
}

export interface PlayerExercise {
  id: string;
  name: string;
  description: string | null;
  cues: string[];
  isUnilateral: boolean;
  defaultTempo: Tempo | null;
  demoVideoUrl: string | null;
  thumbnailUrl: string | null;
  lastResult: LastResult | null;
}

export interface WorkoutItem {
  id: string;
  kind: 'exercise' | 'rest';
  exerciseId: string | null;
  /** Per-item measurement override; null falls back to the exercise's type. */
  measure: 'reps' | 'time' | 'distance' | null;
  sets: number | null;
  reps: number | null;
  workSeconds: number | null;
  distanceMeters: number | null;
  restBetweenSeconds: number | null;
  tempoOverride: Tempo | null;
  loadPrescription: LoadPrescription | null;
  perSide: boolean;
  intervalIndex: number | null;
  notes: string | null;
  exercise: PlayerExercise | null;
}

export interface WorkoutBlock {
  id: string;
  /** `part`: a format (AMRAP/EMOM/…) holding the blocks in `blocks`. */
  kind: 'group' | 'rest' | 'part';
  section: 'warmup' | 'main' | 'cooldown';
  type: 'single' | 'superset' | 'circuit' | 'emom' | 'tabata';
  label: string | null;
  rounds: number | null;
  notes: string | null;
  format: WorkoutFormat | null;
  formatConfig: unknown;
  items: WorkoutItem[];
  blocks: WorkoutBlock[];
}

export interface WorkoutDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: 'structured' | 'video';
  format: WorkoutFormat | null;
  difficulty: Difficulty | null;
  estimatedDurationSeconds: number | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  videoDurationSeconds: number | null;
  /** Timing of the part being played; null on the rutina itself (parts carry it). */
  formatConfig: unknown;
  scoringGoal: Goal | null;
  /** Variants (RX / Escalada / …) of a base rutina; a variant points back via variantOfId. */
  variantOfId: string | null;
  variantLabel: string | null;
  variants: { id: string; label: string }[];
  lastLog: {
    roundsCompleted: number | null;
    totalVolume: number | null;
    durationSeconds: number | null;
    completedAt: string | null;
  } | null;
  blocks: WorkoutBlock[];
}

export interface ProgramDay {
  id: string;
  position: number;
  weekNumber: number | null;
  dayOfWeek: number | null;
  isRestDay: boolean;
  title: string | null;
  notes: string | null;
  workouts: WorkoutSummary[];
}

export interface ProgramDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: 'structured' | 'video_playlist';
  difficulty: Difficulty | null;
  durationDays: number | null;
  weeks: number | null;
  thumbnailUrl: string | null;
  days: ProgramDay[];
  videoItems: {
    id: string;
    title: string | null;
    description: string | null;
    durationSeconds: number | null;
    videoUrl: string | null;
  }[];
}

export interface SkillLevel {
  id: string;
  position: number;
  name: string;
  description: string | null;
  unlockGoal: Goal | null;
  thumbnailUrl: string | null;
  workout: WorkoutSummary | null;
}

export interface SkillDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  difficulty: Difficulty | null;
  thumbnailUrl: string | null;
  levels: SkillLevel[];
}
