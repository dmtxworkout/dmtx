import { and, desc, eq, inArray } from 'drizzle-orm';
import { activityEvents, profiles, programDays, programs, skillLevels, skillProgress, skills, workoutLogs, workouts } from '@dmtx/db';
import type { Database } from '@dmtx/db';

const DAY_MS = 86_400_000;
const MAX_ROWS = 2000;
const TIMELINE = 80;
const SEARCHES = 30;

type Seen = { views: number; starts: number; lastAt: Date; name: string };

const latest = (a: Date | null, b: Date) => (a && a > b ? a : b);
const unique = <T,>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x != null))];

/**
 * Everything the admin's user page shows about what a member does: sessions come
 * from workout_logs, skill levels from skill_progress, and what they looked at and
 * searched for from activity_events. A program or skill counts as done through the
 * sessions of its rutinas, a variant's sessions counting for its base rutina too.
 */
export async function loadUserActivity(db: Database, userId: string, now = new Date()) {
  const [logs, events, [profile], progress] = await Promise.all([
    db.select().from(workoutLogs).where(eq(workoutLogs.userId, userId)).orderBy(desc(workoutLogs.createdAt)).limit(MAX_ROWS),
    db.select().from(activityEvents).where(eq(activityEvents.userId, userId)).orderBy(desc(activityEvents.createdAt)).limit(MAX_ROWS),
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db.select().from(skillProgress).where(eq(skillProgress.userId, userId)),
  ]);
  const when = (l: (typeof logs)[number]) => l.completedAt ?? l.createdAt;

  // What each piece of content was looked at, by kind.
  const seen = new Map<string, Seen>();
  for (const e of events) {
    if (!e.contentId) continue;
    const type = e.kind === 'view_program' ? 'program' : e.kind === 'view_skill' ? 'skill' : 'workout';
    const key = `${type}:${e.contentId}`;
    const s = seen.get(key) ?? { views: 0, starts: 0, lastAt: e.createdAt, name: e.contentName ?? '' };
    if (e.kind === 'start_workout') s.starts += 1;
    else s.views += 1;
    seen.set(key, s);
  }

  // Sessions by rutina, and by the base rutina of the variants done.
  const loggedIds = unique(logs.map((l) => l.workoutId));
  const variants = loggedIds.length
    ? await db.select({ id: workouts.id, base: workouts.variantOfId }).from(workouts).where(inArray(workouts.id, loggedIds))
    : [];
  const baseOf = new Map(variants.map((v) => [v.id, v.base]));
  const logsByWorkout = new Map<string, typeof logs>();
  for (const l of logs) {
    if (!l.workoutId) continue;
    for (const id of unique([l.workoutId, baseOf.get(l.workoutId)])) logsByWorkout.set(id, [...(logsByWorkout.get(id) ?? []), l]);
  }
  const doneIds = [...logsByWorkout.keys()];

  const byRutina = new Map<string, { id: string | null; name: string; sessions: number; minutes: number; lastAt: Date }>();
  for (const l of logs) {
    const key = l.workoutId ?? l.workoutName;
    const r = byRutina.get(key) ?? { id: l.workoutId, name: l.workoutName, sessions: 0, minutes: 0, lastAt: when(l) };
    r.sessions += 1;
    r.minutes += Math.round((l.durationSeconds ?? 0) / 60);
    r.lastAt = latest(r.lastAt, when(l));
    byRutina.set(key, r);
  }

  // Programs: those with a session on one of their days.
  const programHits = doneIds.length
    ? await db.select({ programId: programDays.programId }).from(programDays).where(inArray(programDays.workoutId, doneIds))
    : [];
  const programIds = unique(programHits.map((p) => p.programId));
  const [programRows, dayRows] = programIds.length
    ? await Promise.all([
        db.select({ id: programs.id, name: programs.name }).from(programs).where(inArray(programs.id, programIds)),
        db.select({ programId: programDays.programId, workoutId: programDays.workoutId }).from(programDays).where(and(inArray(programDays.programId, programIds), eq(programDays.isRestDay, false))),
      ])
    : [[], []];
  const programList = programRows.map((p) => {
    const days = dayRows.filter((d) => d.programId === p.id && d.workoutId);
    const done = days.filter((d) => logsByWorkout.has(d.workoutId!));
    const sessions = unique(done.flatMap((d) => logsByWorkout.get(d.workoutId!) ?? []));
    return {
      id: p.id,
      name: p.name,
      sessions: sessions.length,
      daysDone: done.length,
      daysTotal: days.length,
      lastAt: sessions.reduce<Date>((at, l) => latest(at, when(l)), new Date(0)),
    };
  });

  // Skills: those started, by a level unlocked or a session on a level's rutina.
  const skillHits = doneIds.length
    ? await db.select({ skillId: skillLevels.skillId }).from(skillLevels).where(inArray(skillLevels.workoutId, doneIds))
    : [];
  const hitIds = unique(skillHits.map((s) => s.skillId));
  const skillIds = unique([...hitIds, ...progress.map((p) => p.skillId)]);
  const [skillRows, levelRows] = skillIds.length
    ? await Promise.all([
        db.select({ id: skills.id, name: skills.name }).from(skills).where(inArray(skills.id, skillIds)),
        db.select({ skillId: skillLevels.skillId, workoutId: skillLevels.workoutId }).from(skillLevels).where(inArray(skillLevels.skillId, skillIds)),
      ])
    : [[], []];
  const skillList = skillRows.map((s) => {
    const levels = levelRows.filter((l) => l.skillId === s.id);
    const sessions = unique(levels.flatMap((l) => logsByWorkout.get(l.workoutId) ?? []));
    return {
      id: s.id,
      name: s.name,
      sessions: sessions.length,
      level: progress.find((p) => p.skillId === s.id)?.unlockedLevels ?? 1,
      levels: levels.length,
      lastAt: sessions.reduce<Date | null>((at, l) => latest(at, when(l)), null),
    };
  });

  // Looked at or started, but with no session.
  const donePrograms = new Set(programIds);
  const doneSkills = new Set(hitIds);
  const done = (type: string, id: string) =>
    type === 'program' ? donePrograms.has(id) : type === 'skill' ? doneSkills.has(id) : logsByWorkout.has(id);
  const interest = [...seen.entries()]
    .map(([key, s]) => {
      const [type, id] = key.split(':') as ['workout' | 'program' | 'skill', string];
      return { type, id, name: s.name, views: s.views, starts: s.starts, lastAt: s.lastAt };
    })
    .filter((i) => !done(i.type, i.id))
    .sort((a, b) => b.views + b.starts - (a.views + a.starts) || b.lastAt.getTime() - a.lastAt.getTime());

  const searches = events.filter((e) => e.kind === 'search');
  const timeline = [
    ...logs.map((l) => ({
      type: 'session' as const,
      title: l.workoutName,
      detail: l.durationSeconds ? `${Math.max(1, Math.round(l.durationSeconds / 60))} min` : null,
      at: when(l),
    })),
    ...events.map((e) =>
      e.kind === 'search'
        ? { type: 'search' as const, title: e.query ?? (e.filters ?? []).join(', '), detail: e.results === 1 ? '1 resultado' : `${e.results ?? 0} resultados`, at: e.createdAt }
        : {
            type: e.kind === 'start_workout' ? ('start' as const) : ('view' as const),
            title: e.contentName ?? '',
            detail: e.kind === 'view_program' ? 'Programa' : e.kind === 'view_skill' ? 'Habilidad' : 'Rutina',
            at: e.createdAt,
          },
    ),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, TIMELINE);

  const lastSession = logs[0] ? logs.reduce((at, l) => latest(at, when(l)), new Date(0)) : null;
  const lastEvent = events[0]?.createdAt ?? null;
  const lastActive = lastSession && lastEvent ? latest(lastSession, lastEvent) : (lastSession ?? lastEvent);

  return {
    summary: {
      sessions: logs.length,
      sessions30d: logs.filter((l) => now.getTime() - when(l).getTime() < 30 * DAY_MS).length,
      minutes: logs.reduce((n, l) => n + Math.round((l.durationSeconds ?? 0) / 60), 0),
      lastActiveAt: lastActive?.toISOString() ?? null,
    },
    profile: {
      gender: profile?.gender ?? null,
      dateOfBirth: profile?.dateOfBirth ?? null,
      heightCm: profile?.heightCm ?? null,
      weightKg: profile?.weightKg ?? null,
      activityLevel: profile?.activityLevel ?? null,
    },
    workouts: [...byRutina.values()]
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
      .map((r) => ({ ...r, lastAt: r.lastAt.toISOString() })),
    programs: programList
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
      .map((p) => ({ ...p, lastAt: p.lastAt.toISOString() })),
    skills: skillList
      .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0))
      .map((s) => ({ ...s, lastAt: s.lastAt?.toISOString() ?? null })),
    interest: interest.map((i) => ({ ...i, lastAt: i.lastAt.toISOString() })),
    searches: searches.slice(0, SEARCHES).map((s) => ({
      query: s.query,
      filters: s.filters ?? [],
      results: s.results ?? 0,
      at: s.createdAt.toISOString(),
    })),
    timeline: timeline.map((t) => ({ ...t, at: t.at.toISOString() })),
  };
}
