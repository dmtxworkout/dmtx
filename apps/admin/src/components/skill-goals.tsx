'use client';

// A skill level's «Objetivo»: what the user has to reach to unlock the next
// level. Not written by hand: the panel lists the exercises the level's
// rutina uses (its main section) and each can be ticked with the mark to
// reach, so a goal can only be about something the level trains. The goals
// still live in the level's text (its "Objetivo" section, written back with
// `goalLine`), which is where the API reads them from.
import { useEffect, useState } from 'react';
import type { ParsedBlock, ParsedItem, ParsedRutina } from '@dmtx/core';
import type { SkillGoal, SkillGoalMetric } from '@dmtx/schemas';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

const METRIC_LABEL: Record<SkillGoalMetric, string> = {
  reps: 'repeticiones',
  time_seconds: 'segundos',
  distance_meters: 'metros',
  load_kg: 'kg',
};

/** The marks a rutina line measures: «10 sentadillas» counts reps, «30s plancha» seconds, «400 m» metres, «8 @45 lb» reps and load. */
function metricsOf(it: ParsedItem): SkillGoalMetric[] {
  const out: SkillGoalMetric[] = [];
  if (it.reps) out.push('reps');
  if (it.workSeconds) out.push('time_seconds');
  if (it.distanceMeters) out.push('distance_meters');
  if (it.loadPrescription?.type === 'absolute' && it.loadPrescription.value > 0) out.push('load_kg');
  if (out.length) return out;
  // A bare name: the exercise's own measure.
  return [it.measure === 'time' ? 'time_seconds' : it.measure === 'distance' ? 'distance_meters' : 'reps'];
}

/** A first guess at the goal for an exercise, from how the rutina prescribes it. */
function suggestion(it: ParsedItem): Pick<SkillGoal, 'metric' | 'value' | 'reps'> {
  const metric = metricsOf(it)[0]!;
  if (metric === 'time_seconds') return { metric, value: it.workSeconds ?? 30, reps: null };
  if (metric === 'distance_meters') return { metric, value: it.distanceMeters ?? 100, reps: null };
  if (metric === 'load_kg') return { metric, ...loadGoal(it) };
  return { metric, value: it.reps ?? 1, reps: null };
}

/** The load in kg (and the reps done with it) a line prescribes. */
function loadGoal(it: ParsedItem): { value: number; reps: number } {
  const load = it.loadPrescription;
  const v = load?.type === 'absolute' ? load.value : 0;
  const kg = load?.type === 'absolute' && load.unit === 'lb' ? Math.round(v * 0.45359237 * 10) / 10 : v;
  return { value: kg || 1, reps: it.reps ?? 1 };
}

/** An exercise of the level's rutina: its suggested goal and the marks the rutina measures it by. */
export type RutinaExercise = SkillGoal & { metrics: SkillGoalMetric[]; item: ParsedItem };

/** The exercises of the level's main section, in order, once each, with a suggested goal. */
export function rutinaExercises(parsed: ParsedRutina): RutinaExercise[] {
  const out = new Map<string, RutinaExercise>();
  const walk = (blocks: ParsedBlock[]) => {
    for (const b of blocks) {
      if (b.section !== 'main') continue;
      for (const it of b.items) {
        if (it.kind !== 'exercise' || !it.match) continue;
        const seen = out.get(it.match.id);
        if (!seen) {
          out.set(it.match.id, { exerciseId: it.match.id, exerciseName: it.match.name, ...suggestion(it), metrics: metricsOf(it), item: it });
        } else {
          // The same exercise written twice (different sets): any mark either line measures.
          for (const m of metricsOf(it)) if (!seen.metrics.includes(m)) seen.metrics.push(m);
          if (!seen.item.loadPrescription && it.loadPrescription) seen.item = it;
        }
      }
      if (b.children) walk(b.children);
    }
  };
  walk(parsed.blocks);
  return [...out.values()];
}

/** Why a goal no longer fits the level's rutina, or null when it does. */
export function goalProblem(g: SkillGoal, exercises: RutinaExercise[]): string | null {
  const e = exercises.find((x) => x.exerciseId === g.exerciseId);
  if (!e) return 'ya no está en su rutina';
  if (!e.metrics.includes(g.metric)) return `su rutina ya no lo mide en ${METRIC_LABEL[g.metric]}`;
  return null;
}

/** The goal when the admin switches its unit: the rutina's own number for that unit. */
function switchTo(e: RutinaExercise, metric: SkillGoalMetric): Pick<SkillGoal, 'metric' | 'value' | 'reps'> {
  const it = e.item;
  if (metric === 'load_kg') return { metric, ...loadGoal(it) };
  if (metric === 'time_seconds') return { metric, value: it.workSeconds ?? 30, reps: null };
  if (metric === 'distance_meters') return { metric, value: it.distanceMeters ?? 100, reps: null };
  return { metric, value: it.reps ?? 1, reps: null };
}

/** A positive number typed in Spanish or English style ("2,5" or "2.5"); null while it is not one. */
const toNumber = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** A number field that lets the admin type freely and reports only valid values. */
function NumberField({
  value,
  onChange,
  label,
  integer = false,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  integer?: boolean;
}) {
  const [text, setText] = useState(String(value).replace('.', ','));
  // Follow the value when it changes from outside (undo, another level).
  useEffect(() => {
    setText((t) => (toNumber(t) === value ? t : String(value).replace('.', ',')));
  }, [value]);
  const invalid = toNumber(text) === null || (integer && !Number.isInteger(toNumber(text)));
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = toNumber(e.target.value);
        if (n !== null && (!integer || Number.isInteger(n))) onChange(n);
      }}
      className={cn(
        'h-8 w-16 rounded-md border bg-surface px-2 text-right font-mono text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20',
        invalid ? 'border-accent' : 'border-line-2',
      )}
    />
  );
}

