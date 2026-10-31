'use client';

// The Músculos page: the body is the way in. A click on a part picks its zone
// and the panel beside it lists that zone's muscles; opening one, or adding
// one, turns the body into the one part that muscle lights up, and its zone
// follows from that part.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BODY_PART, BODY_PART_LABEL, BODY_PART_ZONE, MUSCLE_ZONE, MUSCLE_ZONE_LABEL, type BodyPart, type Muscle, type MuscleZone } from '@dmtx/schemas';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { BodyFigure } from '@/components/body-figure';
import { MuscleEditor } from '@/components/muscle-editor';
import { useTaxonomy } from '@/components/tag-pickers';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Which zone is open: 'none' holds the muscles created without one. */
type Open = MuscleZone | 'none';
/** The muscle in the panel's form: an existing one, or null for a new one. */
type Editing = { muscle: Muscle | null };

export function MusclesPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useTaxonomy();
  const [open, setOpen] = useState<Open | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [part, setPart] = useState<BodyPart | null>(null);
  // A row being hovered shows that muscle on the body.
  const [preview, setPreview] = useState<Muscle | null>(null);

  const all = data?.muscles ?? [];
  const inZone = (z: Open) => all.filter((m) => (m.zone ?? 'none') === z);
  const q = fold(search.trim());
  const rows = q ? all.filter((m) => [m.name, ...m.aliases].some((t) => fold(t).includes(q))) : open ? inZone(open) : [];
  const zones: Open[] = [...MUSCLE_ZONE, ...(inZone('none').length ? (['none'] as const) : [])];
  const zoneLabel = (z: Open) => (z === 'none' ? 'Sin zona' : MUSCLE_ZONE_LABEL[z]);

  const startEditing = (next: Editing) => {
    setEditing(next);
    setPart(next.muscle?.bodyPart ?? null);
    setPreview(null);
  };
  const pickZone = (z: Open) => {
    setSearch('');
    setOpen(z);
  };
  const onPart = (clicked: BodyPart) => {
    if (editing) setPart(part === clicked ? null : clicked);
    else pickZone(BODY_PART_ZONE[clicked]);
  };
  const partsOf = (z: Open | null) => BODY_PART.filter((p) => BODY_PART_ZONE[p] === z);
  // A muscle shows only its part; with none open, the open zone shows whole.
  const focus = editing ? part : preview?.bodyPart;
  const shownZone: Open | null = editing ? (part ? BODY_PART_ZONE[part] : null) : !q ? open : null;
  const lit = focus ? [focus] : editing || preview ? [] : partsOf(shownZone);
  const refresh = () => qc.invalidateQueries({ queryKey: ['taxonomy'] });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader title="Músculos" subtitle={data ? `${all.length} en total` : undefined}>
        <div className="flex h-9 items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5">
          <span className="text-muted-2">⌕</span>
          <input
            value={search}
            disabled={!!editing}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o alias"
            className="h-full flex-1 bg-transparent text-sm text-ink placeholder:text-muted-2 focus:outline-none disabled:opacity-50"
          />
        </div>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4 overflow-y-auto px-8 py-5">
          <div className="flex flex-wrap gap-1.5">
            {zones.map((z) => {
              const on = (editing || !q) && shownZone === z;
              return (
                <button
                  key={z}
                  type="button"
                  disabled={!!editing}
                  aria-pressed={on}
                  onClick={() => pickZone(z)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors disabled:opacity-50',
                    on ? 'border-ink bg-ink text-surface' : 'border-line-2 bg-surface text-ink-2 hover:border-ink',
                  )}
                >
                  {zoneLabel(z)}
                  <span className={cn('font-mono text-[11px] font-normal', on ? 'text-surface/70' : 'text-muted')}>{inZone(z).length}</span>
                </button>
              );
            })}
          </div>
          <BodyFigure
            lit={lit}
            onPart={onPart}
            describe={(p) => (editing ? BODY_PART_LABEL[p] : `${BODY_PART_LABEL[p]} · ${MUSCLE_ZONE_LABEL[BODY_PART_ZONE[p]]}`)}
            hint={editing ? 'Elige la parte que trabaja este músculo: la zona se asigna sola.' : 'Haz clic en el cuerpo para ver los músculos de esa zona.'}
          />
        </div>

        <aside className="flex min-h-0 flex-col overflow-hidden border-l border-line bg-surface">
          {editing ? (
            <MuscleEditor
              key={editing.muscle?.id ?? 'new'}
              muscle={editing.muscle}
              all={all}
              bodyPart={part}
              onCancel={() => setEditing(null)}
              onSaved={async (zone) => {
                await refresh();
                setEditing(null);
                pickZone(zone);
              }}
              onDeleted={async () => {
                await refresh();
                setEditing(null);
              }}
            />
          ) : isLoading ? (
            <div className="p-8 text-center text-sm text-muted">{es.app.loading}</div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-accent-dark">{es.app.error}</div>
          ) : q || open ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-line-3 px-5 py-3.5">
                <h2 className="truncate text-[15px] font-semibold text-ink">{q ? `Resultados para «${search.trim()}»` : zoneLabel(open!)}</h2>
                <Button type="button" size="sm" onClick={() => startEditing({ muscle: null })}>
                  + Agregar
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto" onMouseLeave={() => setPreview(null)}>
                {rows.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted">{q ? 'Sin resultados.' : 'Aún no hay músculos en esta zona.'}</p>
                ) : (
                  rows.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => startEditing({ muscle: m })}
                      onMouseEnter={() => setPreview(m)}
                      onFocus={() => setPreview(m)}
                      className="flex w-full flex-col gap-0.5 border-b border-line-4 px-5 py-2.5 text-left last:border-0 hover:bg-surface-2/60"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-ink">{m.name}</span>
                        <span className="shrink-0 font-mono text-[11px] text-muted">
                          {m.exerciseCount} {m.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
                        </span>
                      </span>
                      <span className={cn('truncate text-[12px]', m.aliases.length ? 'text-ink-3' : 'text-muted-2')}>
                        {q && m.zone ? `${MUSCLE_ZONE_LABEL[m.zone]} · ` : ''}
                        {m.aliases.length ? m.aliases.join(', ') : 'Sin alias'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-ink-3">Elige una zona en el cuerpo para ver sus músculos y editar sus alias.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => startEditing({ muscle: null })}>
                + Agregar músculo
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
