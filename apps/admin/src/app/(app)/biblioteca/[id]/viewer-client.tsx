'use client';

// One file of the library, the way Shopify opens a file: the image or the
// video big on the left, and on the right its information (name and alt text
// editable), the details and where it is used, with Eliminar at the top.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MediaAsset } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { ActionsMenu } from '@/components/ui/actions-menu';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { fileType } from '@/components/media-library';
import { useImageEditor } from '@/components/image-editor';
import { USAGE_LABEL, USAGE_PATH, usageFieldLabel } from '@/lib/media-usage';
import { formatBytes, isUploadDeclined, startUpload, uploadPct, useUploads } from '@/lib/uploads';

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
  // «Reemplazar»: the chosen file takes this asset's place (same id, references untouched).
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const replacing = useUploads().find(
    (u) => u.replaceOf === id && (u.status === 'uploading' || u.status === 'processing'),
  );
  async function replaceWith(file: File) {
    if (!a) return;
    if (!file.type.startsWith(`${a.kind}/`)) {
      setReplaceError(
        a.kind === 'video'
          ? 'Un video solo se puede reemplazar por otro video.'
          : 'Una imagen solo se puede reemplazar por otra imagen.',
      );
      return;
    }
    setReplaceError(null);
    try {
      await startUpload(file, a.kind, { replaceOf: id });
    } catch (e) {
      if (!isUploadDeclined(e)) setReplaceError(e instanceof Error ? e.message : es.app.error);
    } finally {
      if (replaceRef.current) replaceRef.current.value = '';
    }
  }
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
    onError: (e) => {
      // Someone attached it since the page loaded: show where.
      qc.invalidateQueries({ queryKey: ['media-usage', id] });
      toast(e instanceof Error ? e.message : es.app.error, 'error');
    },
  });

  // Images are edited in place (crop, flip, rotate, resize); saving replaces the file, same id.
  const editor = useImageEditor({
    asset: a && a.kind === 'image' && a.status === 'ready' ? a : null,
    onSaved: () => {
      qc.invalidateQueries({ queryKey: ['media-view', id] });
      qc.invalidateQueries({ queryKey: ['media'] });
      toast('Imagen guardada');
    },
  });

  const anyDirty = dirty || editor.dirty;
  const savingAll = save.isPending || editor.savingLabel !== null;
  // Guardar takes everything that changed: the image first (a replace), then the name / alt text.
  async function saveAll() {
    try {
      if (editor.dirty) await editor.save();
    } catch {
      return;
    }
    if (dirty) save.mutate();
  }
  // A new file beside this one, with the edits and the name / alt text as typed; the original keeps what it had.
  async function saveAsNew() {
    if (!a) return;
    const typed = name.trim();
    const dot = a.name.lastIndexOf('.');
    const suggested = dot > 0 ? `${a.name.slice(0, dot)} (editada)${a.name.slice(dot)}` : `${a.name} (editada)`;
    const newName = typed && typed !== a.name ? typed : suggested;
    try {
      const newId = await editor.saveAsNew(newName, altText.trim() || null);
      qc.invalidateQueries({ queryKey: ['media'] });
      toast('Imagen guardada como nueva');
      setName(a.name);
      setAltText(a.altText ?? '');
      router.push(`/biblioteca/${newId}`);
    } catch {
      // Already shown by the editor (or the admin declined a duplicate name).
    }
  }
  function discardAll() {
    if (editor.dirty) editor.discard();
    if (a) {
      setName(a.name);
      setAltText(a.altText ?? '');
    }
  }

  if (asset.isLoading) return <p className="p-8 text-sm text-muted">{es.app.loading}</p>;
  if (!a) return <p className="p-8 text-sm text-muted">{es.app.error}</p>;

  const used = usage.data?.items ?? [];
  const details = [
    fileType(a),
    a.width && a.height ? `${a.width} × ${a.height}` : null,
    a.sizeBytes ? formatBytes(a.sizeBytes) : null,
    a.durationSeconds ? mmss(a.durationSeconds) : null,
  ].filter(Boolean);
  const added = new Date(a.createdAt).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-none items-center gap-3 border-b border-line bg-surface px-6 py-3">
        <Link
          href="/biblioteca"
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
          aria-label="Volver a la biblioteca"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4.5 w-4.5"
            aria-hidden="true"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink" title={a.name}>
          {a.name}
        </h1>
        {a.kind === 'image' && a.status === 'ready' && editor.undoRedo}
        <input
          ref={replaceRef}
          type="file"
          accept={`${a.kind}/*`}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void replaceWith(f);
          }}
        />
        {replaceError && <span className="text-[12px] text-accent-dark">{replaceError}</span>}
        {replacing && !anyDirty && (
          <span className="font-mono text-[11.5px] text-muted">
            {replacing.status === 'uploading' ? `Reemplazando ${uploadPct(replacing)}%` : 'Reemplazando…'}
          </span>
        )}
        {/* Any change — name, alt text or an image edit — puts Descartar / Guardar here (Shopify); otherwise the actions menu. */}
        {anyDirty ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={discardAll} disabled={savingAll}>
              Descartar
            </Button>
            <Button type="button" size="sm" onClick={() => void saveAll()} disabled={savingAll || !name.trim()}>
              {editor.savingLabel ?? (savingAll ? es.app.saving : es.app.save)}
            </Button>
            {a.kind === 'image' && a.status === 'ready' && (
              <ActionsMenu
                label=""
                size="sm"
                ariaLabel="Más opciones para guardar"
                items={[{ label: 'Guardar como nueva imagen', disabled: savingAll, onSelect: () => void saveAsNew() }]}
              />
            )}
          </>
        ) : (
          <ActionsMenu
            size="sm"
            items={[
              {
                label: 'Copiar enlace',
                disabled: a.status !== 'ready',
                onSelect: () => {
                  void navigator.clipboard.writeText(api.media.publicUrl(id)).then(() => toast('Enlace copiado'));
                },
              },
              {
                label: 'Abrir en una pestaña',
                disabled: a.status !== 'ready',
                onSelect: () => window.open(api.media.publicUrl(id), '_blank', 'noopener'),
              },
              {
                label: a.kind === 'video' ? 'Reemplazar video' : 'Reemplazar imagen',
                disabled: !!replacing || a.status !== 'ready',
                onSelect: () => replaceRef.current?.click(),
              },
              { label: es.app.delete, danger: true, disabled: remove.isPending, onSelect: () => setConfirmDelete(true) },
            ]}
          />
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-5 overflow-hidden bg-surface-3 p-6">
        {a.status === 'ready' && a.kind === 'image' ? (
          editor.stage
        ) : (
          <div className="flex min-h-[420px] min-w-0 flex-1 items-center justify-center rounded-xl bg-[#1c1c21] p-4">
            {a.status === 'ready' && a.embedUrl ? (
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
        )}

        <aside className="flex min-h-0 w-[340px] flex-none flex-col gap-4 overflow-y-auto">
          <section className="rounded-xl border border-line-2 bg-surface">
            {editor.sectionBtn(
              'info',
              'Información',
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 text-ink-3"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>,
            )}
            <div className={cn('flex flex-col gap-3 p-4', editor.section !== 'info' && 'hidden')}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="media-name">Nombre</Label>
                <Input id="media-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {a.kind === 'image' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="media-alt">Texto alternativo</Label>
                  <Input
                    id="media-alt"
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    placeholder="Describe la imagen"
                  />
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
                        <Link
                          href={`${USAGE_PATH[u.type]}/${u.id}`}
                          className="font-medium text-accent hover:text-accent-dark"
                        >
                          {u.name}
                        </Link>
                        <span className="text-muted">
                          {' '}
                          · {USAGE_LABEL[u.type]} · {usageFieldLabel(u.field)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
          {a.kind === 'image' && a.status === 'ready' && editor.tools}
        </aside>
      </div>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={used.length ? 'No se puede eliminar' : 'Eliminar archivo'}
        className="max-w-sm"
      >
        <div className="flex flex-col gap-4 p-5">
          {used.length ? (
            <>
              <p className="text-[14px] leading-relaxed text-ink-2">
                <strong className="font-semibold text-ink">{a.name}</strong> se usa en{' '}
                {used.length === 1 ? 'este contenido' : `estos ${used.length} contenidos`}. Quítalo
                de ahí (o cámbialo por otro archivo) y vuelve a intentarlo.
              </p>
              <ul className="flex flex-col gap-1">
                {used.map((u) => (
                  <li key={`${u.type}-${u.id}-${u.field}`} className="text-[13px]">
                    <Link
                      href={`${USAGE_PATH[u.type]}/${u.id}`}
                      className="font-medium text-accent hover:text-accent-dark"
                    >
                      {u.name}
                    </Link>
                    <span className="text-muted">
                      {' '}
                      · {USAGE_LABEL[u.type]} · {usageFieldLabel(u.field)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                  Entendido
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[14px] leading-relaxed text-ink-2">
                ¿Eliminar <strong className="font-semibold text-ink">{a.name}</strong>? Ningún
                contenido lo usa. El archivo se borra también de Cloudflare.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                  {es.app.cancel}
                </Button>
                <Button
                  type="button"
                  disabled={remove.isPending || usage.isLoading}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? es.app.saving : es.app.delete}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
