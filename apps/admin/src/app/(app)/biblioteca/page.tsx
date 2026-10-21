'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MediaBrowser, type MediaKindFilter } from '@/components/media-library';

export default function BibliotecaPage() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<MediaKindFilter>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data } = useQuery({ queryKey: ['media', 'count'], queryFn: () => api.media.list({ pageSize: 1 }) });

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api.media.remove(id);
    },
    onSuccess: () => {
      setSelected([]);
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: ['media'] });
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={es.media.title}
        subtitle={data ? `${data.total} archivo${data.total === 1 ? '' : 's'}` : es.media.title}
      />
      <MediaBrowser
        kind={kind}
        onKindChange={setKind}
        selectable="multi"
        selected={selected}
        onSelectedChange={setSelected}
        className="min-h-0 flex-1 px-8 pt-[22px]"
      />
      {selected.length > 0 && (
        <div className="flex flex-none items-center justify-between gap-3 border-t border-line bg-surface px-8 py-3">
          <span className="text-sm text-ink-2">
            {selected.length} {selected.length === 1 ? 'marcado' : 'marcados'}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setSelected([])}>
              Desmarcar
            </Button>
            <Button type="button" onClick={() => setConfirmDelete(true)} disabled={remove.isPending}>
              {es.app.delete}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Eliminar archivos" className="max-w-sm">
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[14px] leading-relaxed text-ink-2">
            ¿Eliminar {selected.length === 1 ? 'este archivo' : `estos ${selected.length} archivos`}? Lo que los use dejará de
            mostrarlos.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              {es.app.cancel}
            </Button>
            <Button type="button" disabled={remove.isPending} onClick={() => remove.mutate(selected)}>
              {remove.isPending ? es.app.saving : es.app.delete}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
