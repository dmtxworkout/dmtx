import { and, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import {
  equipment,
  exerciseEquipment,
  exerciseMuscles,
  exercises,
  muscles,
  programDays,
  programs,
  setResults,
  skillLevels,
  skillProgress,
  skills,
  workoutBlocks,
  workoutItems,
  workoutLogs,
  workouts,
} from '@dmtx/db';
import type { Database } from '@dmtx/db';
import { createWorkoutLogSchema } from '@dmtx/schemas';
import type { SkillGoal } from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { nestBlocks, type Nested } from './workouts';
import { tagsForExercises } from './taxonomy';
import { resolveMediaUrls } from '../lib/media';
import type { ResolvedMedia } from '../lib/media';
import { resolveEntitlement } from '../lib/entitlement';
import { requireAccess, requireUser } from '../middleware/auth';
import type { Env } from '../env';

type WorkoutRow = typeof workouts.$inferSelect;
type ProgramRow = typeof programs.$inferSelect;
type SkillRow = typeof skills.$inferSelect;
type ExerciseRow = typeof exercises.$inferSelect;

const url = (m: Map<string, ResolvedMedia>, id: string | null): string | null =>
  id ? (m.get(id)?.url ?? null) : null;
const duration = (m: Map<string, ResolvedMedia>, id: string | null): number | null =>
  id ? (m.get(id)?.durationSeconds ?? null) : null;

const mins = (seconds: number | null): number | null =>
  seconds ? Math.max(1, Math.round(seconds / 60)) : null;

/** "AMRAP · 18 min" style row subtitle. */
function workoutMeta(w: WorkoutRow): string {
  const parts: string[] = [];
  if (w.isGuided && w.format) parts.push(w.format.toUpperCase());
  if (w.hasVideo) parts.push('Video');
  const m = mins(w.estimatedDurationSeconds);
  if (m) parts.push(`${m} min`);
  return parts.join(' · ');
}

function workoutCard(w: WorkoutRow, thumb: string | null) {
  return {
    id: w.id,
    kind: 'workout' as const,
    slug: w.slug,
    name: w.name,
    format: w.format,
    difficulty: w.difficulty,
    durationSeconds: w.estimatedDurationSeconds,
    thumbnailUrl: thumb,
    tag: 'RUTINA',
    ratio: '16/9',
    meta: workoutMeta(w),
    progressPct: 0,
  };
}

function programCard(p: ProgramRow, thumb: string | null, dayCount: number) {
  const weeks = Math.ceil(dayCount / 7);
  return {
    id: p.id,
    kind: 'program' as const,
    slug: p.slug,
    name: p.name,
    difficulty: p.difficulty,
    durationDays: dayCount,
    weeks,
    thumbnailUrl: thumb,
    tag: 'PROGRAMA',
    ratio: '2/3',
    meta: weeks ? `${weeks} sem` : '',
    progressPct: 0,
  };
}

function skillCard(s: SkillRow, thumb: string | null, levels: number, unlocked = 1) {
  return {
    id: s.id,
    kind: 'skill' as const,
    slug: s.slug,
    name: s.name,
    difficulty: s.difficulty,
    levelCount: levels,
    thumbnailUrl: thumb,
    tag: 'HABILIDAD',
    ratio: '1/1',
    meta: levels ? `${levels} nivel${levels === 1 ? '' : 'es'}` : '',
    // Levels passed (the current one is in progress): 2 of 5 unlocked → 1 done.
    progressPct: levels > 1 ? Math.round(((unlocked - 1) / levels) * 100) : 0,
  };
}

// --- Skill goals: the user's best marks and what they unlock ------------------

type Marks = { reps: number; seconds: number; distance: number; loads: { kg: number; reps: number }[] };

/** The user's best marks per exercise, over every session they logged. */
async function bestMarks(db: Database, userId: string, exerciseIds: string[]): Promise<Map<string, Marks>> {
  const out = new Map<string, Marks>();
  if (!exerciseIds.length) return out;
  const rows = await db
    .select({
      exerciseId: setResults.exerciseId,
      reps: setResults.reps,
      seconds: setResults.seconds,
      distance: setResults.distanceMeters,
      loadKg: setResults.loadKg,
    })
    .from(setResults)
    .innerJoin(workoutLogs, eq(workoutLogs.id, setResults.workoutLogId))
    .where(and(eq(workoutLogs.userId, userId), inArray(setResults.exerciseId, exerciseIds)));
  for (const r of rows) {
    if (!r.exerciseId) continue;
    const m = out.get(r.exerciseId) ?? { reps: 0, seconds: 0, distance: 0, loads: [] };
    if (r.reps) m.reps = Math.max(m.reps, r.reps);
    if (r.seconds) m.seconds = Math.max(m.seconds, r.seconds);
    if (r.distance) m.distance = Math.max(m.distance, r.distance);
    if (r.loadKg) m.loads.push({ kg: r.loadKg, reps: r.reps ?? 1 });
    out.set(r.exerciseId, m);
  }
  return out;
}

/** The best the user has done towards a goal, in the goal's own metric (null = never tried). */
function bestFor(goal: SkillGoal, marks: Map<string, Marks>): number | null {
  const m = marks.get(goal.exerciseId);
  if (!m) return null;
  switch (goal.metric) {
    case 'reps':
      return m.reps || null;
    case 'time_seconds':
      return m.seconds || null;
    case 'distance_meters':
      return m.distance || null;
    case 'load_kg': {
      const eligible = m.loads.filter((l) => l.reps >= (goal.reps ?? 1));
      return eligible.length ? Math.max(...eligible.map((l) => l.kg)) : null;
    }
  }
}

const goalMet = (goal: SkillGoal, marks: Map<string, Marks>) => (bestFor(goal, marks) ?? 0) >= goal.value;

/** Levels of a skill the user has unlocked (1 = only the first). */
async function unlockedLevels(db: Database, userId: string, skillId: string): Promise<number> {
  const [row] = await db
    .select({ n: skillProgress.unlockedLevels })
    .from(skillProgress)
    .where(and(eq(skillProgress.userId, userId), eq(skillProgress.skillId, skillId)))
    .limit(1);
  return row?.n ?? 1;
}

/**
 * After a session: every published skill whose current level has a goal on an
 * exercise just logged gets re-checked; while the current level's goals are
 * all met, the next one unlocks.
 */
async function advanceSkills(db: Database, userId: string, exerciseIds: string[]) {
  if (!exerciseIds.length) return;
  const levels = await db
    .select({ level: skillLevels })
    .from(skillLevels)
    .innerJoin(skills, eq(skills.id, skillLevels.skillId))
    .where(and(eq(skills.status, 'published'), isNull(skills.deletedAt)))
    .orderBy(skillLevels.skillId, skillLevels.position);
  const bySkill = new Map<string, (typeof levels)[number]['level'][]>();
  for (const { level } of levels) bySkill.set(level.skillId, [...(bySkill.get(level.skillId) ?? []), level]);
  const touched = new Set(exerciseIds);
  for (const [skillId, lvls] of bySkill) {
    if (!lvls.some((l) => l.unlockGoals.some((g) => touched.has(g.exerciseId)))) continue;
    let unlocked = await unlockedLevels(db, userId, skillId);
    const marks = await bestMarks(db, userId, [...new Set(lvls.flatMap((l) => l.unlockGoals.map((g) => g.exerciseId)))]);
    let advanced = false;
    while (unlocked < lvls.length) {
      const current = lvls[unlocked - 1]!;
      if (!current.unlockGoals.length || !current.unlockGoals.every((g) => goalMet(g, marks))) break;
      unlocked += 1;
      advanced = true;
    }
    if (!advanced) continue;
    await db
      .insert(skillProgress)
      .values({ userId, skillId, unlockedLevels: unlocked })
      .onConflictDoUpdate({ target: [skillProgress.userId, skillProgress.skillId], set: { unlockedLevels: unlocked, updatedAt: new Date() } });
  }
}

/** Compact workout reference embedded in program days / skill levels. */
function workoutSummary(w: WorkoutRow, thumb: string | null) {
  return {
    id: w.id,
    slug: w.slug,
    name: w.name,
    hasVideo: w.hasVideo,
    isGuided: w.isGuided,
    format: w.format,
    difficulty: w.difficulty,
    durationSeconds: w.estimatedDurationSeconds,
    thumbnailUrl: thumb,
    meta: workoutMeta(w),
  };
}

interface CatalogFilter {
  /** Whose progress the skill cards show. */
  userId?: string;
  q?: string;
  types: Array<'workout' | 'program' | 'skill'>;
  limit: number;
  /** Slugs: only rutinas whose exercises work that muscle / need that equipment. */
  muscle?: string;
  equipment?: string;
  /** Only rutinas with a video class / only rutinas the app can guide (both may be set). */
  video?: boolean;
  guided?: boolean;
}

type Tags = { muscles: string[]; equipment: string[] };

/**
 * The tags of each rutina, derived from its exercises: their muscles and the
 * equipment they need. One query each for
 * a whole page of rutinas.
 */
async function workoutTags(db: Database, workoutIds: string[]): Promise<Map<string, Tags>> {
  const out = new Map<string, Tags>();
  if (!workoutIds.length) return out;
  const [g, e] = await Promise.all([
    db
      .selectDistinct({ workoutId: workoutBlocks.workoutId, name: muscles.name, position: muscles.position })
      .from(workoutItems)
      .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
      .innerJoin(exerciseMuscles, eq(exerciseMuscles.exerciseId, workoutItems.exerciseId))
      .innerJoin(muscles, eq(muscles.id, exerciseMuscles.muscleId))
      .where(inArray(workoutBlocks.workoutId, workoutIds)),
    db
      .selectDistinct({ workoutId: workoutBlocks.workoutId, name: equipment.name, position: equipment.position })
      .from(workoutItems)
      .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
      .innerJoin(exerciseEquipment, eq(exerciseEquipment.exerciseId, workoutItems.exerciseId))
      .innerJoin(equipment, eq(equipment.id, exerciseEquipment.equipmentId))
      .where(inArray(workoutBlocks.workoutId, workoutIds)),
  ]);
  const tags = (id: string) => out.get(id) ?? (out.set(id, { muscles: [], equipment: [] }), out.get(id)!);
  const sorted = <T extends { position: number; name: string }>(xs: T[]) =>
    [...xs].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  for (const r of sorted(g)) tags(r.workoutId).muscles.push(r.name);
  for (const r of sorted(e)) tags(r.workoutId).equipment.push(r.name);
  return out;
}

/** Ids of rutinas matching a muscle slug / equipment slug / free text over the tag names. */
async function workoutIdsByTags(db: Database, f: { muscle?: string; equipment?: string; q?: string }): Promise<string[] | null> {
  const sets: string[][] = [];
  if (f.muscle || f.q) {
    const rows = await db
      .selectDistinct({ workoutId: workoutBlocks.workoutId })
      .from(workoutItems)
      .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
      .innerJoin(exerciseMuscles, eq(exerciseMuscles.exerciseId, workoutItems.exerciseId))
      .innerJoin(muscles, eq(muscles.id, exerciseMuscles.muscleId))
      .where(f.muscle ? eq(muscles.slug, f.muscle) : ilike(muscles.name, `%${f.q}%`));
    if (f.muscle) sets.push(rows.map((r) => r.workoutId));
    else return rows.map((r) => r.workoutId); // free text: a hint, merged with the name match by the caller
  }
  if (f.equipment) {
    const rows = await db
      .selectDistinct({ workoutId: workoutBlocks.workoutId })
      .from(workoutItems)
      .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
      .innerJoin(exerciseEquipment, eq(exerciseEquipment.exerciseId, workoutItems.exerciseId))
      .innerJoin(equipment, eq(equipment.id, exerciseEquipment.equipmentId))
      .where(eq(equipment.slug, f.equipment));
    sets.push(rows.map((r) => r.workoutId));
  }
  if (!sets.length) return null;
  return sets.reduce((acc, ids) => acc.filter((id) => ids.includes(id)));
}

/** Load published content of the requested types as display cards. */
async function loadCatalog(db: Database, env: Env, f: CatalogFilter) {
  const wantWorkouts = f.types.includes('workout');
  const wantPrograms = f.types.includes('program');
  const wantSkills = f.types.includes('skill');
  const like = f.q ? `%${f.q}%` : undefined;
  // Tag filters narrow rutinas to a set of ids; free text also matches the
  // tag names ("pierna" finds every rutina that works legs).
  const byTags = wantWorkouts ? await workoutIdsByTags(db, { muscle: f.muscle, equipment: f.equipment }) : null;
  const byText = wantWorkouts && f.q ? await workoutIdsByTags(db, { q: f.q }) : null;
  const noneByTags = byTags !== null && byTags.length === 0;

  const [wRows, pRows, sRows] = await Promise.all([
    wantWorkouts && !noneByTags
      ? db
          .select()
          .from(workouts)
          .where(
            and(
              eq(workouts.status, 'published'),
              isNull(workouts.deletedAt),
              isNull(workouts.variantOfId),
              isNull(workouts.ownerSkillId), isNull(workouts.ownerProgramId),
              byTags ? inArray(workouts.id, byTags) : undefined,
              f.video ? eq(workouts.hasVideo, true) : undefined,
              f.guided ? eq(workouts.isGuided, true) : undefined,
              like
                ? byText?.length
                  ? or(ilike(workouts.name, like), inArray(workouts.id, byText))
                  : ilike(workouts.name, like)
                : undefined,
            ),
          )
          .orderBy(desc(workouts.createdAt))
          .limit(f.limit)
      : Promise.resolve([] as WorkoutRow[]),
    wantPrograms
      ? db
          .select()
          .from(programs)
          .where(
            and(
              eq(programs.status, 'published'),
              isNull(programs.deletedAt),
              like ? ilike(programs.name, like) : undefined,
            ),
          )
          .orderBy(desc(programs.createdAt))
          .limit(f.limit)
      : Promise.resolve([] as ProgramRow[]),
    wantSkills
      ? db
          .select()
          .from(skills)
          .where(
            and(
              eq(skills.status, 'published'),
              isNull(skills.deletedAt),
              like ? ilike(skills.name, like) : undefined,
            ),
          )
          .orderBy(desc(skills.createdAt))
          .limit(f.limit)
      : Promise.resolve([] as SkillRow[]),
  ]);

  const wTags = await workoutTags(db, wRows.map((w) => w.id));
  const skillIds = sRows.map((s) => s.id);
  const levelCounts = skillIds.length
    ? await db
        .select({ skillId: skillLevels.skillId, n: count() })
        .from(skillLevels)
        .where(inArray(skillLevels.skillId, skillIds))
        .groupBy(skillLevels.skillId)
    : [];
  const levelCountBy = new Map(levelCounts.map((r) => [r.skillId, Number(r.n)]));
  const progressRows =
    skillIds.length && f.userId
      ? await db
          .select({ skillId: skillProgress.skillId, n: skillProgress.unlockedLevels })
          .from(skillProgress)
          .where(and(eq(skillProgress.userId, f.userId), inArray(skillProgress.skillId, skillIds)))
      : [];
  const unlockedBy = new Map(progressRows.map((r) => [r.skillId, r.n]));

  const dayCounts = pRows.length
    ? await db
        .select({ programId: programDays.programId, value: count() })
        .from(programDays)
        .where(inArray(programDays.programId, pRows.map((p) => p.id)))
        .groupBy(programDays.programId)
    : [];
  const dayCountBy = new Map(dayCounts.map((r) => [r.programId, r.value]));

  const media = await resolveMediaUrls(db, env, [
    ...wRows.map((w) => w.thumbnailAssetId),
    ...pRows.map((p) => p.thumbnailAssetId),
    ...sRows.map((s) => s.thumbnailAssetId),
  ]);

  return {
    workouts: wRows.map((w) => ({
      ...workoutCard(w, url(media, w.thumbnailAssetId)),
      ...(wTags.get(w.id) ?? { muscles: [], equipment: [] }),
    })),
    programs: pRows.map((p) => programCard(p, url(media, p.thumbnailAssetId), dayCountBy.get(p.id) ?? 0)),
    skills: sRows.map((s) => skillCard(s, url(media, s.thumbnailAssetId), levelCountBy.get(s.id) ?? 0, unlockedBy.get(s.id) ?? 1)),
  };
}

export const appRoute = createApp();

// GET /api/app/me — session user + entitlement (does not require access).
appRoute.use('/me', requireUser);
appRoute.get('/me', async (c) => {
  const user = c.get('user')!;
  const entitlement = await resolveEntitlement(c.get('db'), c.env, user.id);
  return c.json({
    user: { id: user.id, email: user.email, name: user.name, image: user.image ?? null },
    entitlement,
  });
});

// Everything below requires an active entitlement.
appRoute.use('/home', requireAccess);
appRoute.use('/browse', requireAccess);
appRoute.use('/workouts/*', requireAccess);
appRoute.use('/programs/*', requireAccess);
appRoute.use('/skills/*', requireAccess);
appRoute.use('/logs', requireAccess);

// GET /api/app/home — hero + curated rows.
appRoute.get('/home', async (c) => {
  const db = c.get('db');
  const cat = await loadCatalog(db, c.env, {
    userId: c.get('user')!.id,
    types: ['workout', 'program', 'skill'],
    limit: 12,
  });

  const rows = [
    { title: 'Rutinas', layout: 'row', items: cat.workouts },
    { title: 'Programas', layout: 'poster', items: cat.programs },
    { title: 'Habilidades', layout: 'square', items: cat.skills },
  ].filter((r) => r.items.length > 0);

  const hero = cat.workouts[0] ?? cat.programs[0] ?? cat.skills[0] ?? null;
  return c.json({ hero, rows });
});

// GET /api/app/filters — the tags the app can filter rutinas by: only muscles
// and equipment that at least one published rutina actually carries.
appRoute.get('/filters', async (c) => {
  const db = c.get('db');
  const live = and(eq(workouts.status, 'published'), isNull(workouts.deletedAt), isNull(workouts.variantOfId), isNull(workouts.ownerSkillId), isNull(workouts.ownerProgramId));
  const [g, e] = await Promise.all([
    db
      .selectDistinct({ slug: muscles.slug, name: muscles.name, position: muscles.position })
      .from(workoutItems)
      .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
      .innerJoin(workouts, eq(workouts.id, workoutBlocks.workoutId))
      .innerJoin(exerciseMuscles, eq(exerciseMuscles.exerciseId, workoutItems.exerciseId))
      .innerJoin(muscles, eq(muscles.id, exerciseMuscles.muscleId))
      .where(live),
    db
      .selectDistinct({ slug: equipment.slug, name: equipment.name, position: equipment.position })
      .from(workoutItems)
      .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
      .innerJoin(workouts, eq(workouts.id, workoutBlocks.workoutId))
      .innerJoin(exerciseEquipment, eq(exerciseEquipment.exerciseId, workoutItems.exerciseId))
      .innerJoin(equipment, eq(equipment.id, exerciseEquipment.equipmentId))
      .where(live),
  ]);
  const sorted = (xs: { slug: string; name: string; position: number }[]) =>
    [...xs].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)).map(({ slug, name }) => ({ slug, name }));
  return c.json({ muscles: sorted(g), equipment: sorted(e) });
});

