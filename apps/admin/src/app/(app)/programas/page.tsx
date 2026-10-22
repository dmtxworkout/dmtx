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
import { PageHeader } from '@/components/ui/page-header';
import { Thumb } from '@/components/ui/thumb';
import { MediaThumb } from '@/components/media-thumb';

const COLS = 'grid-cols-[74px_minmax(0,2fr)_110px_120px_104px_150px] gap-3.5 px-[18px]';

export default function ProgramasPage() {
  const [search, setSearch] = useState('');
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['programs', search],
    queryFn: () => api.programs.list({ search: search || undefined, pageSize: 60 }),
    placeholderData: keepPreviousData,
  });
  const rows = data?.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={es.programs.title}
        subtitle={data ? `${data.total} programa${data.total === 1 ? '' : 's'}` : es.programs.title}
        actions={
          <Link href="/programas/nuevo">
            <Button>{es.programs.new}</Button>
          </Link>
        }
      >
        <div className="flex h-9 w-[300px] items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5">
          <span className="text-muted-2">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar programa"
            className="h-full flex-1 bg-transparent text-sm text-ink placeholder:text-muted-2 focus:outline-none"
          />
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-5">
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <div className={`grid min-w-[860px] ${COLS} h-[42px] items-center border-b border-line-3 bg-surface-2`}>
            {['', 'Nombre', 'Semanas', 'Dificultad', 'Estado', 'Actualizado'].map((h, i) => (
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
            <div className="p-10 text-center text-sm text-muted">{es.programs.empty}</div>
          ) : (
            rows.map((p) => {
              const weeks = Math.ceil(p.dayCount / 7);
              return (
                <div
                  key={p.id}
                  onClick={() => router.push(`/programas/${p.id}`)}
                  className={`grid min-w-[860px] cursor-pointer ${COLS} items-center border-b border-line-4 py-2.5 last:border-0 hover:bg-surface-2/60`}
                >
                  {p.thumbnailAssetId ? (
                    <MediaThumb assetId={p.thumbnailAssetId} className="h-[46px] w-[74px] rounded-[7px]" />
                  ) : (
                    <Thumb className="h-[46px] w-[74px] rounded-[7px]" ratio="auto" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    {p.description && <div className="truncate font-mono text-[11px] text-muted">{p.description}</div>}
                  </div>
                  <span className="text-[13px] text-ink-2">
                    {weeks === 0 ? <span className="text-faint-2">—</span> : `${weeks} semana${weeks === 1 ? '' : 's'}`}
                  </span>
                  <span className="text-[13px] text-ink-2">{es.difficulty[p.difficulty]}</span>
                  <span>
                    <Badge tone={p.status}>{es.status[p.status]}</Badge>
                  </span>
                  <span className="text-right font-mono text-[12px] text-muted">{formatDateEs(p.updatedAt)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
