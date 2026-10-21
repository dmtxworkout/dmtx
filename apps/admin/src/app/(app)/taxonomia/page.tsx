'use client';

// Muscles (in groups) and equipment: the tags an exercise carries so the app
// can search "pierna" or "sin equipo". Three columns: groups → the muscles of
// the selected group → equipment. Add with the row at the bottom (Enter),
// rename inline, delete only what no exercise uses.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BODY_REGION, type BodyRegion } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';

const REGION: Record<BodyRegion, string> = { upper: 'Tren superior', lower: 'Tren inferior', core: 'Core', full_body: 'Cuerpo completo' };

type Row = { id: string; name: string; count: number; sub?: string };

function Column({
  title,
  rows,
  selectedId,
  onSelect,
  countLabel,
  addLabel,
  onAdd,
  onRename,
  onRemove,
  empty,
  extra,
}: {
  title: string;
  rows: Row[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  countLabel: (n: number) => string;
  addLabel: string;
  onAdd: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onRemove: (row: Row) => void;
  empty: string;
  extra?: React.ReactNode;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const submitAdd = async () => {
    const name = draft.trim();
    if (!name) return;
    // Clear first so the admin can type the next name while this one saves.
    setDraft('');
    try {
      await onAdd(name);
    } catch {
      setDraft(name);
    }
  };
  const submitRename = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    const row = rows.find((r) => r.id === editing.id);
    setEditing(null);
    if (name && row && name !== row.name) await onRename(editing.id, name).catch(() => undefined);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>, fn: () => void, cancel?: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fn();
    } else if (e.key === 'Escape') cancel?.();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line-3 bg-surface-2 px-4 py-3.5">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="font-mono text-[11px] text-muted-2">{rows.length}</span>
      </div>
      {rows.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-muted">{empty}</div>}
      {rows.map((r) => {
        const active = selectedId === r.id;
        const isEditing = editing?.id === r.id;
        return (
          <div
            key={r.id}
            onClick={() => onSelect?.(r.id)}
            onDoubleClick={() => setEditing({ id: r.id, name: r.name })}
            className={cn(
              'group flex items-center gap-2.5 border-b border-line-4 px-4 py-2',
              onSelect && 'cursor-pointer',
              active && 'bg-[#f3efe8]',
            )}
            title="Doble clic para renombrar"
          >
            {onSelect && <span className={cn('block h-1.5 w-1.5 shrink-0 rounded-sm', active ? 'bg-accent' : 'bg-[#d8d2c7]')} />}
            {isEditing ? (
              <input
                ref={editRef}
                value={editing.name}
                onChange={(e) => setEditing({ id: r.id, name: e.target.value })}
                onBlur={submitRename}
                onKeyDown={(e) => onKey(e, submitRename, () => setEditing(null))}
                className="h-7 min-w-0 flex-1 rounded-md border border-accent bg-surface px-2 text-sm focus:outline-none"
              />
            ) : (
              <span className={cn('min-w-0 flex-1 truncate text-sm', active && 'font-semibold')}>
                {r.name}
                {r.sub && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{r.sub}</span>}
              </span>
            )}
            <span className="font-mono text-[11px] text-muted">{countLabel(r.count)}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(r);
              }}
              className="rounded px-1 text-faint-2 opacity-0 hover:text-accent-dark group-hover:opacity-100"
              title={es.app.delete}
              aria-label={`${es.app.delete} ${r.name}`}
            >
              ✕
            </button>
          </div>
        );
      })}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => onKey(e, () => void submitAdd())}
          placeholder={addLabel}
          className="h-[30px] min-w-0 flex-1 rounded-[7px] border border-dashed border-line-2 bg-surface-3 px-2.5 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        {extra}
      </div>
    </div>
  );
}

