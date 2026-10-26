'use client';

// The Músculos and Equipo pages: a list of tags in a table with search, an add
// row, inline rename, and bulk select → delete. Deleting a tag simply takes it
// off the exercises that carried it. Muscles are grouped by body zone (the app
// browses by zone): every zone shows, empty or not, and a muscle is dragged by
// its handle to another zone or place (the order is the app's chip order), or
// moved in bulk with «Mover a…»; a zone's «+» adds a muscle straight into it.
import { Fragment, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArrangeMusclesInput, Taxonomy } from '@dmtx/schemas';
import { MUSCLE_ZONE, MUSCLE_ZONE_LABEL, type MuscleZone } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

type Row = { id: string; name: string; exerciseCount: number; position: number; zone?: MuscleZone | null };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Kind {
  /** "músculo" — used in copy. */
  singular: string;
  plural: string;
  title: string;
  empty: string;
  rows: (t: Taxonomy) => Row[];
  create: (name: string, zone: MuscleZone | null) => Promise<unknown>;
  rename: (id: string, name: string) => Promise<unknown>;
  /** Muscles: grouped by zone; dragging saves each moved row's zone and position. */
  arrange?: (items: ArrangeMusclesInput['items']) => Promise<unknown>;
  /** Applies an arrangement to the cached taxonomy, so a drop shows at once. */
  patch?: (t: Taxonomy, items: ArrangeMusclesInput['items']) => Taxonomy;
  remove: (id: string) => Promise<unknown>;
}

export const MUSCLES: Kind = {
  singular: 'músculo',
  plural: 'músculos',
  title: 'Músculos',
  empty: 'Aún no hay músculos. Empieza por Bíceps, Pectoral, Cuádriceps…',
  rows: (t) => t.muscles,
  create: (name, zone) => api.taxonomy.createMuscle({ name, zone }),
  rename: (id, name) => api.taxonomy.updateMuscle(id, { name }),
  arrange: (items) => api.taxonomy.arrangeMuscles({ items }),
  patch: (t, items) => {
    const by = new Map(items.map((i) => [i.id, i]));
    const muscles = t.muscles.map((m) => (by.has(m.id) ? { ...m, zone: by.get(m.id)!.zone, position: by.get(m.id)!.position } : m));
    return { ...t, muscles: muscles.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)) };
  },
  remove: (id) => api.taxonomy.removeMuscle(id),
};

export const EQUIPMENT: Kind = {
  singular: 'equipo',
  plural: 'equipos',
  title: 'Equipos',
  empty: 'Aún no hay equipo. Empieza por Peso corporal, Mancuernas, Barra…',
  rows: (t) => t.equipment,
  create: (name) => api.taxonomy.createEquipment({ name }),
  rename: (id, name) => api.taxonomy.updateEquipment(id, { name }),
  remove: (id) => api.taxonomy.removeEquipment(id),
};

const COLS_PLAIN = 'grid-cols-[36px_minmax(0,1fr)_140px] gap-3.5 px-[18px]';
// Muscles lead with the drag handle.
const COLS_ZONED = 'grid-cols-[16px_28px_minmax(0,1fr)_120px] gap-2.5 px-[14px]';
const ZONES: (MuscleZone | null)[] = [...MUSCLE_ZONE, null];
const zoneName = (z: MuscleZone | null) => (z ? MUSCLE_ZONE_LABEL[z] : 'Sin zona');

/** Where a dragged muscle would land: before the row at `index` of `zone` (its length = at the end). */
type Drop = { zone: MuscleZone | null; index: number };

