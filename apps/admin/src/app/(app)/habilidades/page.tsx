'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { skillGoalLabel } from '@/components/rutina-form';
import { es } from '@/i18n/es';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MediaThumb } from '@/components/media-thumb';

const HATCH = 'repeating-linear-gradient(135deg,#f0ece4 0 5px,#e6e1d7 5px 10px)';

export default function HabilidadesPage() {
  const [search, setSearch] = useState('');
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['skills', search],
    queryFn: () => api.skills.list({ search: search || undefined, pageSize: 60 }),
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
        subtitle="Progresiones por niveles. Cada nivel se desbloquea al cumplir su objetivo."
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

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-8 pb-10 pt-[22px]">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted">{es.app.loading}</div>
        ) : isError ? (
          <div className="p-10 text-center text-sm text-accent-dark">{es.app.error}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">{es.skills.empty}</div>
        ) : (
          items.map((sk) => (
            <div key={sk.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="group flex items-center gap-3 border-b border-line-3 bg-surface-2 px-4 py-3.5">
                {sk.thumbnailAssetId ? (
                  <MediaThumb assetId={sk.thumbnailAssetId} className="h-9 w-14 shrink-0 rounded-md" />
                ) : (
                  <div className="h-9 w-14 shrink-0 rounded-md" style={{ background: HATCH }} />
                )}
                <button
                  type="button"
                  onClick={() => router.push(`/habilidades/${sk.id}`)}
                  className="min-w-0 text-left"
                >
                  <div className="text-base font-bold tracking-[-0.01em]">{sk.name}</div>
                  <div className="font-mono text-[11px] text-muted">
                    {sk.levels.length} nivel{sk.levels.length === 1 ? '' : 'es'}
                    {sk.difficulty ? ` · ${es.difficulty[sk.difficulty]}` : ''}
                  </div>
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <Badge tone={sk.status}>{es.status[sk.status]}</Badge>
                  <button
                    type="button"
                    onClick={() => confirm(es.app.confirmDelete) && remove.mutate(sk.id)}
                    className="text-faint-2 opacity-0 transition-opacity hover:text-accent-dark group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex gap-2.5 overflow-x-auto px-4 py-3.5">
                {sk.levels.map((lv, i) => (
                  <button
                    key={lv.id}
                    type="button"
                    onClick={() => router.push(`/habilidades/${sk.id}`)}
                    className="flex w-[196px] flex-shrink-0 flex-col gap-1.5 rounded-[10px] border border-line bg-surface p-3 text-left transition-colors hover:border-line-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <span className="min-w-0 truncate text-[13px] font-semibold">{lv.name}</span>
                    </div>
                    <div className="h-[22px] rounded-[5px]" style={{ background: HATCH }} />
                    <div className="flex flex-col gap-0.5 border-t border-line-3 pt-1.5">
                      <span className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-muted-2">
                        {i === sk.levels.length - 1 ? 'Último nivel' : 'Para pasar al siguiente'}
                      </span>
                      <span className="truncate font-mono text-[11px] font-semibold text-ink-2">
                        {lv.unlockGoals.length ? lv.unlockGoals.map(skillGoalLabel).join(' · ') : i === sk.levels.length - 1 ? '—' : 'Sin objetivo'}
                      </span>
                    </div>
                  </button>
                ))}
                <Link
                  href={`/habilidades/${sk.id}`}
                  className="flex w-[130px] flex-shrink-0 items-center justify-center rounded-[10px] border border-dashed border-line-2 bg-surface-3 text-[13px] font-semibold text-ink-3 hover:bg-surface-2"
                >
                  {es.skills.addLevel}
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