// GET /api/app/browse?q=&type=&muscle=&equipment=&video=1&guided=1 — search / browse published content.
// `muscle` / `equipment` are taxonomy slugs; they, `video` (has a video class)
// and `guided` (has a written rutina the app guides) only apply to rutinas.
appRoute.get('/browse', async (c) => {
  const q = c.req.query('q')?.trim() || undefined;
  const type = c.req.query('type');
  const muscle = c.req.query('muscle')?.trim() || undefined;
  const equipmentSlug = c.req.query('equipment')?.trim() || undefined;
  const video = c.req.query('video') === '1';
  const guided = c.req.query('guided') === '1';
  const types: Array<'workout' | 'program' | 'skill'> =
    type === 'workout' || type === 'program' || type === 'skill'
      ? [type]
      : muscle || equipmentSlug || video || guided
        ? ['workout']
        : ['workout', 'program', 'skill'];

  const cat = await loadCatalog(c.get('db'), c.env, { userId: c.get('user')!.id, q, types, limit: 30, muscle, equipment: equipmentSlug, video, guided });
  const rows = [
    { title: 'Rutinas', layout: 'row', items: cat.workouts },
    { title: 'Programas', layout: 'poster', items: cat.programs },
    { title: 'Habilidades', layout: 'square', items: cat.skills },
  ].filter((r) => r.items.length > 0);
  return c.json({ rows });
});

