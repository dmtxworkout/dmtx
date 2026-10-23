'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MediaUsageItem } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MediaBrowser, type MediaKindFilter } from '@/components/media-library';

export default function BibliotecaPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [kind, setKind] = useState<MediaKindFilter>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data } = useQuery({ queryKey: ['media', 'count'], queryFn: () => api.media.list({ pageSize: 1 }) });

  // Before deleting, where each marked file is used: those are kept and listed.
  const [usage, setUsage] = useState<{ id: string; name: string; items: MediaUsageItem[] }[] | null>(null);
  useEffect(() => {
    if (!confirmDelete) {
      setUsage(null);
      return;
    }
    let alive = true;
    void Promise.all(
      selected.map(async (id) => {
        const [asset, u] = await Promise.all([api.media.view(id), api.media.usage(id)]);
        return { id, name: asset.name, items: u.items };
      }),
    ).then((rows) => alive && setUsage(rows));
    return () => {
      alive = false;
    };
  }, [confirmDelete, selected]);
  const inUse = (usage ?? []).filter((u) => u.items.length);
  const free = (usage ?? []).filter((u) => !u.items.length).map((u) => u.id);

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api.media.remove(id);
    },
    onSuccess: (_, ids) => {
      setSelected((s) => s.filter((id) => !ids.includes(id)));
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: ['media'] });
    },
  });
  const usageLabel: Record<MediaUsageItem['type'], string> = {
    exercise: 'ejercicio',
    workout: 'rutina',
    program: 'programa',
    skill: 'habilidad',
    skillLevel: 'nivel',
    collection: 'colección',
  };

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
        onOpen={(id) => router.push(`/biblioteca/${id}`)}
        layout="table"
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

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Eliminar archivos" className="max-w-md">
        <div className="flex flex-col gap-4 p-5">
          {usage === null ? (
            <p className="text-[14px] text-muted">{es.app.loading}</p>
          ) : (
            <>
              {inUse.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[14px] leading-relaxed text-ink-2">
                    {inUse.length === 1
                      ? 'Este archivo se usa y no se puede eliminar. Quítalo de su contenido primero:'
                      : `Estos ${inUse.length} archivos se usan y no se pueden eliminar. Quítalos de su contenido primero:`}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {inUse.map((u) => (
                      <li key={u.id} className="text-[13px]">
                        <span className="font-semibold text-ink">{u.name}</span>
                        <span className="text-muted">
                          {' '}
                          · {u.items.map((it) => `${it.name} (${usageLabel[it.type]})`).join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {free.length > 0 && (
                <p className="text-[14px] leading-relaxed text-ink-2">
                  {inUse.length ? 'El resto' : free.length === 1 ? 'Este archivo' : `Estos ${free.length} archivos`}{' '}
                  {free.length === 1 ? 'no se usa en ningún contenido' : 'no se usan en ningún contenido'}. ¿Eliminar{free.length === 1 ? 'lo' : 'los'}? Se borra
                  también de Cloudflare.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                  {free.length ? es.app.cancel : 'Entendido'}
                </Button>
                {free.length > 0 && (
                  <Button type="button" disabled={remove.isPending} onClick={() => remove.mutate(free)}>
                    {remove.isPending ? es.app.saving : free.length === selected.length ? es.app.delete : `Eliminar ${free.length}`}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
