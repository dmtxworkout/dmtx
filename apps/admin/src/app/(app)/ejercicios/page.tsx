'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { formatDateEs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { Thumb } from '@/components/ui/thumb';
import { MediaThumb } from '@/components/media-thumb';

const COLS =
  'grid-cols-[74px_minmax(0,1.6fr)_minmax(0,1.4fr)_120px_120px_104px_150px] gap-3.5 px-[18px]';
const FILTERS = ['Todo', 'Principiante', 'Intermedio', 'Avanzado', 'Sin video'];

export default function ExercisesPage() {
  const [search, setSearch] = useState('');
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exercises', search],
    queryFn: () => api.exercises.list({ search: search || undefined, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];

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
              placeholder="Buscar por nombre o músculo"
              className="h-full flex-1 bg-transparent text-sm text-ink placeholder:text-muted-2 focus:outline-none"
            />
          </div>
          {FILTERS.map((f, i) => (
            <Chip key={f} active={i === 0}>
              {f}
            </Chip>
          ))}
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-5">
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <div className={`grid min-w-[1060px] ${COLS} border-b border-line-3 bg-surface-2 py-2.5`}>
            {['', 'Nombre', 'Músculos', 'Dificultad', 'Medición', 'Estado', 'Actualizado'].map((h, i) => (
              <span
                key={i}
                className={`font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2 ${i === 6 ? 'text-right' : ''}`}
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
            rows.map((e) => (
              <div
                key={e.id}
                onClick={() => router.push(`/ejercicios/${e.id}`)}
                className={`grid min-w-[1060px] cursor-pointer ${COLS} items-center border-b border-line-4 py-2.5 last:border-0 hover:bg-surface-2/60`}
              >
                {e.thumbnailAssetId ? (
                  <MediaThumb assetId={e.thumbnailAssetId} className="h-[46px] w-[74px] rounded-[7px]" />
                ) : (
                  <Thumb className="h-[46px] w-[74px] rounded-[7px]" ratio="auto" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{e.name}</div>
                  {e.description && (
                    <div className="truncate font-mono text-[11px] text-muted">{e.description}</div>
                  )}
                </div>
                <div className="min-w-0" />
                <span className="text-[13px] text-ink-2">{es.difficulty[e.difficulty]}</span>
                <span className="text-[13px] text-ink-2">{es.measurement[e.measurementType]}</span>
                <span>
                  <Badge tone={e.status}>{es.status[e.status]}</Badge>
                </span>
                <span className="text-right font-mono text-[12px] text-muted">
                  {formatDateEs(e.updatedAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