// GET /api/app/workouts/:id — full rutina for the player.
appRoute.get('/workouts/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const [w] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, id), eq(workouts.status, 'published'), isNull(workouts.deletedAt)))
    .limit(1);
  if (!w) return c.json({ error: 'No encontrado' }, 404);

  // Variants of a base rutina (RX / Escalada / …) so the app can offer a level.
  const variantRows = w.variantOfId
    ? []
    : await db
        .select({ id: workouts.id, label: workouts.variantLabel })
        .from(workouts)
        .where(
          and(eq(workouts.variantOfId, w.id), eq(workouts.status, 'published'), isNull(workouts.deletedAt)),
        )
        .orderBy(workouts.createdAt);

  const blocks = await db
    .select()
    .from(workoutBlocks)
    .where(eq(workoutBlocks.workoutId, w.id))
    .orderBy(workoutBlocks.position);
  const blockIds = blocks.map((b) => b.id);
  const items = blockIds.length
    ? await db
        .select()
        .from(workoutItems)
        .where(inArray(workoutItems.blockId, blockIds))
        .orderBy(workoutItems.position)
    : [];

  const exIds = [...new Set(items.map((it) => it.exerciseId).filter((id): id is string => Boolean(id)))];
  const tags = await tagsForExercises(db, exIds);
  const exRows = exIds.length
    ? await db.select().from(exercises).where(inArray(exercises.id, exIds))
    : [];
  const exBy = new Map<string, ExerciseRow>(exRows.map((e) => [e.id, e]));

  // Each exercise's most recent logged result for this user ("beat your last").
  const lastRows = exIds.length
    ? await db
        .select({
          exerciseId: setResults.exerciseId,
          reps: setResults.reps,
          seconds: setResults.seconds,
          distanceMeters: setResults.distanceMeters,
          loadKg: setResults.loadKg,
        })
        .from(setResults)
        .innerJoin(workoutLogs, eq(setResults.workoutLogId, workoutLogs.id))
        .where(and(eq(workoutLogs.userId, c.get('user')!.id), inArray(setResults.exerciseId, exIds)))
        .orderBy(desc(setResults.createdAt))
        .limit(500)
    : [];
  const lastBy = new Map<string, { reps: number | null; seconds: number | null; distanceMeters: number | null; loadKg: number | null }>();
  for (const r of lastRows) {
    if (r.exerciseId && !lastBy.has(r.exerciseId)) {
      lastBy.set(r.exerciseId, {
        reps: r.reps,
        seconds: r.seconds,
        distanceMeters: r.distanceMeters,
        loadKg: r.loadKg,
      });
    }
  }

  // Most recent session of this rutina by the user (for AMRAP "última vez").
  const [lastLog] = await db
    .select({
      roundsCompleted: workoutLogs.roundsCompleted,
      totalVolume: workoutLogs.totalVolume,
      durationSeconds: workoutLogs.durationSeconds,
      completedAt: workoutLogs.completedAt,
    })
    .from(workoutLogs)
    .where(and(eq(workoutLogs.userId, c.get('user')!.id), eq(workoutLogs.workoutId, w.id)))
    .orderBy(desc(workoutLogs.createdAt))
    .limit(1);

  const media = await resolveMediaUrls(db, c.env, [
    w.thumbnailAssetId,
    w.videoAssetId,
    w.warmupVideoAssetId,
    w.cooldownVideoAssetId,
    ...exRows.map((e) => e.demoVideoAssetId),
    ...exRows.map((e) => e.thumbnailAssetId),
  ]);

  const itemsByBlock = new Map<string, typeof items>();
  for (const it of items) {
    const arr = itemsByBlock.get(it.blockId) ?? [];
    arr.push(it);
    itemsByBlock.set(it.blockId, arr);
  }

  return c.json({
    id: w.id,
    slug: w.slug,
    name: w.name,
    description: w.description,
    hasVideo: w.hasVideo,
    isGuided: w.isGuided,
    format: w.format,
    difficulty: w.difficulty,
    estimatedDurationSeconds: w.estimatedDurationSeconds,
    thumbnailUrl: url(media, w.thumbnailAssetId),
    // Each section may be a video: the signed HLS manifest the app streams (and downloads for offline use).
    videoUrl: url(media, w.videoAssetId),
    warmupVideoUrl: url(media, w.warmupVideoAssetId),
    cooldownVideoUrl: url(media, w.cooldownVideoAssetId),
    // The admin attached a video that is still uploading or processing.
    videoPending: [w.videoAssetId, w.warmupVideoAssetId, w.cooldownVideoAssetId].some((id) => !!id && !url(media, id)),
    videoDurationSeconds: duration(media, w.videoAssetId),
    warmupVideoDurationSeconds: duration(media, w.warmupVideoAssetId),
    cooldownVideoDurationSeconds: duration(media, w.cooldownVideoAssetId),
    // What each video section's class does, as the admin wrote it (shown beside the video).
    videoNotes: {
      warmup: w.videoNotes?.warmup ?? null,
      main: w.videoNotes?.main ?? null,
      cooldown: w.videoNotes?.cooldown ?? null,
    },
    // The player builds each part's timing from its block; nothing at this level.
    formatConfig: null,
    scoringGoal: w.scoringGoal ?? null,
    variantOfId: w.variantOfId,
    variantLabel: w.variantLabel,
    variants: variantRows.map((v) => ({ id: v.id, label: v.label ?? '' })),
    muscles: tags.muscles.map((t) => t.name),
    equipment: tags.equipment.map((t) => t.name),
    lastLog: lastLog
      ? {
          roundsCompleted: lastLog.roundsCompleted,
          totalVolume: lastLog.totalVolume,
          durationSeconds: lastLog.durationSeconds,
          completedAt: lastLog.completedAt ? lastLog.completedAt.toISOString() : null,
        }
      : null,
    blocks: nestBlocks(blocks).map(function tree(b: Nested<AppBlockRow>): AppBlockOut {
      return { ...appBlock(b), blocks: b.blocks.map(tree) };
    }),
  });

  type AppBlockRow = (typeof blocks)[number];
  type AppBlockOut = ReturnType<typeof appBlock> & { blocks: AppBlockOut[] };
  function appBlock(b: AppBlockRow) {
    return {
      id: b.id,
      kind: b.kind,
      section: b.section,
      type: b.type,
      label: b.label,
      rounds: b.rounds,
      notes: b.notes,
      format: b.format ?? null,
      formatConfig: b.formatConfig ?? null,
      items: (itemsByBlock.get(b.id) ?? []).map((it) => {
        const ex = it.exerciseId ? exBy.get(it.exerciseId) : undefined;
        return {
          id: it.id,
          kind: it.kind,
          exerciseId: it.exerciseId,
          measure: it.measure ?? null,
          sets: it.sets,
          reps: it.reps,
          workSeconds: it.workSeconds,
          distanceMeters: it.distanceMeters,
          restBetweenSeconds: it.restBetweenSeconds,
          tempoOverride: it.tempoOverride ?? null,
          loadPrescription: it.loadPrescription ?? null,
          perSide: it.perSide,
          intervalIndex: it.intervalIndex,
          notes: it.notes,
          exercise: ex
            ? {
                id: ex.id,
                name: ex.name,
                description: ex.description,
                cues: ex.cues,
                defaultTempo: ex.defaultTempo ?? null,
                demoVideoUrl: url(media, ex.demoVideoAssetId),
                thumbnailUrl: url(media, ex.thumbnailAssetId),
                lastResult: lastBy.get(ex.id) ?? null,
              }
            : null,
        };
      }),
    };
  }
});

