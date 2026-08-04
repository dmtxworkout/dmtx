import { and, count, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import {
  exercises,
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
}

/** Load published content of the requested types as display cards. */
async function loadCatalog(db: Database, env: Env, f: CatalogFilter) {
  const wantWorkouts = f.types.includes('workout');
  const wantPrograms = f.types.includes('program');
  const wantSkills = f.types.includes('skill');
  const like = f.q ? `%${f.q}%` : undefined;

  const [wRows, pRows, sRows] = await Promise.all([
    wantWorkouts
      ? db
          .select()
          .from(workouts)
          .where(
            and(
              eq(workouts.status, 'published'),
              eq(workouts.kind, 'rutina'),
              isNull(workouts.deletedAt),
              like ? ilike(workouts.name, like) : undefined,
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
    workouts: wRows.map((w) => workoutCard(w, url(media, w.thumbnailAssetId))),
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

// GET /api/app/browse?q=&type= — search / browse published content.
appRoute.get('/browse', async (c) => {
  const q = c.req.query('q')?.trim() || undefined;
  const type = c.req.query('type');
  const types: Array<'workout' | 'program' | 'skill'> =
    type === 'workout' || type === 'program' || type === 'skill'
      ? [type]
      : ['workout', 'program', 'skill'];

  const cat = await loadCatalog(c.get('db'), c.env, { q, types, limit: 30 });
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

  // Warmup/cooldown may be a referenced rutina; pull its blocks too and re-tag
  // them with that section so the player treats it uniformly. A set reference
  // overrides any inline blocks of the same section.
  const warmupRefId = w.warmupWorkoutId && w.warmupWorkoutId !== w.id ? w.warmupWorkoutId : null;
  const cooldownRefId =
    w.cooldownWorkoutId && w.cooldownWorkoutId !== w.id ? w.cooldownWorkoutId : null;
  const workoutIds = [w.id, warmupRefId, cooldownRefId].filter((x): x is string => Boolean(x));

  const allBlocks = await db
    .select()
    .from(workoutBlocks)
    .where(inArray(workoutBlocks.workoutId, workoutIds))
    .orderBy(workoutBlocks.position);

  // Resolve the section a block plays as; null = dropped (inline overridden).
  const sectionOf = (b: (typeof allBlocks)[number]): 'warmup' | 'main' | 'cooldown' | null => {
    if (b.workoutId === warmupRefId) return 'warmup';
    if (b.workoutId === cooldownRefId) return 'cooldown';
    if (b.section === 'warmup') return warmupRefId ? null : 'warmup';
    if (b.section === 'cooldown') return cooldownRefId ? null : 'cooldown';
    return 'main';
  };
  const rank = { warmup: 0, main: 1, cooldown: 2 } as const;
  const blocks = allBlocks
    .map((b) => ({ b, section: sectionOf(b) }))
    .filter((x): x is { b: (typeof allBlocks)[number]; section: 'warmup' | 'main' | 'cooldown' } =>
      x.section !== null,
    )
    .sort((a, z) => rank[a.section] - rank[z.section])
    .map((x) => ({ ...x.b, section: x.section }));
  const blockIds = blocks.map((b) => b.id);
  const items = blockIds.length
    ? await db
        .select()
        .from(workoutItems)
        .where(inArray(workoutItems.blockId, blockIds))
        .orderBy(workoutItems.position)
    : [];

  const exIds = [...new Set(items.map((it) => it.exerciseId).filter((id): id is string => Boolean(id)))];
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
    formatConfig: w.formatConfig ?? null,
    scoringGoal: w.scoringGoal ?? null,
    lastLog: lastLog
      ? {
          roundsCompleted: lastLog.roundsCompleted,
          totalVolume: lastLog.totalVolume,
          durationSeconds: lastLog.durationSeconds,
          completedAt: lastLog.completedAt ? lastLog.completedAt.toISOString() : null,
        }
      : null,
    blocks: blocks.map((b) => ({
      id: b.id,
      kind: b.kind,
      section: b.section,
      type: b.type,
      label: b.label,
      rounds: b.rounds,
      notes: b.notes,
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
                isUnilateral: ex.isUnilateral,
                defaultTempo: ex.defaultTempo ?? null,
                demoVideoUrl: url(media, ex.demoVideoAssetId),
                thumbnailUrl: url(media, ex.thumbnailAssetId),
                lastResult: lastBy.get(ex.id) ?? null,
              }
            : null,
        };
      }),
    })),
  });
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
