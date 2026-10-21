import { and, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import {
  equipment,
  exerciseEquipment,
  exerciseMuscles,
  exercises,
  muscleGroups,
  muscles,
  programDays,
  programItems,
  programVideoItems,
  programs,
  setResults,
  skillLevels,
  skills,
  workoutBlocks,
  workoutItems,
  workoutLogs,
  workouts,
} from '@dmtx/db';
import type { Database } from '@dmtx/db';
import { createWorkoutLogSchema } from '@dmtx/schemas';
import { createApp } from '../lib/openapi';
import { nestBlocks, type Nested } from './workouts';
import { tagsForExercises } from './taxonomy';
import { resolveMediaUrls } from '../lib/media';
import { resolveEntitlement } from '../lib/entitlement';
import { requireAccess, requireUser } from '../middleware/auth';
import type { Env } from '../env';

type WorkoutRow = typeof workouts.$inferSelect;
type ProgramRow = typeof programs.$inferSelect;
type SkillRow = typeof skills.$inferSelect;
type ExerciseRow = typeof exercises.$inferSelect;

const url = (m: Map<string, string>, id: string | null): string | null =>
  id ? (m.get(id) ?? null) : null;

const mins = (seconds: number | null): number | null =>
  seconds ? Math.max(1, Math.round(seconds / 60)) : null;

/** "AMRAP · 18 min" style row subtitle. */
function workoutMeta(w: WorkoutRow): string {
  const parts: string[] = [];
  if (w.type === 'video') parts.push('Video');
  else if (w.format) parts.push(w.format.toUpperCase());
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

function programCard(p: ProgramRow, thumb: string | null) {
  const weeks = p.durationDays ? Math.round(p.durationDays / 7) : null;
  const meta = weeks ? `${weeks} sem` : p.durationDays ? `${p.durationDays} días` : '';
  return {
    id: p.id,
    kind: 'program' as const,
    slug: p.slug,
    name: p.name,
    difficulty: p.difficulty,
    durationDays: p.durationDays,
    weeks,
    thumbnailUrl: thumb,
    tag: 'PROGRAMA',
    ratio: '2/3',
    meta,
    progressPct: 0,
  };
}

function skillCard(s: SkillRow, thumb: string | null, levels: number) {
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
    progressPct: 0,
  };
}

/** Compact workout reference embedded in program days / skill levels. */
function workoutSummary(w: WorkoutRow, thumb: string | null) {
  return {
    id: w.id,
    slug: w.slug,
    name: w.name,
    type: w.type,
    format: w.format,
    difficulty: w.difficulty,
    durationSeconds: w.estimatedDurationSeconds,
    thumbnailUrl: thumb,
    meta: workoutMeta(w),
  };
}

interface CatalogFilter {
  q?: string;
  types: Array<'workout' | 'program' | 'skill'>;
  limit: number;
  /** Slugs: only rutinas whose exercises work that group / need that equipment. */
  muscleGroup?: string;
  equipment?: string;
}

type Tags = { muscleGroups: string[]; equipment: string[] };

/**
 * The tags of each rutina, derived from its exercises: the muscle groups its
 * primary muscles belong to, and the equipment they need. One query each for
 * a whole page of rutinas.
 */
async function workoutTags(db: Database, workoutIds: string[]): Promise<Map<string, Tags>> {
  const out = new Map<string, Tags>();
  if (!workoutIds.length) return out;
  const [g, e] = await Promise.all([
    db
      .selectDistinct({ workoutId: workoutBlocks.workoutId, name: muscleGroups.name, position: muscleGroups.position })
      .from(workoutItems)
      .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
      .innerJoin(exerciseMuscles, and(eq(exerciseMuscles.exerciseId, workoutItems.exerciseId), eq(exerciseMuscles.role, 'primary')))
      .innerJoin(muscles, eq(muscles.id, exerciseMuscles.muscleId))
      .innerJoin(muscleGroups, eq(muscleGroups.id, muscles.muscleGroupId))
      .where(inArray(workoutBlocks.workoutId, workoutIds)),
    db
      .selectDistinct({ workoutId: workoutBlocks.workoutId, name: equipment.name, position: equipment.position })
      .from(workoutItems)
      .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
      .innerJoin(exerciseEquipment, eq(exerciseEquipment.exerciseId, workoutItems.exerciseId))
      .innerJoin(equipment, eq(equipment.id, exerciseEquipment.equipmentId))
      .where(inArray(workoutBlocks.workoutId, workoutIds)),
  ]);
  const tags = (id: string) => out.get(id) ?? (out.set(id, { muscleGroups: [], equipment: [] }), out.get(id)!);
  const sorted = <T extends { position: number; name: string }>(xs: T[]) =>
    [...xs].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  for (const r of sorted(g)) tags(r.workoutId).muscleGroups.push(r.name);
  for (const r of sorted(e)) tags(r.workoutId).equipment.push(r.name);
  return out;
}

/** Ids of rutinas matching a muscle-group slug / equipment slug / free text over the tag names. */
async function workoutIdsByTags(db: Database, f: { muscleGroup?: string; equipment?: string; q?: string }): Promise<string[] | null> {
  const sets: string[][] = [];
  if (f.muscleGroup || f.q) {
    const rows = await db
      .selectDistinct({ workoutId: workoutBlocks.workoutId })
      .from(workoutItems)
      .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
      .innerJoin(exerciseMuscles, and(eq(exerciseMuscles.exerciseId, workoutItems.exerciseId), eq(exerciseMuscles.role, 'primary')))
      .innerJoin(muscles, eq(muscles.id, exerciseMuscles.muscleId))
      .innerJoin(muscleGroups, eq(muscleGroups.id, muscles.muscleGroupId))
      .where(f.muscleGroup ? eq(muscleGroups.slug, f.muscleGroup) : ilike(muscleGroups.name, `%${f.q}%`));
    if (f.muscleGroup) sets.push(rows.map((r) => r.workoutId));
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
  const byTags = wantWorkouts ? await workoutIdsByTags(db, { muscleGroup: f.muscleGroup, equipment: f.equipment }) : null;
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
              byTags ? inArray(workouts.id, byTags) : undefined,
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

  const media = await resolveMediaUrls(db, env, [
    ...wRows.map((w) => w.thumbnailAssetId),
    ...pRows.map((p) => p.thumbnailAssetId),
    ...sRows.map((s) => s.thumbnailAssetId),
  ]);

  return {
    workouts: wRows.map((w) => ({
      ...workoutCard(w, url(media, w.thumbnailAssetId)),
      ...(wTags.get(w.id) ?? { muscleGroups: [], equipment: [] }),
    })),
    programs: pRows.map((p) => programCard(p, url(media, p.thumbnailAssetId))),
    skills: sRows.map((s) => skillCard(s, url(media, s.thumbnailAssetId), levelCountBy.get(s.id) ?? 0)),
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

// GET /api/app/filters — the tags the app can filter rutinas by: only groups
// and equipment that at least one published rutina actually carries.
appRoute.get('/filters', async (c) => {
  const db = c.get('db');
  const live = and(eq(workouts.status, 'published'), isNull(workouts.deletedAt), isNull(workouts.variantOfId));
  const [g, e] = await Promise.all([
    db
      .selectDistinct({ slug: muscleGroups.slug, name: muscleGroups.name, position: muscleGroups.position })
      .from(workoutItems)
      .innerJoin(workoutBlocks, eq(workoutBlocks.id, workoutItems.blockId))
      .innerJoin(workouts, eq(workouts.id, workoutBlocks.workoutId))
      .innerJoin(exerciseMuscles, and(eq(exerciseMuscles.exerciseId, workoutItems.exerciseId), eq(exerciseMuscles.role, 'primary')))
      .innerJoin(muscles, eq(muscles.id, exerciseMuscles.muscleId))
      .innerJoin(muscleGroups, eq(muscleGroups.id, muscles.muscleGroupId))
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
  return c.json({ muscleGroups: sorted(g), equipment: sorted(e) });
});

// GET /api/app/browse?q=&type=&muscleGroup=&equipment= — search / browse published content.
// `muscleGroup` / `equipment` are taxonomy slugs; they only apply to rutinas.
appRoute.get('/browse', async (c) => {
  const q = c.req.query('q')?.trim() || undefined;
  const type = c.req.query('type');
  const muscleGroup = c.req.query('muscleGroup')?.trim() || undefined;
  const equipmentSlug = c.req.query('equipment')?.trim() || undefined;
  const types: Array<'workout' | 'program' | 'skill'> =
    type === 'workout' || type === 'program' || type === 'skill'
      ? [type]
      : muscleGroup || equipmentSlug
        ? ['workout']
        : ['workout', 'program', 'skill'];

  const cat = await loadCatalog(c.get('db'), c.env, { q, types, limit: 30, muscleGroup, equipment: equipmentSlug });
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
    type: w.type,
    format: w.format,
    difficulty: w.difficulty,
    estimatedDurationSeconds: w.estimatedDurationSeconds,
    thumbnailUrl: url(media, w.thumbnailAssetId),
    videoUrl: url(media, w.videoAssetId),
    videoDurationSeconds: w.videoDurationSeconds,
    // The player builds each part's timing from its block; nothing at this level.
    formatConfig: null,
    scoringGoal: w.scoringGoal ?? null,
    variantOfId: w.variantOfId,
    variantLabel: w.variantLabel,
    variants: variantRows.map((v) => ({ id: v.id, label: v.label ?? '' })),
    muscleGroups: tags.muscleGroups.map((t) => t.name),
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

// GET /api/app/programs/:id — full program.
appRoute.get('/programs/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const [p] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.id, id), eq(programs.status, 'published'), isNull(programs.deletedAt)))
    .limit(1);
  if (!p) return c.json({ error: 'No encontrado' }, 404);

  const [days, videoItems] = await Promise.all([
    db.select().from(programDays).where(eq(programDays.programId, p.id)).orderBy(programDays.position),
    db
      .select()
      .from(programVideoItems)
      .where(eq(programVideoItems.programId, p.id))
      .orderBy(programVideoItems.position),
  ]);
  const dayIds = days.map((d) => d.id);
  const dayItems = dayIds.length
    ? await db
        .select()
        .from(programItems)
        .where(inArray(programItems.programDayId, dayIds))
        .orderBy(programItems.position)
    : [];

  const workoutIds = [...new Set(dayItems.map((it) => it.workoutId))];
  const wRows = workoutIds.length
    ? await db.select().from(workouts).where(inArray(workouts.id, workoutIds))
    : [];
  const wBy = new Map<string, WorkoutRow>(wRows.map((w) => [w.id, w]));

  const media = await resolveMediaUrls(db, c.env, [
    p.thumbnailAssetId,
    ...wRows.map((w) => w.thumbnailAssetId),
    ...videoItems.map((v) => v.mediaAssetId),
  ]);

  const itemsByDay = new Map<string, string[]>();
  for (const it of dayItems) {
    const arr = itemsByDay.get(it.programDayId) ?? [];
    arr.push(it.workoutId);
    itemsByDay.set(it.programDayId, arr);
  }

  const weeks = p.durationDays ? Math.round(p.durationDays / 7) : null;
  return c.json({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    type: p.type,
    difficulty: p.difficulty,
    durationDays: p.durationDays,
    weeks,
    thumbnailUrl: url(media, p.thumbnailAssetId),
    days: days.map((d) => ({
      id: d.id,
      position: d.position,
      weekNumber: d.weekNumber,
      dayOfWeek: d.dayOfWeek,
      isRestDay: d.isRestDay,
      title: d.title,
      notes: d.notes,
      workouts: (itemsByDay.get(d.id) ?? [])
        .map((wid) => wBy.get(wid))
        .filter((w): w is WorkoutRow => Boolean(w))
        .map((w) => workoutSummary(w, url(media, w.thumbnailAssetId))),
    })),
    videoItems: videoItems.map((v) => ({
      id: v.id,
      title: v.title,
      description: v.description,
      durationSeconds: v.durationSeconds,
      videoUrl: url(media, v.mediaAssetId),
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

  return c.json({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    difficulty: s.difficulty,
    thumbnailUrl: url(media, s.thumbnailAssetId),
    levels: levels.map((l) => {
      const w = wBy.get(l.workoutId);
      return {
        id: l.id,
        position: l.position,
        name: l.name,
        description: l.description,
        unlockGoal: l.unlockGoal ?? null,
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
      durationSeconds: l.durationSeconds,
      roundsCompleted: l.roundsCompleted,
      totalVolume: l.totalVolume,
      completedAt: l.completedAt ? l.completedAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
    })),
  });
});