// GET /api/app/programs/:id — full program: its days in order, each with its
// rutina (opened with the rutina screen) or marked as rest.
appRoute.get('/programs/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const [p] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.id, id), eq(programs.status, 'published'), isNull(programs.deletedAt)))
    .limit(1);
  if (!p) return c.json({ error: 'No encontrado' }, 404);

  const days = await db
    .select({ day: programDays, workout: workouts })
    .from(programDays)
    .leftJoin(workouts, eq(workouts.id, programDays.workoutId))
    .where(eq(programDays.programId, p.id))
    .orderBy(programDays.position);

  const media = await resolveMediaUrls(db, c.env, [p.thumbnailAssetId, ...days.map((d) => d.workout?.thumbnailAssetId ?? null)]);
  const weeks = Math.ceil(days.length / 7);
  return c.json({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    difficulty: p.difficulty,
    durationDays: days.length,
    weeks,
    thumbnailUrl: url(media, p.thumbnailAssetId),
    days: days.map(({ day: d, workout: w }) => ({
      id: d.id,
      position: d.position,
      week: Math.floor(d.position / 7) + 1,
      isRestDay: d.isRestDay,
      workout: w ? workoutSummary(w, url(media, w.thumbnailAssetId)) : null,
    })),
  });
});

// GET /api/app/skills/:id — full skill with levels.
appRoute.get('/skills/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const [s] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.id, id), eq(skills.status, 'published'), isNull(skills.deletedAt)))
    .limit(1);
  if (!s) return c.json({ error: 'No encontrado' }, 404);

  const levels = await db
    .select()
    .from(skillLevels)
    .where(eq(skillLevels.skillId, s.id))
    .orderBy(skillLevels.position);

  const workoutIds = [...new Set(levels.map((l) => l.workoutId))];
  const wRows = workoutIds.length
    ? await db.select().from(workouts).where(inArray(workouts.id, workoutIds))
    : [];
  const wBy = new Map<string, WorkoutRow>(wRows.map((w) => [w.id, w]));

  const media = await resolveMediaUrls(db, c.env, [
    s.thumbnailAssetId,
    ...levels.map((l) => l.thumbnailAssetId),
    ...wRows.map((w) => w.thumbnailAssetId),
  ]);
  const userId = c.get('user')!.id;
  const unlocked = await unlockedLevels(db, userId, s.id);
  const marks = await bestMarks(db, userId, [...new Set(levels.flatMap((l) => l.unlockGoals.map((g) => g.exerciseId)))]);

  return c.json({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    difficulty: s.difficulty,
    thumbnailUrl: url(media, s.thumbnailAssetId),
    unlockedLevels: unlocked,
    levels: levels.map((l, i) => {
      const w = wBy.get(l.workoutId);
      return {
        id: l.id,
        position: l.position,
        name: l.name,
        description: l.description,
        // Goals carry the user's best mark so the app can show "7 de 10".
        unlockGoals: (l.unlockGoals ?? []).map((g) => ({ ...g, best: bestFor(g, marks), met: goalMet(g, marks) })),
        locked: i >= unlocked,
        completed: i < unlocked - 1,
        thumbnailUrl: url(media, l.thumbnailAssetId),
        workout: w ? workoutSummary(w, url(media, w.thumbnailAssetId)) : null,
      };
    }),
  });
});