export default function TaxonomiaPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['taxonomy'], queryFn: () => api.taxonomy.get() });
  const [groupId, setGroupId] = useState<string | null>(null);
  const [region, setRegion] = useState<BodyRegion>('full_body');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ label: string; run: () => Promise<unknown> } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['taxonomy'] });
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : es.app.error);

  const groups = data?.groups ?? [];
  const selected = groupId && groups.some((g) => g.id === groupId) ? groupId : (groups[0]?.id ?? null);
  const group = groups.find((g) => g.id === selected) ?? null;
  const musclesOf = (data?.muscles ?? []).filter((m) => m.muscleGroupId === selected);

  const run = async (p: Promise<unknown>) => {
    setError(null);
    try {
      await p;
      await refresh();
    } catch (e) {
      fail(e);
      throw e;
    }
  };
  const remove = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
    onError: (e) => {
      setConfirm(null);
      fail(e);
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Músculos y equipo"
        subtitle="Las etiquetas de cada ejercicio: con ellas la app busca por grupo muscular y por equipo."
      />
      {error && <p className="mx-8 mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-accent-dark">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto px-8 pb-10 pt-[22px]">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted">{es.app.loading}</div>
        ) : isError || !data ? (
          <div className="p-10 text-center text-sm text-accent-dark">{es.app.error}</div>
        ) : (
          <div className="grid min-w-[880px] grid-cols-3 items-start gap-4">
            <Column
              title="Grupos musculares"
              rows={groups.map((g) => ({ id: g.id, name: g.name, count: g.exerciseCount, sub: REGION[g.bodyRegion] }))}
              selectedId={selected}
              onSelect={setGroupId}
              countLabel={(n) => `${n} ejerc.`}
              addLabel="+ Grupo"
              onAdd={(name) => run(api.taxonomy.createGroup({ name, bodyRegion: region }))}
              onRename={(id, name) => run(api.taxonomy.updateGroup(id, { name }))}
              onRemove={(r) => setConfirm({ label: `el grupo «${r.name}»`, run: () => api.taxonomy.removeGroup(r.id) })}
              empty="Aún no hay grupos. Crea el primero: Pecho, Espalda, Piernas…"
              extra={
                <Select value={region} onChange={(e) => setRegion(e.target.value as BodyRegion)} className="h-[30px] w-[150px] text-[12px]">
                  {BODY_REGION.map((r) => (
                    <option key={r} value={r}>
                      {REGION[r]}
                    </option>
                  ))}
                </Select>
              }
            />
            <Column
              title={group ? `Músculos · ${group.name}` : 'Músculos'}
              rows={musclesOf.map((m) => ({ id: m.id, name: m.name, count: m.exerciseCount }))}
              countLabel={(n) => `${n} ejerc.`}
              addLabel={group ? '+ Músculo' : 'Elige un grupo'}
              onAdd={(name) => (group ? run(api.taxonomy.createMuscle({ name, muscleGroupId: group.id })) : Promise.resolve())}
              onRename={(id, name) => run(api.taxonomy.updateMuscle(id, { name }))}
              onRemove={(r) => setConfirm({ label: `el músculo «${r.name}»`, run: () => api.taxonomy.removeMuscle(r.id) })}
              empty={group ? `Sin músculos en ${group.name} todavía.` : 'Elige un grupo a la izquierda.'}
            />
            <Column
              title="Equipo"
              rows={data.equipment.map((e) => ({ id: e.id, name: e.name, count: e.exerciseCount }))}
              countLabel={(n) => `${n} ejerc.`}
              addLabel="+ Equipo"
              onAdd={(name) => run(api.taxonomy.createEquipment({ name }))}
              onRename={(id, name) => run(api.taxonomy.updateEquipment(id, { name }))}
              onRemove={(r) => setConfirm({ label: `el equipo «${r.name}»`, run: () => api.taxonomy.removeEquipment(r.id) })}
              empty="Aún no hay equipo. Empieza por Peso corporal, Mancuernas, Barra…"
            />
          </div>
        )}
      </div>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} title="Eliminar" className="max-w-sm">
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[14px] leading-relaxed text-ink-2">
            ¿Eliminar {confirm?.label}? Solo se puede eliminar lo que ningún ejercicio usa.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              {es.app.cancel}
            </Button>
            <Button type="button" disabled={remove.isPending} onClick={() => confirm && remove.mutate(confirm.run)}>
              {remove.isPending ? es.app.saving : es.app.delete}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