export function TagTable({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => api.taxonomy.get(),
  });
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  // Names being created right now: shown as ghost rows until the list refetches.
  const [adding, setAdding] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const zoned = !!kind.arrange;
  const COLS = zoned ? COLS_ZONED : COLS_PLAIN;
  // A zone's own add row, opened from its «+».
  const [addIn, setAddIn] = useState<{ zone: MuscleZone | null; name: string } | null>(null);
  // Dragging: the muscle held, and where it would drop.
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const dropRef = useRef<Drop | null>(null);
  dropRef.current = drop;
  const refresh = () => qc.invalidateQueries({ queryKey: ['taxonomy'] });
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : es.app.error, 'error');

  const all = useMemo(() => (data ? kind.rows(data) : []), [data, kind]);
  const q = fold(search.trim());
  const rows = q ? all.filter((r) => fold(r.name).includes(q)) : all;
  const pageIds = rows.map((r) => r.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const chosen = all.filter((r) => selected.has(r.id));
  const affected = chosen.reduce((n, r) => n + r.exerciseCount, 0);
  const inZone = (list: Row[], zone: MuscleZone | null) => list.filter((r) => (r.zone ?? null) === zone);

  /**
   * Put `ids` into `zone` before its row at `index` (rows not moving), renumber
   * every muscle in zone order and save those whose zone or place changed.
   */
  const arrange = async (ids: string[], zone: MuscleZone | null, index: number) => {
    if (!kind.arrange || !data) return;
    const moving = ids.map((id) => all.find((r) => r.id === id)).filter((r): r is Row => !!r);
    const order = ZONES.flatMap((z) => {
      const stay = inZone(all, z).filter((r) => !ids.includes(r.id));
      return z === zone ? [...stay.slice(0, index), ...moving.map((r) => ({ ...r, zone })), ...stay.slice(index)] : stay;
    });
    const items = order
      .map((r, i) => ({ id: r.id, zone: r.zone ?? null, position: i + 1 }))
      .filter((it) => {
        const was = all.find((r) => r.id === it.id)!;
        return (was.zone ?? null) !== it.zone || was.position !== it.position;
      });
    if (!items.length) return;
    qc.setQueryData<Taxonomy>(['taxonomy'], (t) => (t && kind.patch ? kind.patch(t, items) : t));
    try {
      await kind.arrange(items);
    } catch (e) {
      fail(e);
    } finally {
      await refresh();
    }
  };

  // --- Drag and drop (native): the handle starts it, rows and zones take it.
  const overRow = (e: DragEvent, zone: MuscleZone | null, index: number) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    const box = e.currentTarget.getBoundingClientRect();
    const at = e.clientY > box.top + box.height / 2 ? index + 1 : index;
    if (dropRef.current?.zone !== zone || dropRef.current.index !== at) setDrop({ zone, index: at });
  };
  const overZone = (e: DragEvent, zone: MuscleZone | null, length: number) => {
    if (!dragId) return;
    e.preventDefault();
    if (dropRef.current?.zone !== zone) setDrop({ zone, index: length });
  };
  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const id = dragId;
    const at = dropRef.current;
    endDrag();
    if (id && at) void arrange([id], at.zone, at.index);
  };

  const add = async () => {
    const name = draft.trim();
    if (!name) return;
    setDraft('');
    setAdding((xs) => [...xs, name]);
    try {
      await kind.create(name, null);
      await refresh();
    } catch (e) {
      setDraft(name);
      fail(e);
    } finally {
      setAdding((xs) => xs.filter((x) => x !== name));
    }
  };
  const submitRename = async () => {
    if (!editing) return;
    const { id, name } = editing;
    setEditing(null);
    const row = all.find((r) => r.id === id);
    if (!row || !name.trim() || name.trim() === row.name) return;
    try {
      await kind.rename(id, name.trim());
      await refresh();
    } catch (e) {
      fail(e);
    }
  };
  const addToZone = async () => {
    if (!addIn) return;
    const { zone, name } = addIn;
    if (!name.trim()) {
      setAddIn(null);
      return;
    }
    setAddIn({ zone, name: '' });
    try {
      await kind.create(name.trim(), zone);
      await refresh();
    } catch (e) {
      setAddIn({ zone, name });
      fail(e);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>, fn: () => void, cancel?: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fn();
    } else if (e.key === 'Escape' && cancel) cancel();
  };
  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await kind.remove(id);
      return ids.length;
    },
    onSuccess: (n) => {
      setSelected(new Set());
      setConfirm(false);
      refresh();
      qc.invalidateQueries({ queryKey: ['exercises'] });
      toast(n === 1 ? `1 ${kind.singular} eliminado` : `${n} ${kind.plural} eliminados`);
    },
    onError: (e) => {
      setConfirm(false);
      refresh();
      fail(e);
    },
  });

  const select = (id: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });

  const renderRow = (r: Row, zone?: MuscleZone | null, index = 0) => {
    const on = selected.has(r.id);
    // Dragging is off while searching: the list shown is not the whole zone.
    const draggable = zoned && !q;
    return (
      <div
        key={r.id}
        onDragOver={zone !== undefined ? (e) => overRow(e, zone, index) : undefined}
        onDrop={zone !== undefined ? onDrop : undefined}
        className={cn(
          `group/row grid ${COLS} items-center border-b border-line-4 py-2.5 last:border-0`,
          on ? 'bg-accent-tint/40' : 'hover:bg-surface-2/60',
          dragId === r.id && 'opacity-40',
        )}
      >
        {zoned && (
          <span
            draggable={draggable}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', r.name);
              // The whole row as the drag image, not just the handle.
              const row = e.currentTarget.parentElement;
              if (row) e.dataTransfer.setDragImage(row, 12, row.offsetHeight / 2);
              setDragId(r.id);
            }}
            onDragEnd={endDrag}
            title={draggable ? 'Arrastra para moverlo a otra zona o cambiar su orden' : undefined}
            aria-hidden
            className={cn(
              'flex h-6 w-4 select-none items-center justify-center rounded text-[13px] leading-none text-muted-2',
              draggable ? 'cursor-grab hover:bg-surface-3 hover:text-ink-2 active:cursor-grabbing' : 'invisible',
            )}
          >
            ⋮⋮
          </span>
        )}
        <Checkbox checked={on} onChange={(v) => select(r.id, v)} label={`Seleccionar ${r.name}`} />
        {editing?.id === r.id ? (
          <input
            autoFocus
            value={editing.name}
            onChange={(e) => setEditing({ id: r.id, name: e.target.value })}
            onBlur={() => void submitRename()}
            onKeyDown={(e) =>
              onKey(
                e,
                () => void submitRename(),
                () => setEditing(null),
              )
            }
            className="h-[30px] min-w-0 rounded-[7px] border border-accent bg-surface px-2 text-sm text-ink focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing({ id: r.id, name: r.name })}
            title="Clic para renombrar"
            className="min-w-0 truncate text-left text-sm font-semibold text-ink"
          >
            {r.name}
          </button>
        )}
        <span className="text-right font-mono text-[12px] text-muted">
          {r.exerciseCount} {r.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
        </span>
      </div>
    );
  };

  /** The line showing where a dragged muscle lands. */
  const dropLine = <div className="relative z-[1] -my-px h-0.5 bg-accent" aria-hidden />;

  const renderZone = (zone: MuscleZone | null) => {
    const group = inZone(rows, zone);
    // Searching: only the zones with a match.
    if (q && !group.length) return null;
    const target = drop?.zone === zone;
    return (
      <div
        key={zone ?? 'none'}
        onDragOver={(e) => overZone(e, zone, group.length)}
        onDrop={onDrop}
        className={cn('transition-colors', target && 'bg-accent-tint/25')}
      >
        <div className="group/zone flex items-center gap-2 border-b border-line-4 bg-surface-2/50 px-[14px] py-2">
          <span className={cn('text-[12.5px] font-bold', zone ? 'text-ink' : 'text-ink-3')}>{zoneName(zone)}</span>
          <span className="font-mono text-[11px] text-muted">
            {zone ? `${group.length} ${group.length === 1 ? 'músculo' : 'músculos'}` : 'no salen al buscar por zona en la app'}
          </span>
          <button
            type="button"
            onClick={() => setAddIn({ zone, name: '' })}
            aria-label={`Agregar un músculo a ${zoneName(zone)}`}
            title={`Agregar un músculo a ${zoneName(zone)}`}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-[15px] leading-none text-ink-3 opacity-0 transition-opacity hover:bg-surface-3 hover:text-ink focus-visible:opacity-100 group-hover/zone:opacity-100"
          >
            +
          </button>
        </div>
        {group.map((r, i) => (
          <Fragment key={r.id}>
            {target && drop.index === i && dropLine}
            {renderRow(r, zone, i)}
          </Fragment>
        ))}
        {target && drop.index === group.length && group.length > 0 && dropLine}
        {addIn?.zone === zone && (
          <div className={`grid ${COLS} items-center border-b border-line-4 py-2`}>
            <span />
            <input
              autoFocus
              value={addIn.name}
              onChange={(e) => setAddIn({ zone, name: e.target.value })}
              onKeyDown={(e) => onKey(e, () => void addToZone(), () => setAddIn(null))}
              onBlur={() => !addIn.name.trim() && setAddIn(null)}
              placeholder={`+ Músculo en ${zoneName(zone)} (Enter para agregar)`}
              aria-label={`Nuevo músculo en ${zoneName(zone)}`}
              className="col-span-2 h-[30px] min-w-0 rounded-[7px] border border-dashed border-accent/60 bg-surface px-2.5 text-[13px] text-ink placeholder:text-muted-2 focus:outline-none"
            />
            <span />
          </div>
        )}
        {!group.length && addIn?.zone !== zone && (
          <div
            className={cn(
              'border-b border-line-4 px-[14px] py-3 text-center text-[12px]',
              target ? 'font-medium text-accent-dark' : 'text-muted-2',
            )}
          >
            {dragId ? 'Suelta aquí' : 'Arrastra músculos aquí'}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader title={kind.title}>
        <div className="flex h-9 w-[300px] items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5">
          <span className="text-muted-2">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar"
            className="h-full flex-1 bg-transparent text-sm text-ink placeholder:text-muted-2 focus:outline-none"
          />
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-5">
        <div className="relative overflow-hidden rounded-xl border border-line bg-surface">
          {/* The bulk bar covers the header row instead of pushing the list down. */}
          {selected.size > 0 ? (
            <div className={`absolute inset-x-0 top-0 z-10 grid h-[42px] ${COLS} items-center border-b border-line-3 bg-surface-2`}>
              {zoned && <span />}
              <Checkbox checked={allSelected} indeterminate={!allSelected} onChange={() => setSelected(new Set())} label="Quitar la selección" />
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold text-ink">
                  {selected.size} {selected.size === 1 ? 'seleccionado' : 'seleccionados'}
                </span>
                <button type="button" onClick={() => setSelected(new Set())} className="text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                  Quitar selección
                </button>
              </div>
              <div className="flex justify-end gap-2">
                {zoned && (
                  <select
                    aria-label="Mover a otra zona"
                    value=""
                    onChange={(e) => {
                      const zone = (e.target.value === 'none' ? null : e.target.value) as MuscleZone | null;
                      const ids = [...selected];
                      setSelected(new Set());
                      void arrange(ids, zone, inZone(all, zone).filter((r) => !ids.includes(r.id)).length);
                    }}
                    className="h-8 rounded-md border border-line-2 bg-surface px-2 text-[12.5px] font-medium text-ink focus:outline-none"
                  >
                    <option value="" disabled>
                      Mover a…
                    </option>
                    {ZONES.map((z) => (
                      <option key={z ?? 'none'} value={z ?? 'none'}>
                        {zoneName(z)}
                      </option>
                    ))}
                  </select>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirm(true)} disabled={remove.isPending}>
                  {es.app.delete}
                </Button>
              </div>
            </div>
          ) : null}
          <div className={`grid ${COLS} h-[42px] items-center border-b border-line-3 bg-surface-2`}>
            {zoned && <span />}
            <Checkbox
              checked={allSelected}
              onChange={(on) => setSelected(on ? new Set(pageIds) : new Set())}
              label={allSelected ? 'Quitar la selección' : 'Seleccionar todo'}
            />
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2">Nombre</span>
            <span className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2">Ejercicios</span>
          </div>

          {/* The add row opens the list: type a name, Enter, and keep typing the next one. */}
          <div className={`grid ${COLS} items-center border-b border-line-4 py-2`}>
            {zoned && <span />}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => onKey(e, () => void add())}
              placeholder={
                zoned
                  ? '+ Músculo (Enter para agregar; entra en «Sin zona», o usa el + de una zona)'
                  : `+ ${kind.singular === 'equipo' ? 'Equipo' : 'Músculo'} (Enter para agregar)`
              }
              aria-label={kind.singular === 'equipo' ? 'Nuevo equipo' : 'Nuevo músculo'}
              className="col-span-2 h-[30px] min-w-0 rounded-[7px] border border-dashed border-line-2 bg-surface-3 px-2.5 text-[13px] text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none"
            />
            <span />
          </div>
          {adding.map((name, i) => (
            <div key={`adding-${i}`} className={`grid ${COLS} items-center border-b border-line-4 py-2.5 opacity-70`} aria-busy="true">
              {zoned && <span />}
              <span className="ml-0.5 block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-2 border-t-ink" aria-hidden />
              <span className="truncate text-sm font-semibold text-ink">{name}</span>
              <span className="text-right font-mono text-[12px] text-muted">Agregando…</span>
            </div>
          ))}

          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted">{es.app.loading}</div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-accent-dark">{es.app.error}</div>
          ) : zoned ? (
            q && !rows.length ? (
              <div className="p-10 text-center text-sm text-muted">Sin resultados.</div>
            ) : (
              ZONES.map(renderZone)
            )
          ) : rows.length === 0 && adding.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted">{q ? 'Sin resultados.' : kind.empty}</div>
          ) : (
            rows.map((r) => renderRow(r))
          )}
        </div>
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Eliminar"
        className="max-w-sm"
      >
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[14px] leading-relaxed text-ink-2">
            ¿Eliminar{' '}
            {chosen.length === 1 ? (
              <strong className="font-semibold text-ink">{chosen[0]?.name}</strong>
            ) : (
              `estos ${chosen.length} ${kind.plural}`
            )}
            ?{' '}
            {affected > 0
              ? `Se quitará de los ejercicios que lo ${chosen.length === 1 ? 'usan' : 'usan'} (${affected} ${affected === 1 ? 'etiqueta' : 'etiquetas'} en total). Los ejercicios siguen igual, solo sin esta etiqueta.`
              : 'Ningún ejercicio lo usa.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
              {es.app.cancel}
            </Button>
            <Button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate([...selected])}
            >
              {remove.isPending ? es.app.saving : es.app.delete}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
