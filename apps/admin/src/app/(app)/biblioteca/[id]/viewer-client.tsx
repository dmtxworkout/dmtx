'use client';

// One file of the library, the way Shopify opens a file: the image or the
// video big on the left, and on the right its information (name and alt text
// editable), the details and where it is used, with Eliminar at the top.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MediaAsset, MediaUsageItem } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { fileType } from '@/components/media-library';
import { formatBytes } from '@/lib/uploads';

const USAGE_LABEL: Record<MediaUsageItem['type'], string> = {
  exercise: 'Ejercicio',
  workout: 'Rutina',
  program: 'Programa',
  skill: 'Habilidad',
  skillLevel: 'Nivel de habilidad',
  collection: 'Colección',
};
const USAGE_PATH: Record<MediaUsageItem['type'], string> = {
  exercise: '/ejercicios',
  workout: '/rutinas',
  program: '/programas',
  skill: '/habilidades',
  skillLevel: '/habilidades',
  collection: '/colecciones',
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function MediaViewer({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const asset = useQuery({
    queryKey: ['media-view', id],
    queryFn: () => api.media.view(id),
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 5000 : false),
  });
  const usage = useQuery({ queryKey: ['media-usage', id], queryFn: () => api.media.usage(id) });
  const [name, setName] = useState('');
  const [altText, setAltText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The form follows the asset until the admin edits it.
  const a = asset.data;
  useEffect(() => {
    if (!a) return;
    setName(a.name);
    setAltText(a.altText ?? '');
  }, [a]);
  const dirty = !!a && (name.trim() !== a.name || (altText.trim() || null) !== (a.altText ?? null));

  const save = useMutation({
    mutationFn: () => api.media.update(id, { name: name.trim(), altText: altText.trim() || null }),
    onSuccess: (updated: MediaAsset) => {
      qc.setQueryData(['media-view', id], updated);
      qc.invalidateQueries({ queryKey: ['media'] });
      toast('Guardado');
    },
    onError: () => toast(es.app.error, 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.media.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media'] });
      router.push('/biblioteca');
    },
    onError: () => toast(es.app.error, 'error'),
  });

  if (asset.isLoading) return <p className="p-8 text-sm text-muted">{es.app.loading}</p>;
  if (!a) return <p className="p-8 text-sm text-muted">{es.app.error}</p>;

  const details = [
    fileType(a),
    a.width && a.height ? `${a.width} × ${a.height}` : null,
    a.sizeBytes ? formatBytes(a.sizeBytes) : null,
    a.durationSeconds ? mmss(a.durationSeconds) : null,
  ].filter(Boolean);
  const added = new Date(a.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-none items-center gap-3 border-b border-line bg-surface px-6 py-3">
        <Link
          href="/biblioteca"
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
          aria-label="Volver a la biblioteca"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink" title={a.name}>
          {a.name}
        </h1>
        {a.kind === 'image' && a.viewUrl && (
          <a href={a.viewUrl} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-ink-3 hover:text-ink">
            Abrir en una pestaña
          </a>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(true)} disabled={remove.isPending}>
          {es.app.delete}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 gap-5 overflow-y-auto bg-surface-3 p-6">
        <div className="flex min-h-[420px] min-w-0 flex-1 items-center justify-center rounded-xl bg-[#1c1c21] p-4">
          {a.status === 'ready' && a.kind === 'image' && a.viewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.viewUrl} alt={a.altText ?? ''} className="max-h-[calc(100vh-200px)] max-w-full rounded-md object-contain" />
          ) : a.status === 'ready' && a.embedUrl ? (
            <iframe
              src={a.embedUrl}
              title={a.name}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen
              className="aspect-video w-full max-w-[1100px] rounded-md border-0"
            />
          ) : (
            <p className="px-6 text-center text-sm text-ink-3">
              {a.status === 'processing'
                ? 'Cloudflare está procesando el video… estará listo en unos minutos.'
                : a.status === 'failed'
                  ? 'Cloudflare no pudo procesar este video.'
                  : 'La subida no terminó.'}
            </p>
          )}
        </div>

        <aside className="flex w-[340px] flex-none flex-col gap-4">
          <section className="rounded-xl border border-line-2 bg-surface p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-ink">Información</h2>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="media-name">Nombre</Label>
                <Input id="media-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {a.kind === 'image' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="media-alt">Texto alternativo</Label>
                  <Input id="media-alt" value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Describe la imagen" />
                </div>
              )}
              {dirty && (
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setName(a.name);
                      setAltText(a.altText ?? '');
                    }}
                  >
                    {es.app.cancel}
                  </Button>
                  <Button type="button" size="sm" disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>
                    {save.isPending ? es.app.saving : es.app.save}
                  </Button>
                </div>
              )}
              <div>
                <p className="text-[12px] font-semibold text-ink-2">Detalles</p>
                <p className="mt-0.5 font-mono text-[12px] text-muted">{details.join(' · ')}</p>
                <p className="font-mono text-[12px] text-muted">Añadido el {added}</p>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-ink-2">Usado en</p>
                {usage.isLoading ? (
                  <p className="mt-0.5 text-[12.5px] text-muted">{es.app.loading}</p>
                ) : !usage.data?.items.length ? (
                  <p className="mt-0.5 text-[12.5px] text-muted">Ningún contenido lo usa.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1">
                    {usage.data.items.map((u) => (
                      <li key={`${u.type}-${u.id}-${u.field}`} className="text-[12.5px]">
                        <Link href={`${USAGE_PATH[u.type]}/${u.id}`} className="font-medium text-accent hover:text-accent-dark">
                          {u.name}
                        </Link>
                        <span className="text-muted">
                          {' '}
                          · {USAGE_LABEL[u.type]} · {u.field === 'video' ? 'video' : 'portada'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Eliminar archivo" className="max-w-sm">
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[14px] leading-relaxed text-ink-2">
            ¿Eliminar «{a.name}»?{' '}
            {usage.data?.items.length
              ? `Lo usan ${usage.data.items.length} ${usage.data.items.length === 1 ? 'contenido, que dejará' : 'contenidos, que dejarán'} de mostrarlo.`
              : 'El archivo se borra también de Cloudflare.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              {es.app.cancel}
            </Button>
            <Button type="button" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? es.app.saving : es.app.delete}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
