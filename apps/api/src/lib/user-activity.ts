import { and, count, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import { activityEvents, profiles, programDays, programs, skillLevels, skillProgress, skills, workoutLogs, workouts } from '@dmtx/db';
import type { Database } from '@dmtx/db';

const unique = <T,>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x != null))];
const iso = (v: string | Date) => new Date(v).toISOString();
const newest = (dates: (string | null)[]) => dates.reduce<string | null>((a, d) => (d && (!a || new Date(d) > new Date(a)) ? d : a), null);

const LOG_AT = sql`coalesce(${workoutLogs.completedAt}, ${workoutLogs.createdAt})`;
const MINUTES = sql<number>`coalesce(round(sum(${workoutLogs.durationSeconds}) / 60.0), 0)::int`;

/**
 * What the admin's user page sums up about a member. The database does the adding
 * up, so it's exact however long their history is: sessions come from workout_logs,
 * skill levels from skill_progress, what they looked at from activity_events. A
 * program or skill counts as done through the sessions of its rutinas, a variant's
 * counting for its base rutina too. The history itself is paged: loadUserHistory.
 */
export async function loadUserActivity(db: Database, userId: string) {
  const [[summary], [lastEvent], [profile], progress, byRutina, looked] = await Promise.all([
    db
      .select({
        sessions: count(),
        sessions30d: sql<number>`count(*) filter (where ${LOG_AT} > now() - interval '30 days')::int`,
        minutes: MINUTES,
        lastAt: sql<string | null>`max(${LOG_AT})`,
      })
      .from(workoutLogs)
      .where(eq(workoutLogs.userId, userId)),
    db.select({ at: sql<string | null>`max(${activityEvents.createdAt})` }).from(activityEvents).where(eq(activityEvents.userId, userId)),
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db.select().from(skillProgress).where(eq(skillProgress.userId, userId)),
    db
      .select({
        id: workoutLogs.workoutId,
        // The name it had last, and rutinas since deleted stay apart by theirs.
        name: sql<string>`(array_agg(${workoutLogs.workoutName} order by ${LOG_AT} desc))[1]`,
        sessions: count(),
        minutes: MINUTES,
        lastAt: sql<string>`max(${LOG_AT})`,
      })
      .from(workoutLogs)
      .where(eq(workoutLogs.userId, userId))
      .groupBy(workoutLogs.workoutId, sql`case when ${workoutLogs.workoutId} is null then ${workoutLogs.workoutName} end`),
    db
      .select({
        kind: activityEvents.kind,
        id: activityEvents.contentId,
        name: sql<string>`(array_agg(${activityEvents.contentName} order by ${activityEvents.createdAt} desc))[1]`,
        times: count(),
        lastAt: sql<string>`max(${activityEvents.createdAt})`,
      })
      .from(activityEvents)
      .where(and(eq(activityEvents.userId, userId), isNotNull(activityEvents.contentId)))
      .groupBy(activityEvents.kind, activityEvents.contentId),
  ]);

  // Each rutina done, with the base rutina of its variants.
  const logged = byRutina.filter((r): r is typeof r & { id: string } => r.id != null);
  const loggedIds = logged.map((r) => r.id);
  const variants = loggedIds.length
    ? await db.select({ id: workouts.id, base: workouts.variantOfId }).from(workouts).where(inArray(workouts.id, loggedIds))
    : [];
  const membersOf = new Map<string, string[]>(loggedIds.map((id) => [id, [id]]));
  for (const v of variants) if (v.base) membersOf.set(v.base, [...(membersOf.get(v.base) ?? []), v.id]);
  const doneIds = [...membersOf.keys()];
  const sessionsOf = (workoutIds: string[]) => {
    const ids = new Set(workoutIds.flatMap((id) => membersOf.get(id) ?? []));
    const rows = logged.filter((r) => ids.has(r.id));
    return { sessions: rows.reduce((n, r) => n + r.sessions, 0), lastAt: newest(rows.map((r) => r.lastAt)) };
  };

  // Programs: those with a session on one of their days.
  const programHits = doneIds.length
    ? await db.selectDistinct({ id: programDays.programId }).from(programDays).where(inArray(programDays.workoutId, doneIds))
    : [];
  const programIds = programHits.map((p) => p.id);
  const [programRows, dayRows] = programIds.length
    ? await Promise.all([
        db.select({ id: programs.id, name: programs.name }).from(programs).where(inArray(programs.id, programIds)),
        db
          .select({ programId: programDays.programId, workoutId: programDays.workoutId })
          .from(programDays)
          .where(and(inArray(programDays.programId, programIds), eq(programDays.isRestDay, false), isNotNull(programDays.workoutId))),
      ])
    : [[], []];
  const programList = programRows
    .map((p) => {
      const days = dayRows.filter((d) => d.programId === p.id).map((d) => d.workoutId!);
      const { sessions, lastAt } = sessionsOf(days);
      return {
        id: p.id,
        name: p.name,
        sessions,
        daysDone: days.filter((id) => membersOf.has(id)).length,
        daysTotal: days.length,
        lastAt: iso(lastAt!),
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  // Skills: those started, by a level unlocked or a session on a level's rutina.
  const skillHits = doneIds.length
    ? await db.selectDistinct({ id: skillLevels.skillId }).from(skillLevels).where(inArray(skillLevels.workoutId, doneIds))
    : [];
  const hitIds = skillHits.map((s) => s.id);
  const skillIds = unique([...hitIds, ...progress.map((p) => p.skillId)]);
  const [skillRows, levelRows] = skillIds.length
    ? await Promise.all([
        db.select({ id: skills.id, name: skills.name }).from(skills).where(inArray(skills.id, skillIds)),
        db.select({ skillId: skillLevels.skillId, workoutId: skillLevels.workoutId }).from(skillLevels).where(inArray(skillLevels.skillId, skillIds)),
      ])
    : [[], []];
  const skillList = skillRows
    .map((s) => {
      const levels = levelRows.filter((l) => l.skillId === s.id);
      const { sessions, lastAt } = sessionsOf(levels.map((l) => l.workoutId));
      return {
        id: s.id,
        name: s.name,
        sessions,
        level: progress.find((p) => p.skillId === s.id)?.unlockedLevels ?? 1,
        levels: levels.length,
        lastAt: lastAt ? iso(lastAt) : null,
      };
    })
    .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));

  // Looked at or started, but with no session.
  const seen = new Map<string, { type: 'workout' | 'program' | 'skill'; id: string; name: string; views: number; starts: number; lastAt: string }>();
  for (const e of looked) {
    if (!e.id) continue;
    const type = e.kind === 'view_program' ? 'program' : e.kind === 'view_skill' ? 'skill' : 'workout';
    const s = seen.get(`${type}:${e.id}`) ?? { type, id: e.id, name: e.name, views: 0, starts: 0, lastAt: e.lastAt };
    if (e.kind === 'start_workout') s.starts += e.times;
    else s.views += e.times;
    s.lastAt = newest([s.lastAt, e.lastAt])!;
    seen.set(`${type}:${e.id}`, s);
  }
  const donePrograms = new Set(programIds);
  const doneSkills = new Set(hitIds);
  const interest = [...seen.values()]
    .filter((i) => !(i.type === 'program' ? donePrograms.has(i.id) : i.type === 'skill' ? doneSkills.has(i.id) : membersOf.has(i.id)))
    .map((i) => ({ ...i, lastAt: iso(i.lastAt) }))
    .sort((a, b) => b.views + b.starts - (a.views + a.starts) || b.lastAt.localeCompare(a.lastAt));

  const lastActive = newest([summary?.lastAt ?? null, lastEvent?.at ?? null]);

  return {
    summary: {
      sessions: summary?.sessions ?? 0,
      sessions30d: summary?.sessions30d ?? 0,
      minutes: summary?.minutes ?? 0,
      lastActiveAt: lastActive ? iso(lastActive) : null,
    },
    profile: {
      gender: profile?.gender ?? null,
      dateOfBirth: profile?.dateOfBirth ?? null,
      heightCm: profile?.heightCm ?? null,
      weightKg: profile?.weightKg ?? null,
      activityLevel: profile?.activityLevel ?? null,
    },
    workouts: byRutina
      .map((r) => ({ ...r, lastAt: iso(r.lastAt) }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    programs: programList,
    skills: skillList,
    interest,
  };
}

export const HISTORY_TYPES = ['all', 'session', 'view', 'start', 'search'] as const;
export type HistoryType = (typeof HISTORY_TYPES)[number];

const EVENT_KINDS: Record<Exclude<HistoryType, 'all' | 'session'>, string[]> = {
  view: ['view_workout', 'view_program', 'view_skill'],
  start: ['start_workout'],
  search: ['search'],
};
const CONTENT_LABEL: Record<string, string> = {
  view_workout: 'Rutina',
  start_workout: 'Rutina',
  view_program: 'Programa',
  view_skill: 'Habilidad',
};

type HistoryRow = {
  id: string;
  kind: string;
  title: string | null;
  seconds: number | null;
  query: string | null;
  filters: string[] | null;
  results: number | null;
  at: string;
};

/**
 * One page of everything a member did, newest first. The cursor is the last row's
 * exact time (as Postgres text, microseconds and all) and id, so pages never skip
 * or repeat a row, and asking for an old page costs the same as a recent one.
 */
export async function loadUserHistory(
  db: Database,
  userId: string,
  { type, cursor, limit }: { type: HistoryType; cursor: { at: string; id: string } | null; limit: number },
) {
  const parts: SQL[] = [];
  if (type === 'all' || type === 'session') {
    parts.push(sql`
      select id, 'session' as kind, workout_name as title, duration_seconds as seconds,
             null::text as query, null::jsonb as filters, null::int as results,
             coalesce(completed_at, created_at) as at
      from workout_logs where user_id = ${userId}`);
  }
  if (type !== 'session') {
    const kinds = type === 'all' ? null : EVENT_KINDS[type];
    parts.push(sql`
      select id, kind::text as kind, content_name as title, null::int as seconds,
             query, filters, results, created_at as at
      from activity_events where user_id = ${userId}
      ${kinds ? sql`and kind::text in (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)})` : sql``}`);
  }
  const { rows } = await db.execute<HistoryRow>(sql`
    select id, kind, title, seconds, query, filters, results, at::text as at
    from (${sql.join(parts, sql` union all `)}) activity
    ${cursor ? sql`where (activity.at, activity.id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : sql``}
    order by activity.at desc, activity.id desc
    limit ${limit + 1}`);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => {
      const filters = r.filters ?? [];
      const results = r.results ?? 0;
      if (r.kind === 'session') {
        return { id: r.id, type: 'session' as const, title: r.title ?? '', detail: r.seconds ? `${Math.max(1, Math.round(r.seconds / 60))} min` : null, query: null, filters, results, at: iso(r.at) };
      }
      if (r.kind === 'search') {
        return { id: r.id, type: 'search' as const, title: r.query ?? filters.join(', '), detail: results === 1 ? '1 resultado' : `${results} resultados`, query: r.query, filters, results, at: iso(r.at) };
      }
      return { id: r.id, type: r.kind === 'start_workout' ? ('start' as const) : ('view' as const), title: r.title ?? '', detail: CONTENT_LABEL[r.kind] ?? null, query: null, filters, results, at: iso(r.at) };
    }),
    nextCursor: rows.length > limit && last ? `${last.at}|${last.id}` : null,
  };
}
