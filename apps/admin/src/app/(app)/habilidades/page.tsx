'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { formatDateEs } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Thumb } from '@/components/ui/thumb';

export default function HabilidadesPage() {
  const [search, setSearch] = useState('');
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['skills', search],
    queryFn: () => api.skills.list({ search: search || undefined, pageSize: 60 }),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.skills.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills'] }),
  });

  const items = data?.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={es.skills.title}
        subtitle={
          data ? `${data.total} habilidad${data.total === 1 ? '' : 'es'}` : es.skills.title
        }
        actions={
          <Link href="/habilidades/nueva">
            <Button>{es.skills.new}</Button>
          </Link>
        }
      >
        <div className="flex h-9 w-[300px] items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5">
          <span className="text-muted-2">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar habilidad"
            className="h-full flex-1 bg-transparent text-sm text-ink placeholder:text-muted-2 focus:outline-none"
          />
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-[22px]">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted">{es.app.loading}</div>
        ) : isError ? (
          <div className="p-10 text-center text-sm text-accent-dark">{es.app.error}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">{es.skills.empty}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((s) => (
              <div
                key={s.id}
                onClick={() => router.push(`/habilidades/${s.id}`)}
                className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-line-2"
              >
                <Thumb />
                <div className="flex flex-1 flex-col gap-1.5 px-3.5 pb-3.5 pt-3">
                  <div className="text-[15px] font-semibold leading-tight tracking-[-0.01em]">
                    {s.name}
                  </div>
                  <div className="font-mono text-[11px] text-muted">
                    {s.difficulty ? es.difficulty[s.difficulty] : '—'}
                  </div>
                  <div className="mt-auto flex items-center gap-2 pt-1.5">
                    <Badge tone={s.status}>{es.status[s.status]}</Badge>
                    <span className="font-mono text-[11px] text-faint">
                      {formatDateEs(s.updatedAt)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(es.app.confirmDelete)) remove.mutate(s.id);
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
