'use client';

// Saved blocks ("bloques guardados"): reusable rutina text the editor suggests
// by name. Created from the rutina editor ("Guardar bloque"); here they can be
// renamed, edited or deleted.
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Snippet } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { formatDateEs } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const COLS = 'grid-cols-[minmax(0,1fr)_minmax(0,2fr)_130px_34px] items-center gap-3 px-4';

export function SnippetList() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; text: string } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['snippets', 'list', search],
    queryFn: () => api.snippets.list({ search: search || undefined, pageSize: 200 }),
    placeholderData: keepPreviousData,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['snippets'] });
  const remove = useMutation({ mutationFn: (id: string) => api.snippets.remove(id), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (s: { id: string; name: string; text: string }) =>
      api.snippets.update(s.id, { name: s.name, text: s.text }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  const items = data?.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={es.snippets.title}
        subtitle={data ? `${es.snippets.count(data.total)} · ${es.snippets.subtitle}` : es.snippets.subtitle}
      >
        <div className="flex h-9 w-[300px] items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5">
          <span className="text-muted-2">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar bloque"
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
          <div className="p-10 text-center text-sm text-muted">{es.snippets.empty}</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div
              className={`grid border-b border-line bg-surface-2 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-2 ${COLS}`}
            >
              <span>Nombre</span>
              <span>Contenido</span>
              <span>Actualizado</span>
              <span />
            </div>
            {items.map((sn: Snippet) => (
              <div
                key={sn.id}
                onClick={() => setEditing({ id: sn.id, name: sn.name, text: sn.text })}
                className={`group grid cursor-pointer border-b border-line-2 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-surface-2 ${COLS}`}
              >
                <span className="truncate font-semibold text-ink">{sn.name}</span>
                <span className="truncate font-mono text-[12px] text-ink-3">
                  {sn.text.split('\n').filter(Boolean).join(' · ')}
                </span>
                <span className="font-mono text-[12px] text-muted">{formatDateEs(sn.updatedAt)}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(es.app.confirmDelete)) remove.mutate(sn.id);
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

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Editar bloque" className="max-w-lg">
        <div className="flex flex-col gap-4 p-5">
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink-2">Nombre</div>
            <Input
              autoFocus
              value={editing?.name ?? ''}
              onChange={(e) => setEditing((m) => (m ? { ...m, name: e.target.value } : m))}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink-2">Contenido</div>
            <textarea
              value={editing?.text ?? ''}
              onChange={(e) => setEditing((m) => (m ? { ...m, text: e.target.value } : m))}
              className="min-h-40 w-full rounded-lg border border-line-2 bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              {es.app.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => editing && update.mutate(editing)}
              disabled={update.isPending || !editing?.name.trim() || !editing?.text.trim()}
            >
              {update.isPending ? es.app.saving : es.app.save}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
