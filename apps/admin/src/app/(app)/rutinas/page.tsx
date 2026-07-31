'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkoutListItem } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { formatDateEs } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Thumb } from '@/components/ui/thumb';
import { MediaThumb } from '@/components/media-thumb';

const RUTINA_FILTERS = ['Todo', 'AMRAP', 'EMOM', 'Tabata', 'Fuerza', 'Video'];

const FORMAT_LABEL: Record<string, string> = {
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'Tabata',
  strength: 'Fuerza',
  chipper: 'Chipper',
  for_time: 'Por tiempo',
  circuit: 'Circuito',
};

function meta(w: WorkoutListItem): string {
  const parts: string[] = [
    w.type === 'video' ? 'Video' : (w.format ? FORMAT_LABEL[w.format] ?? w.format : 'Estructurada'),
    es.difficulty[w.difficulty],
  ];
  if (w.estimatedDurationSeconds) parts.push(`${Math.round(w.estimatedDurationSeconds / 60)} min`);
  return parts.join(' · ');
}

export default function RutinasPage() {
  const [search, setSearch] = useState('');
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['workouts', search],
    queryFn: () => api.workouts.list({ search: search || undefined, pageSize: 60 }),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.workouts.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workouts'] }),
  });

  const items = data?.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={es.workouts.title}
        subtitle={data ? `${data.total} rutina${data.total === 1 ? '' : 's'}` : es.workouts.title}
        actions={
          <>
            <Button variant="outline">Importar CSV</Button>
            <Link href="/rutinas/nueva">
              <Button>{es.workouts.new}</Button>
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
              placeholder="Buscar rutina, formato o ejercicio"
              className="h-full flex-1 bg-transparent text-sm text-ink placeholder:text-muted-2 focus:outline-none"
            />
          </div>
          {RUTINA_FILTERS.map((f, i) => (
            <Chip key={f} active={i === 0}>
              {f}
            </Chip>
          ))}
          <span className="ml-auto font-mono text-xs font-medium text-muted">
            Ordenar: actualizado ↓
          </span>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-[22px]">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted">{es.app.loading}</div>
        ) : isError ? (
          <div className="p-10 text-center text-sm text-accent-dark">{es.app.error}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">{es.workouts.empty}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((w) => (
              <div
                key={w.id}
                onClick={() => router.push(`/rutinas/${w.id}`)}
                className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-line-2"
              >
                <Thumb>
                  {w.thumbnailAssetId && (
                    <MediaThumb assetId={w.thumbnailAssetId} className="absolute inset-0 h-full w-full" />
                  )}
                  <span className="absolute left-2.5 top-2.5 rounded-md bg-ink px-1.5 py-1 font-mono text-[10px] font-semibold tracking-[0.06em] text-white">
                    {w.type === 'video' ? 'VIDEO' : (w.format ? FORMAT_LABEL[w.format] ?? w.format : '—')}
                  </span>
                </Thumb>
                <div className="flex flex-1 flex-col gap-1.5 px-3.5 pb-3.5 pt-3">
                  <div className="text-[15px] font-semibold leading-tight tracking-[-0.01em]">
                    {w.name}
                  </div>
                  <div className="font-mono text-[11px] text-muted">{meta(w)}</div>
                  <div className="mt-auto flex items-center gap-2 pt-1.5">
                    <Badge tone={w.status}>{es.status[w.status]}</Badge>
                    <span className="font-mono text-[11px] text-faint">
                      {formatDateEs(w.updatedAt)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(es.app.confirmDelete)) remove.mutate(w.id);
                      }}
                      className="ml-auto text-faint-2 opacity-0 transition-opacity hover:text-accent-dark group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
