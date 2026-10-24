/**
 * Response shapes from the consumer API (`/api/app/*`). Hand-written to mirror
 * apps/api/src/routes/app.ts (these endpoints aren't in the OpenAPI client).
 */
import type { Difficulty, Goal, LoadPrescription, SkillGoal, Tempo, WorkoutFormat } from '@dmtx/schemas';

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
  /** Rutinas only: muscle groups worked and equipment needed, for search and filters. */
  muscles?: string[];
  equipment?: string[];
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

/** Tags the app can filter rutinas by (slug → label). */
export interface BrowseFilters {
  muscles: { slug: string; name: string }[];
  equipment: { slug: string; name: string }[];
}

export interface WorkoutSummary {
  id: string;
  slug: string;
  name: string;
  /** The main section has a video class / a written rutina the app guides. Both can be true. */
  hasVideo: boolean;
  isGuided: boolean;
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
  /** The main section has a video class / a written rutina the app guides. Both can be true. */
  hasVideo: boolean;
  isGuided: boolean;
  format: WorkoutFormat | null;
  difficulty: Difficulty | null;
  estimatedDurationSeconds: number | null;
  thumbnailUrl: string | null;
  /** Each section may be a video (signed HLS manifest, 24 h): the main class, the warm-up, the stretch. expo-video plays them; the downloads module stores them offline. */
  videoUrl: string | null;
  warmupVideoUrl: string | null;
  cooldownVideoUrl: string | null;
  /** A video is attached but not playable yet (still uploading or processing). */
  videoPending: boolean;
  videoDurationSeconds: number | null;
  warmupVideoDurationSeconds: number | null;
  cooldownVideoDurationSeconds: number | null;
  /** What each video section's class does, written by the admin; shown beside the video. */
  videoNotes: { warmup: string | null; main: string | null; cooldown: string | null };
  /** Tags derived from the exercises: muscle groups worked (primary) and equipment needed. */
  muscles: string[];
  equipment: string[];
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
  /** 1-based week the day falls in (seven days per week). */
  week: number;
  isRestDay: boolean;
  /** The day's own rutina (structured or a video); null on a rest day. */
  workout: WorkoutSummary | null;
}

export interface ProgramDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  difficulty: Difficulty | null;
  durationDays: number;
  weeks: number;
  thumbnailUrl: string | null;
  days: ProgramDay[];
}

export interface SkillLevel {
  id: string;
  position: number;
  name: string;
  description: string | null;
  /** The marks that unlock the next level (empty on the last level), with the user's best so far. */
  unlockGoals: (SkillGoal & { best: number | null; met: boolean })[];
  /** Not reached yet: the previous level's goals are still open. */
  locked: boolean;
  /** Its goals were met: the next level is open. */
  completed: boolean;
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
  /** 1 = only the first level is open. */
  unlockedLevels: number;
  levels: SkillLevel[];
}
