'use client';

// «Músculos que trabaja» in a rutina's settings. Worked out live from the
// exercises of the Rutina section (the API stores the same on save) — primary
// when at least a quarter of them work it — plus the muscles added by hand,
// which is all a rutina that is only a video has. Shown by zone, with
// «Cuerpo completo» once four zones are worked as primary.
import { useMemo } from 'react';
import { deriveMuscles, isFullBody, FULL_BODY_ZONES, parseRutina, type Catalog } from '@dmtx/core';
import { MUSCLE_ZONE, MUSCLE_ZONE_LABEL, type MuscleZone } from '@dmtx/schemas';
import { cn } from '@/lib/utils';
import { MusclePicker, useTaxonomy } from '@/components/tag-pickers';

export function WorkoutMuscles({
  mainText,
  catalog,
  exerciseMuscles,
  extra,
  onExtraChange,
}: {
  /** The Rutina section's text (the warm-up and the stretch don't count). */
  mainText: string;
  catalog: Catalog;
  exerciseMuscles: Map<string, string[]>;
  extra: string[];
  onExtraChange: (ids: string[]) => void;
}) {
  const { data: taxonomy } = useTaxonomy();
  const zoneOf = useMemo(() => new Map((taxonomy?.muscles ?? []).map((m) => [m.id, m.zone])), [taxonomy]);
  const nameOf = useMemo(() => new Map((taxonomy?.muscles ?? []).map((m) => [m.id, m.name])), [taxonomy]);

  const derived = useMemo(() => {
    const parsed = parseRutina(mainText, { catalog });
    const ids: string[] = [];
    const walk = (blocks: typeof parsed.blocks) => {
      for (const b of blocks) {
        for (const it of b.items) if (it.kind === 'exercise' && it.match) ids.push(it.match.id);
        if (b.children) walk(b.children);
      }
    };
    walk(parsed.blocks);
    return deriveMuscles(ids, (id) => exerciseMuscles.get(id) ?? []);
  }, [mainText, catalog, exerciseMuscles]);

  const all = deriveMuscles([], () => [], extra);
  const fromExercises = derived.filter((m) => !extra.includes(m.muscleId));
  const fullBody = isFullBody([...fromExercises, ...all], (id) => zoneOf.get(id) ?? null);
  const byZone = (zone: MuscleZone | null) => fromExercises.filter((m) => (zoneOf.get(m.muscleId) ?? null) === zone);
  const zones: (MuscleZone | null)[] = [...MUSCLE_ZONE, null];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold text-ink-2">Músculos que trabaja</div>
        {fullBody && (
          <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-surface">Cuerpo completo</span>
        )}
      </div>

      {!taxonomy ? (
        <div className="h-11 animate-pulse rounded-lg bg-surface-2" />
      ) : fromExercises.length ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2/50 p-3">
          {zones.map((zone) => {
            const ms = byZone(zone);
            if (!ms.length) return null;
            return (
              <div key={zone ?? 'none'} className="flex flex-wrap items-center gap-1.5">
                <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-2">
                  {zone ? MUSCLE_ZONE_LABEL[zone] : 'Sin zona'}
                </span>
                {ms.map((m) => (
                  <span
                    key={m.muscleId}
                    title={m.role === 'primary' ? 'Principal' : 'Secundario: lo trabajan pocos ejercicios'}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[12px]',
                      m.role === 'primary' ? 'border-ink/20 bg-surface font-semibold text-ink' : 'border-dashed border-line-2 text-ink-3',
                    )}
                  >
                    {nameOf.get(m.muscleId) ?? '…'}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-line-2 px-3 py-2.5 text-[12px] leading-5 text-ink-3">
          La sección Rutina no tiene ejercicios de los que sacar los músculos. Si es un video, agrégalos aquí abajo.
        </p>
      )}

      <MusclePicker value={extra} onChange={onExtraChange} />
      <p className="text-[11px] leading-4 text-ink-3">
        Se calculan solos de los ejercicios de la sección Rutina: en negrita los principales (los trabaja al menos 1 de cada 4
        ejercicios). Agrega a mano los que no salen de los ejercicios, como los de un video. Con {FULL_BODY_ZONES} zonas o más
        es de cuerpo completo.
      </p>
    </div>
  );
}
