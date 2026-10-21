'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BulkExerciseInput, ExerciseMuscleInput } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn, formatDateEs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Thumb } from '@/components/ui/thumb';
import { ActionsMenu } from '@/components/ui/actions-menu';
import { toast } from '@/components/ui/toast';
import { MediaThumb } from '@/components/media-thumb';
import { EquipmentPicker, MusclePicker, useTaxonomy } from '@/components/tag-pickers';

const COLS = 'grid-cols-[36px_74px_minmax(0,1.6fr)_minmax(0,1.4fr)_120px_104px_150px] gap-3.5 px-[18px]';

type Archived = 'false' | 'true' | 'all';
/** A bulk dialog: which tags to add or remove, or the delete confirmation. */
type Bulk = 'add_muscles' | 'add_equipment' | 'remove_muscles' | 'remove_equipment' | 'delete';

export default function ExercisesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState<Archived>('false');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<Bulk | null>(null);
  const [muscles, setMuscles] = useState<ExerciseMuscleInput[]>([]);
  const [equipmentIds, setEquipmentIds] = useState<string[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exercises', 'list', search, archived],
    queryFn: () => api.exercises.list({ search: search || undefined, pageSize: 50, archived }),
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => data?.data ?? [], [data]);
  const { data: taxonomy } = useTaxonomy();
  const muscleName = (id: string) => taxonomy?.muscles.find((m) => m.id === id)?.name ?? '';

  const pageIds = rows.map((r) => r.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const chosen = rows.filter((r) => selected.has(r.id));
  const clear = () => setSelected(new Set());

  // Tags the selected exercises carry, for the "Quitar…" dialogs.
  const removable = useMemo(() => {
    const ms = new Set(chosen.flatMap((e) => e.muscles.map((m) => m.muscleId)));
    const eqs = new Set(chosen.flatMap((e) => e.equipmentIds));
    return {
      muscles: (taxonomy?.muscles ?? []).filter((m) => ms.has(m.id)),
      equipment: (taxonomy?.equipment ?? []).filter((e) => eqs.has(e.id)),
    };
  }, [chosen, taxonomy]);

  const openBulk = (b: Bulk) => {
    setMuscles([]);
    setEquipmentIds([]);
    setTicked(new Set());
    setBulk(b);
  };
  const run = useMutation({
    mutationFn: (input: Omit<BulkExerciseInput, 'ids'>) => api.exercises.bulk({ ids: [...selected], ...input } as BulkExerciseInput),
    onSuccess: (res, input) => {
      setBulk(null);
      qc.invalidateQueries({ queryKey: ['exercises'] });
      qc.invalidateQueries({ queryKey: ['taxonomy'] });
      const n = res.done;
      const verb: Record<BulkExerciseInput['action'], string> = {
        archive: 'archivado',
        restore: 'restaurado',
        delete: 'eliminado',
        add_muscles: 'actualizado',
        remove_muscles: 'actualizado',
        add_equipment: 'actualizado',
        remove_equipment: 'actualizado',
      };
      if (n > 0) toast(`${n} ejercicio${n === 1 ? '' : 's'} ${verb[input.action]}${n === 1 ? '' : 's'}`);
      if (res.refused.length) {
        toast(`Sin eliminar: ${res.refused.map((r) => `${r.name} (${r.reason})`).join('; ')}. Archívalos en su lugar.`, 'error');
      }
      if (input.action === 'delete' || input.action === 'archive' || input.action === 'restore') {
        // Keep only what stayed on this list.
        setSelected(new Set(res.refused.map((r) => r.id)));
      }
    },
    onError: (e) => toast(e instanceof Error ? e.message : es.app.error, 'error'),
  });

  const tick = (id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={es.exercises.title}
        subtitle={data ? es.exercises.count(data.total) : es.exercises.title}
        actions={
          <>
            <Button variant="outline">Exportar</Button>
            <Link href="/ejercicios/nuevo">
              <Button>{es.exercises.new}</Button>
            </Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex h-9 w-[300px] items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5">
            <span className="text-muted-2">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o alias"
              className="h-full flex-1 bg-transparent text-sm text-ink placeholder:text-muted-2 focus:outline-none"
            />
          </div>
          <Select
            value={archived}
            onChange={(e) => {
              setArchived(e.target.value as Archived);
              clear();
            }}
            className="w-[150px]"
            aria-label="Estado"
          >
            <option value="false">Activos</option>
            <option value="true">Archivados</option>
            <option value="all">Todos</option>
          </Select>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-5">
        <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
          {/* The bulk bar covers the header row instead of pushing the list down. */}
          {selected.size > 0 && (
            <div className={`absolute inset-x-0 top-0 z-10 grid min-w-[1060px] h-[42px] ${COLS} items-center border-b border-line-3 bg-surface-2`}>
              <Checkbox checked={allSelected} indeterminate={!allSelected} onChange={clear} label="Quitar la selección" />
              <div className="col-span-6 flex items-center gap-2">
                <span className="text-[13px] font-semibold text-ink">
                  {selected.size} {selected.size === 1 ? 'seleccionado' : 'seleccionados'}
                </span>
                <button type="button" onClick={clear} className="mr-2 text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                  Quitar selección
                </button>
                <Button type="button" variant="outline" size="sm" onClick={() => openBulk('add_muscles')} disabled={run.isPending}>
                  Agregar músculos
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => openBulk('add_equipment')} disabled={run.isPending}>
                  Agregar equipo
                </Button>
                {archived !== 'true' && (
                  <Button type="button" variant="outline" size="sm" onClick={() => run.mutate({ action: 'archive', muscles: [], muscleIds: [], equipmentIds: [] })} disabled={run.isPending}>
                    Archivar
                  </Button>
                )}
                {archived !== 'false' && (
                  <Button type="button" variant="outline" size="sm" onClick={() => run.mutate({ action: 'restore', muscles: [], muscleIds: [], equipmentIds: [] })} disabled={run.isPending}>
                    Restaurar
                  </Button>
                )}
                <ActionsMenu
                  label="···"
                  chevron={false}
                  align="left"
                  size="sm"
                  ariaLabel="Más acciones"
                  items={[
                    { label: 'Quitar músculos', onSelect: () => openBulk('remove_muscles'), disabled: removable.muscles.length === 0 },
                    { label: 'Quitar equipo', onSelect: () => openBulk('remove_equipment'), disabled: removable.equipment.length === 0 },
                    { label: 'Eliminar', onSelect: () => openBulk('delete'), danger: true },
                  ]}
                />
              </div>
            </div>
          )}
          <div className={`grid min-w-[1060px] ${COLS} h-[42px] items-center border-b border-line-3 bg-surface-2`}>
            <Checkbox
              checked={allSelected}
              onChange={(on) => setSelected(on ? new Set(pageIds) : new Set())}
              label={allSelected ? 'Quitar la selección' : 'Seleccionar todo'}
            />
            {['', 'Nombre', 'Músculos', 'Dificultad', '', 'Actualizado'].map((h, i) => (
              <span
                key={i}
                className={`font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2 ${i === 5 ? 'text-right' : ''}`}
              >
                {h}
              </span>
            ))}
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted">{es.app.loading}</div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-accent-dark">{es.app.error}</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted">{es.exercises.empty}</div>
          ) : (
            rows.map((e) => {
              const on = selected.has(e.id);
              return (
                <div
                  key={e.id}
                  onClick={() => router.push(`/ejercicios/${e.id}`)}
                  className={cn(
                    `grid min-w-[1060px] cursor-pointer ${COLS} items-center border-b border-line-4 py-2.5 last:border-0`,
                    on ? 'bg-accent-tint/40' : 'hover:bg-surface-2/60',
                  )}
                >
                  <Checkbox
                    checked={on}
                    onChange={(v) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(e.id);
                        else next.delete(e.id);
                        return next;
                      })
                    }
                    label={`Seleccionar ${e.name}`}
                  />
                  {e.thumbnailAssetId ? (
                    <MediaThumb assetId={e.thumbnailAssetId} className="h-[46px] w-[74px] rounded-[7px]" />
                  ) : (
                    <Thumb className="h-[46px] w-[74px] rounded-[7px]" ratio="auto" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{e.name}</div>
                    {e.description && <div className="truncate font-mono text-[11px] text-muted">{e.description}</div>}
                  </div>
                  <div className="min-w-0 truncate text-[13px] text-ink-2">
                    {e.muscles
                      .filter((m) => m.role === 'primary')
                      .map((m) => muscleName(m.muscleId))
                      .filter(Boolean)
                      .join(', ') || <span className="text-faint-2">—</span>}
                  </div>
                  <span className="text-[13px] text-ink-2">{es.difficulty[e.difficulty]}</span>
                  <span>{e.archivedAt && <Badge tone="archived">Archivado</Badge>}</span>
                  <span className="text-right font-mono text-[12px] text-muted">{formatDateEs(e.updatedAt)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add tags: the same pickers as the exercise form, applied to every selected exercise. */}
      <Dialog
        open={bulk === 'add_muscles' || bulk === 'add_equipment'}
        onClose={() => setBulk(null)}
        title={bulk === 'add_muscles' ? 'Agregar músculos' : 'Agregar equipo'}
        className="max-w-md"
      >
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[13px] text-ink-2">
            A {selected.size === 1 ? '1 ejercicio' : `${selected.size} ejercicios`}. Lo que ya tengan se mantiene.
            {bulk === 'add_muscles' && ' Un músculo marcado como principal pasa a ser el principal de todos.'}
          </p>
          {bulk === 'add_muscles' ? <MusclePicker value={muscles} onChange={setMuscles} /> : <EquipmentPicker value={equipmentIds} onChange={setEquipmentIds} />}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setBulk(null)}>
              {es.app.cancel}
            </Button>
            <Button
              type="button"
              disabled={run.isPending || (bulk === 'add_muscles' ? muscles.length === 0 : equipmentIds.length === 0)}
              onClick={() =>
                run.mutate(
                  bulk === 'add_muscles'
                    ? { action: 'add_muscles', muscles, muscleIds: [], equipmentIds: [] }
                    : { action: 'add_equipment', muscles: [], muscleIds: [], equipmentIds },
                )
              }
            >
              {run.isPending ? es.app.saving : 'Agregar'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Remove tags: tick which of the tags the selection carries to take off. */}
      <Dialog
        open={bulk === 'remove_muscles' || bulk === 'remove_equipment'}
        onClose={() => setBulk(null)}
        title={bulk === 'remove_muscles' ? 'Quitar músculos' : 'Quitar equipo'}
        className="max-w-md"
      >
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[13px] text-ink-2">
            Se quitará de {selected.size === 1 ? '1 ejercicio' : `los ${selected.size} ejercicios seleccionados`} que lo tengan.
          </p>
          <div className="flex flex-col gap-1">
            {/* Rows are not <label>s: a label would forward the click to the button and toggle twice. */}
            {(bulk === 'remove_muscles' ? removable.muscles : removable.equipment).map((t) => (
              <div
                key={t.id}
                onClick={() => tick(t.id, !ticked.has(t.id))}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-ink hover:bg-surface-2"
              >
                <Checkbox checked={ticked.has(t.id)} onChange={(on) => tick(t.id, on)} label={t.name} />
                <span className="font-medium">{t.name}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setBulk(null)}>
              {es.app.cancel}
            </Button>
            <Button
              type="button"
              disabled={run.isPending || ticked.size === 0}
              onClick={() =>
                run.mutate(
                  bulk === 'remove_muscles'
                    ? { action: 'remove_muscles', muscles: [], muscleIds: [...ticked], equipmentIds: [] }
                    : { action: 'remove_equipment', muscles: [], muscleIds: [], equipmentIds: [...ticked] },
                )
              }
            >
              {run.isPending ? es.app.saving : 'Quitar'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={bulk === 'delete'} onClose={() => setBulk(null)} title="Eliminar ejercicios" className="max-w-sm">
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[14px] leading-relaxed text-ink-2">
            ¿Eliminar {selected.size === 1 ? 'este ejercicio' : `estos ${selected.size} ejercicios`}? Los que use alguna rutina, bloque
            reutilizable o resultado de usuarios no se eliminarán; archívalos en su lugar.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBulk(null)}>
              {es.app.cancel}
            </Button>
            <Button type="button" disabled={run.isPending} onClick={() => run.mutate({ action: 'delete', muscles: [], muscleIds: [], equipmentIds: [] })}>
              {run.isPending ? es.app.saving : es.app.delete}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