// POST /api/app/logs — save a completed workout session.
appRoute.post('/logs', async (c) => {
  const user = c.get('user')!;
  const db = c.get('db');
  const parsed = createWorkoutLogSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Datos inválidos' }, 400);
  const input = parsed.data;

  const [log] = await db
    .insert(workoutLogs)
    .values({
      userId: user.id,
      workoutId: input.workoutId,
      workoutName: input.workoutName,
      format: input.format ?? null,
      mode: input.mode ?? null,
      startedAt: input.startedAt ? new Date(input.startedAt) : null,
      completedAt: input.completedAt ? new Date(input.completedAt) : null,
      durationSeconds: input.durationSeconds ?? null,
      roundsCompleted: input.roundsCompleted ?? null,
      totalVolume: input.totalVolume ?? null,
      notes: input.notes ?? null,
    })
    .returning({ id: workoutLogs.id });
  if (!log) return c.json({ error: 'No se pudo guardar' }, 500);

  if (input.results.length) {
    await db.insert(setResults).values(
      input.results.map((r, i) => ({
        workoutLogId: log.id,
        exerciseId: r.exerciseId,
        exerciseName: r.exerciseName,
        position: r.position ?? i,
        round: r.round ?? null,
        setNumber: r.setNumber ?? null,
        measure: r.measure ?? null,
        reps: r.reps ?? null,
        seconds: r.seconds ?? null,
        distanceMeters: r.distanceMeters ?? null,
        loadKg: r.loadKg != null ? Math.round(r.loadKg) : null,
      })),
    );
    await advanceSkills(db, user.id, [...new Set(input.results.map((r) => r.exerciseId))]);
  }

  return c.json({ id: log.id }, 201);
});

// GET /api/app/logs — recent sessions for the current user.
appRoute.get('/logs', async (c) => {
  const db = c.get('db');
  const rows = await db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, c.get('user')!.id))
    .orderBy(desc(workoutLogs.createdAt))
    .limit(30);
  return c.json({
    data: rows.map((l) => ({
      id: l.id,
      workoutId: l.workoutId,
      workoutName: l.workoutName,
      format: l.format,
      mode: l.mode,
      durationSeconds: l.durationSeconds,
      roundsCompleted: l.roundsCompleted,
      totalVolume: l.totalVolume,
      completedAt: l.completedAt ? l.completedAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
    })),
  });
});