export function SkillGoals({
  parsed,
  goals,
  onChange,
  isLast,
}: {
  /** The whole level (all its sections), parsed. */
  parsed: ParsedRutina;
  goals: SkillGoal[];
  onChange: (goals: SkillGoal[]) => void;
  /** The last level unlocks nothing: its goal is optional, the skill's final mark. */
  isLast: boolean;
}) {
  const exercises = rutinaExercises(parsed);
  const inRutina = new Set(exercises.map((e) => e.exerciseId));
  const goalOf = new Map(goals.map((g) => [g.exerciseId, g]));
  // Goals about an exercise the rutina no longer has: shown so they can be removed (saving refuses them).
  const orphans = goals.filter((g) => !inRutina.has(g.exerciseId));

  const toggle = (e: RutinaExercise, on: boolean) =>
    onChange(
      on
        ? [...goals, { exerciseId: e.exerciseId, exerciseName: e.exerciseName, metric: e.metric, value: e.value, reps: e.reps }]
        : goals.filter((g) => g.exerciseId !== e.exerciseId),
    );
  const update = (id: string, patch: Partial<SkillGoal>) =>
    onChange(goals.map((g) => (g.exerciseId === id ? { ...g, ...patch } : g)));

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-2xl">
        <h2 className="text-[15px] font-bold text-ink">{isLast ? 'Meta final de la habilidad' : 'Para pasar al siguiente nivel'}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          {isLast
            ? 'Es el último nivel: no desbloquea otro. Si quieres, marca la meta que corona la habilidad; es opcional.'
            : 'Marca los ejercicios de la rutina de este nivel que el usuario tiene que lograr, y la marca a alcanzar. Para desbloquear el siguiente nivel tiene que cumplirlos todos en una misma sesión de esta rutina.'}
        </p>

        {exercises.length === 0 && orphans.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-line-2 bg-surface-2/40 px-5 py-8 text-center text-[13px] text-muted">
            La rutina de este nivel todavía no tiene ejercicios. Escríbelos en la pestaña <strong className="font-semibold text-ink-2">Rutina</strong> y aquí podrás elegir el objetivo.
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line-3 rounded-xl border border-line-2 bg-surface">
            {exercises.map((e) => {
              const g = goalOf.get(e.exerciseId);
              return (
                <li key={e.exerciseId} className={cn('flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2', g && 'bg-accent-tint/30')}>
                  <Checkbox checked={!!g} onChange={(on) => toggle(e, on)} label={`Objetivo: ${e.exerciseName}`} />
                  <button
                    type="button"
                    onClick={() => toggle(e, !g)}
                    className={cn('min-w-0 flex-1 truncate text-left text-[13.5px]', g ? 'font-semibold text-ink' : 'text-ink-2')}
                  >
                    {e.exerciseName}
                  </button>
                  {g && (
                    <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
                      al menos
                      <NumberField
                        label={`Marca de ${e.exerciseName}`}
                        value={g.value}
                        integer={g.metric !== 'load_kg'}
                        onChange={(value) => update(e.exerciseId, { value })}
                      />
                      {e.metrics.length > 1 || !e.metrics.includes(g.metric) ? (
                        <select
                          aria-label={`Unidad de ${e.exerciseName}`}
                          value={g.metric}
                          onChange={(ev) => update(e.exerciseId, switchTo(e, ev.target.value as SkillGoalMetric))}
                          className={cn(
                            'h-8 rounded-md border bg-surface px-2 text-[12.5px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20',
                            e.metrics.includes(g.metric) ? 'border-line-2' : 'border-accent',
                          )}
                        >
                          {/* Only the marks the rutina measures this exercise by (plus a stale one, to switch away from). */}
                          {[...e.metrics, ...(e.metrics.includes(g.metric) ? [] : [g.metric])].map((m) => (
                            <option key={m} value={m} disabled={!e.metrics.includes(m)}>
                              {METRIC_LABEL[m]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-ink-2">{METRIC_LABEL[g.metric]}</span>
                      )}
                      {g.metric === 'load_kg' && (
                        <>
                          ×
                          <NumberField
                            label={`Repeticiones con esa carga en ${e.exerciseName}`}
                            value={g.reps ?? 1}
                            integer
                            onChange={(reps) => update(e.exerciseId, { reps })}
                          />
                          rep.
                        </>
                      )}
                    </div>
                  )}
                  {g && !e.metrics.includes(g.metric) && (
                    <p className="w-full pl-8 text-[12px] font-medium text-accent-dark">
                      La rutina ya no lo mide en {METRIC_LABEL[g.metric]}: elige otra unidad.
                    </p>
                  )}
                </li>
              );
            })}
            {orphans.map((g) => (
              <li key={g.exerciseId} className="flex min-h-12 items-center gap-3 bg-accent-tint/30 px-4 py-2">
                <span className="min-w-0 flex-1 text-[13.5px]">
                  <span className="text-ink-3 line-through">{g.exerciseName}</span>
                  <span className="ml-2 text-[12px] font-medium text-accent-dark">Ya no está en la rutina de este nivel</span>
                </span>
                <button
                  type="button"
                  onClick={() => onChange(goals.filter((x) => x.exerciseId !== g.exerciseId))}
                  className="rounded-md px-2 py-1 text-[12.5px] font-semibold text-accent-dark hover:bg-accent-tint"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
