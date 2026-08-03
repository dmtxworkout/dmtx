'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_STATUS } from '@dmtx/schemas';
import type { ContentStatus, WorkoutListItem } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { formatDateEs } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { MediaThumb } from '@/components/media-thumb';

const FORMAT_LABEL: Record<string, string> = {
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'Tabata',
  strength: 'Fuerza',
  chipper: 'Chipper',
  for_time: 'Por tiempo',
  circuit: 'Circuito',
};

const COLS = 'grid-cols-[34px_58px_minmax(0,2fr)_120px_120px_120px_130px_34px] items-center gap-3 px-4';

export default function RutinasPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<ContentStatus>('published');
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['workouts', search],
    queryFn: () => api.workouts.list({ search: search || undefined, pageSize: 100 }),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.workouts.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workouts'] }),
  });
  const bulkStatusMut = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ContentStatus }) => {
      await Promise.all(ids.map((id) => api.workouts.update(id, { status })));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts'] });
      setSelected(new Set());
    },
  });

  const items = data?.data ?? [];
  const allSelected = items.length > 0 && items.every((w) => selected.has(w.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((w) => w.id)));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={es.workouts.title}
        subtitle={data ? `${data.total} rutina${data.total === 1 ? '' : 's'}` : es.workouts.title}
        actions={
          <Link href="/rutinas/nueva">
            <Button>{es.workouts.new}</Button>
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex h-9 w-[300px] items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5">
            <span className="text-muted-2">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar rutina, formato o ejercicio"
              className="h-full flex-1 bg-transparent text-sm text-ink placeholder:text-muted-2 focus:outline-none"
            />
          </div>
        </div>
      </PageHeader>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-line bg-accent-tint/40 px-8 py-2.5">
          <span className="text-[13px] font-semibold text-ink-2">
            {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
          </span>
          <span className="text-[13px] text-muted">·</span>
          <span className="text-[13px] text-ink-2">Cambiar estado a</span>
          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as ContentStatus)}
            className="h-8 w-[150px]"
          >
            {CONTENT_STATUS.map((s) => (
              <option key={s} value={s}>
                {es.status[s]}
              </option>
            ))}
          </Select>
          <Button
            className="h-8"
            disabled={bulkStatusMut.isPending}
            onClick={() => bulkStatusMut.mutate({ ids: [...selected], status: bulkStatus })}
          >
            {bulkStatusMut.isPending ? es.app.saving : `Aplicar a ${selected.size}`}
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-[13px] font-medium text-muted hover:text-ink-2"
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-[22px]">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted">{es.app.loading}</div>
        ) : isError ? (
          <div className="p-10 text-center text-sm text-accent-dark">{es.app.error}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">{es.workouts.empty}</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {/* Header */}
            <div
              className={`grid border-b border-line bg-surface-2 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-2 ${COLS}`}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 cursor-pointer"
                aria-label="Seleccionar todo"
              />
              <span />
              <span>Nombre</span>
              <span>Tipo</span>
              <span>Formato</span>
              <span>Estado</span>
              <span>Actualizado</span>
              <span />
            </div>
            {items.map((w: WorkoutListItem) => (
              <div
                key={w.id}
                onClick={() => router.push(`/rutinas/${w.id}`)}
                className={`group grid cursor-pointer border-b border-line-2 py-2 text-sm transition-colors last:border-b-0 hover:bg-surface-2 ${COLS}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(w.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggle(w.id)}
                  className="h-4 w-4 cursor-pointer"
                  aria-label={`Seleccionar ${w.name}`}
                />
                {w.thumbnailAssetId ? (
                  <MediaThumb assetId={w.thumbnailAssetId} className="h-9 w-[52px] rounded-md" />
                ) : (
                  <div
                    className="h-9 w-[52px] rounded-md"
                    style={{ background: 'repeating-linear-gradient(135deg,#eeeae2 0 5px,#e4dfd5 5px 10px)' }}
                  />
                )}
                <span className="truncate font-semibold text-ink">{w.name}</span>
                <span className="text-[13px] text-ink-2">
                  {w.type === 'video' ? 'Video' : 'Estructurada'}
                </span>
                <span className="text-[13px] text-ink-2">
                  {w.type === 'video' ? '—' : w.format ? (FORMAT_LABEL[w.format] ?? w.format) : '—'}
                </span>
                <span>
                  <Badge tone={w.status}>{es.status[w.status]}</Badge>
                </span>
                <span className="font-mono text-[12px] text-muted">{formatDateEs(w.updatedAt)}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(es.app.confirmDelete)) remove.mutate(w.id);
                  }}
                  className="text-faint-2 opacity-0 transition-opacity hover:text-accent-dark group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
