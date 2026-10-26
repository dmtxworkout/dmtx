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

/** A first guess at the goal for an exercise, from how the rutina prescribes it. */
function suggestion(it: ParsedItem): Pick<SkillGoal, 'metric' | 'value' | 'reps'> {
  const load = it.loadPrescription;
  if (load && load.type === 'absolute' && load.value > 0) {
    const kg = load.unit === 'lb' ? Math.round(load.value * 0.45359237 * 10) / 10 : load.value;
    return { metric: 'load_kg', value: kg, reps: it.reps ?? 1 };
  }
  if (it.workSeconds) return { metric: 'time_seconds', value: it.workSeconds, reps: null };
  if (it.distanceMeters) return { metric: 'distance_meters', value: it.distanceMeters, reps: null };
  return { metric: 'reps', value: it.reps ?? 1, reps: null };
}

/** The exercises of the level's main section, in order, once each, with a suggested goal. */
export function rutinaExercises(parsed: ParsedRutina): SkillGoal[] {
  const out = new Map<string, SkillGoal>();
  const walk = (blocks: ParsedBlock[]) => {
    for (const b of blocks) {
      if (b.section !== 'main') continue;
      for (const it of b.items) {
        if (it.kind === 'exercise' && it.match && !out.has(it.match.id))
          out.set(it.match.id, { exerciseId: it.match.id, exerciseName: it.match.name, ...suggestion(it) });
      }
      if (b.children) walk(b.children);
    }
  };
  walk(parsed.blocks);
  return [...out.values()];
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

  const toggle = (e: SkillGoal, on: boolean) =>
    onChange(on ? [...goals, e] : goals.filter((g) => g.exerciseId !== e.exerciseId));
  const update = (id: string, patch: Partial<SkillGoal>) =>
    onChange(goals.map((g) => (g.exerciseId === id ? { ...g, ...patch } : g)));

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-2xl">
        <h2 className="text-[15px] font-bold text-ink">{isLast ? 'Meta final de la habilidad' : 'Para pasar al siguiente nivel'}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          {isLast
            ? 'Es el último nivel: no desbloquea otro. Si quieres, marca la meta que corona la habilidad; es opcional.'
            : 'Marca los ejercicios de la rutina de este nivel que el usuario tiene que lograr, y la marca a alcanzar. Para desbloquear el siguiente nivel tiene que cumplirlos todos.'}
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
                      <select
                        aria-label={`Unidad de ${e.exerciseName}`}
                        value={g.metric}
                        onChange={(ev) => {
                          const metric = ev.target.value as SkillGoalMetric;
                          update(e.exerciseId, { metric, reps: metric === 'load_kg' ? (g.reps ?? 1) : null });
                        }}
                        className="h-8 rounded-md border border-line-2 bg-surface px-2 text-[12.5px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
                      >
                        {(Object.keys(METRIC_LABEL) as SkillGoalMetric[]).map((m) => (
                          <option key={m} value={m}>
                            {METRIC_LABEL[m]}
                          </option>
                        ))}
                      </select>
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
