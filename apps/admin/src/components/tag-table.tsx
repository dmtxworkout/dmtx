'use client';

// The Músculos and Equipo pages: a list of tags in a table with search, an add
// row, inline rename, and bulk select → delete. Deleting a tag simply takes it
// off the exercises that carried it. Muscles are grouped by body zone (the app
// browses by zone), each row with its zone to change.
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { MUSCLE_ZONE, MUSCLE_ZONE_LABEL, type MuscleZone } from '@dmtx/schemas';

type Row = { id: string; name: string; exerciseCount: number; zone?: MuscleZone | null };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Kind {
  /** "músculo" — used in copy. */
  singular: string;
  plural: string;
  title: string;
  empty: string;
  rows: (t: Awaited<ReturnType<typeof api.taxonomy.get>>) => Row[];
  create: (name: string, zone: MuscleZone | null) => Promise<unknown>;
  rename: (id: string, name: string) => Promise<unknown>;
  /** Muscles: the rows are grouped by zone and each one can move to another. */
  setZone?: (id: string, zone: MuscleZone | null) => Promise<unknown>;
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
  setZone: (id, zone) => api.taxonomy.updateMuscle(id, { zone }),
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
const COLS_ZONED = 'grid-cols-[36px_minmax(0,1fr)_150px_120px] gap-3.5 px-[18px]';
const zoneSelect =
  'h-[30px] rounded-[7px] border border-line-2 bg-surface px-2 text-[12.5px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20';

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
  const zoned = !!kind.setZone;
  const COLS = zoned ? COLS_ZONED : COLS_PLAIN;
  // The zone a new muscle goes into.
  const [draftZone, setDraftZone] = useState<MuscleZone | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['taxonomy'] });
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : es.app.error, 'error');

  const all = useMemo(() => (data ? kind.rows(data) : []), [data, kind]);
  const q = fold(search.trim());
  const rows = q ? all.filter((r) => fold(r.name).includes(q)) : all;
  const pageIds = rows.map((r) => r.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const chosen = all.filter((r) => selected.has(r.id));
  const affected = chosen.reduce((n, r) => n + r.exerciseCount, 0);

  const add = async () => {
    const name = draft.trim();
    if (!name) return;
    setDraft('');
    setAdding((xs) => [...xs, name]);
    try {
      await kind.create(name, draftZone);
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
  const moveTo = async (id: string, zone: MuscleZone | null) => {
    try {
      await kind.setZone?.(id, zone);
      await refresh();
    } catch (e) {
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

  const renderRow = (r: Row) => {
    const on = selected.has(r.id);
    return (
      <div
        key={r.id}

        className={cn(
          `grid ${COLS} items-center border-b border-line-4 py-2.5 last:border-0`,
          on ? 'bg-accent-tint/40' : 'hover:bg-surface-2/60',
        )}
      >
        <Checkbox
          checked={on}
          onChange={(v) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (v) next.add(r.id);
              else next.delete(r.id);
              return next;
            })
          }
          label={`Seleccionar ${r.name}`}
        />
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
        {zoned && (
          <select
            aria-label={`Zona de ${r.name}`}
            value={r.zone ?? ''}
            onChange={(e) => void moveTo(r.id, (e.target.value || null) as MuscleZone | null)}
            className={zoneSelect}
          >
            <option value="">Sin zona</option>
            {MUSCLE_ZONE.map((z) => (
              <option key={z} value={z}>
                {MUSCLE_ZONE_LABEL[z]}
              </option>
            ))}
          </select>
        )}
        <span className="text-right font-mono text-[12px] text-muted">
          {r.exerciseCount} {r.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
        </span>
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
            <div
              className={`absolute inset-x-0 top-0 z-10 grid h-[42px] ${COLS} items-center border-b border-line-3 bg-surface-2`}
            >
              <Checkbox
                checked={allSelected}
                indeterminate={!allSelected}
                onChange={() => setSelected(new Set())}
                label="Quitar la selección"
              />
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold text-ink">
                  {selected.size} {selected.size === 1 ? 'seleccionado' : 'seleccionados'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-[12px] text-muted underline underline-offset-2 hover:text-ink"
                >
                  Quitar selección
                </button>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirm(true)}
                  disabled={remove.isPending}
                >
                  {es.app.delete}
                </Button>
              </div>
            </div>
          ) : null}
          <div className={`grid ${COLS} h-[42px] items-center border-b border-line-3 bg-surface-2`}>
            <Checkbox
              checked={allSelected}
              onChange={(on) => setSelected(on ? new Set(pageIds) : new Set())}
              label={allSelected ? 'Quitar la selección' : 'Seleccionar todo'}
            />
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2">
              Nombre
            </span>
            {zoned && (
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2">
                Zona
              </span>
            )}
            <span className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2">
              Ejercicios
            </span>
          </div>

          {/* The add row opens the list: type a name, Enter, and keep typing the next one. */}
          <div className={`grid ${COLS} items-center border-b border-line-4 py-2`}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => onKey(e, () => void add())}
              placeholder={`+ ${kind.singular === 'equipo' ? 'Equipo' : 'Músculo'} (Enter para agregar)`}
              aria-label={kind.singular === 'equipo' ? 'Nuevo equipo' : 'Nuevo músculo'}
              className="col-span-2 h-[30px] min-w-0 rounded-[7px] border border-dashed border-line-2 bg-surface-3 px-2.5 text-[13px] text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none"
            />
            {zoned && (
              <select
                aria-label="Zona del nuevo músculo"
                value={draftZone ?? ''}
                onChange={(e) => setDraftZone((e.target.value || null) as MuscleZone | null)}
                className={zoneSelect}
              >
                <option value="">Sin zona</option>
                {MUSCLE_ZONE.map((z) => (
                  <option key={z} value={z}>
                    {MUSCLE_ZONE_LABEL[z]}
                  </option>
                ))}
              </select>
            )}
            <span />
          </div>
          {adding.map((name, i) => (
            <div
              key={`adding-${i}`}
              className={`grid ${COLS} items-center border-b border-line-4 py-2.5 opacity-70`}
              aria-busy="true"
            >
              <span
                className="ml-0.5 block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-2 border-t-ink"
                aria-hidden
              />
              <span className="truncate text-sm font-semibold text-ink">{name}</span>
              {zoned && <span />}
              <span className="text-right font-mono text-[12px] text-muted">Agregando…</span>
            </div>
          ))}

          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted">{es.app.loading}</div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-accent-dark">{es.app.error}</div>
          ) : rows.length === 0 && adding.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted">
              {q ? 'Sin resultados.' : kind.empty}
            </div>
          ) : (
            (zoned ? [...MUSCLE_ZONE, null] : [undefined]).map((zone) => {
              const group =
                zone === undefined ? rows : rows.filter((r) => (r.zone ?? null) === zone);
              if (!group.length) return null;
              return (
                <div key={zone ?? 'none'}>
                  {zone !== undefined && (
                    <div className="flex items-baseline gap-2 border-b border-line-4 bg-surface-2/50 px-[18px] py-2">
                      <span className="text-[12.5px] font-bold text-ink">
                        {zone ? MUSCLE_ZONE_LABEL[zone] : 'Sin zona'}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        {zone
                          ? `${group.length} ${group.length === 1 ? 'músculo' : 'músculos'}`
                          : 'no salen al buscar por zona en la app'}
                      </span>
                    </div>
                  )}
                  {group.map((r) => renderRow(r))}
                </div>
              );
            })
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
