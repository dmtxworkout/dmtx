'use client';

// The media library the way Shopify (and the vivero admin) lay it out: search
// on top, a dashed "Subir" zone, square tiles with a checkbox and the file's
// name and type underneath. Dropping files anywhere on it uploads them. Used
// by the Biblioteca page (multi-select, delete) and by the picker dialog
// (single select, Listo).
import { type DragEvent, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MediaAsset } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { startUpload, uploadPct, useUploads } from '@/lib/uploads';

export type MediaKindFilter = 'all' | 'image' | 'video';

/** "JPG", "MP4": from the file's extension; else its kind. */
export function fileType(m: MediaAsset): string {
  const ext = m.name.split('.').pop();
  if (ext && ext.length <= 5 && ext !== m.name) return ext.toUpperCase();
  return m.kind === 'image' ? es.media.image : es.media.video;
}

const SearchIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
const UploadIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5" />
    <path d="M12 3v12" />
  </svg>
);

export function MediaBrowser({
  kind,
  onKindChange,
  selectable,
  selected,
  onSelectedChange,
  className,
}: {
  /** The kinds shown. With `onKindChange`, the chips to switch are shown too. */
  kind: MediaKindFilter;
  onKindChange?: (kind: MediaKindFilter) => void;
  selectable: 'single' | 'multi';
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploads = useUploads();
  /** dragenter minus dragleave: children fire their own pairs. */
  const [dragging, setDragging] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['media', kind, search],
    queryFn: () => api.media.list({ kind: kind === 'all' ? undefined : kind, search: search || undefined, pageSize: 200 }),
  });
  const items = data?.data ?? [];

  const toggle = (id: string) => {
    if (selected.includes(id)) onSelectedChange(selected.filter((x) => x !== id));
    else onSelectedChange(selectable === 'single' ? [id] : [...selected, id]);
  };

  const accepted = (f: File) =>
    kind === 'all' ? f.type.startsWith('image/') || f.type.startsWith('video/') : f.type.startsWith(`${kind}/`);

  async function upload(files: File[]) {
    const chosen = files.filter(accepted);
    if (!chosen.length) {
      setError(kind === 'video' ? 'Solo se pueden subir videos aquí.' : kind === 'image' ? 'Solo se pueden subir imágenes aquí.' : 'Solo imágenes o videos.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      // The records exist right away; the bytes go on in the background (see the tray).
      const ids = await Promise.all(chosen.map((file) => startUpload(file, file.type.startsWith('video/') ? 'video' : 'image')));
      await qc.invalidateQueries({ queryKey: ['media'] });
      // What was just uploaded is what you came for: mark it.
      onSelectedChange(selectable === 'single' ? ids.slice(0, 1) : [...selected, ...ids]);
    } catch (e) {
      setError(e instanceof Error ? e.message : es.app.error);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(0);
    void upload(Array.from(e.dataTransfer.files ?? []));
  };

  return (
    <div
      className={cn('flex min-h-0 flex-col', className)}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging((n) => n + 1);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragging((n) => Math.max(0, n - 1))}
      onDrop={onDrop}
    >
      <div className="flex flex-none flex-wrap items-center gap-2.5 pb-3">
        <div className="relative min-w-[260px] flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar archivos"
            className="h-9 w-full rounded-lg border border-line-2 bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none"
          />
        </div>
        {onKindChange &&
          (['all', 'image', 'video'] as const).map((k) => (
            <Chip key={k} active={kind === k} onClick={() => onKindChange(k)}>
              {es.media[k]}
            </Chip>
          ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple={selectable === 'multi'}
        accept={kind === 'all' ? 'image/*,video/*' : `${kind}/*`}
        className="hidden"
        onChange={(e) => void upload(Array.from(e.target.files ?? []))}
      />
      <div
        className={cn(
          'mb-3 flex flex-none flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors',
          dragging > 0 ? 'border-accent bg-accent-tint/40' : 'border-line-2',
        )}
      >
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <UploadIcon className="mr-1.5 h-4 w-4" />
          {uploading ? es.app.uploading : 'Subir'}
        </Button>
        <p className="text-xs text-muted">
          {dragging > 0
            ? 'Suelta los archivos aquí'
            : kind === 'video'
              ? 'O arrastra videos de tu computadora'
              : kind === 'image'
                ? 'O arrastra imágenes de tu computadora'
                : 'O arrastra imágenes o videos de tu computadora'}
        </p>
        {error && <p className="text-xs text-accent-dark">{error}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted">{es.app.loading}</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <SearchIcon className="h-10 w-10 text-faint-2" />
            <p className="mt-2 text-lg font-semibold">{search ? 'Sin resultados' : 'La biblioteca está vacía'}</p>
            <p className="text-sm text-muted">
              {search ? 'Prueba con otro nombre, o sube un archivo nuevo.' : 'Sube el primer archivo.'}
            </p>
            <Button type="button" className="mt-2" disabled={uploading} onClick={() => inputRef.current?.click()}>
              <UploadIcon className="mr-2 h-4 w-4" />
              Subir
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,9.25rem)] justify-start gap-3">
            {items.map((m) => {
              const on = selected.includes(m.id);
              const up = uploads.find((u) => u.assetId === m.id);
              const pending = m.status === 'uploading' || m.status === 'processing' || (up && up.status !== 'done');
              return (
                <div
                  key={m.id}
                  className={cn('relative rounded-lg border p-2 transition-colors', on ? 'border-accent bg-accent-tint/30' : 'border-line-2')}
                >
                  <button
                    type="button"
                    onClick={() => toggle(m.id)}
                    className="relative block aspect-square w-full overflow-hidden rounded-md border border-line-3 bg-surface-2"
                    title={on ? 'Desmarcar' : 'Marcar'}
                  >
                    {pending ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
                        <span className="font-mono text-[11px] text-ink-2">
                          {up?.status === 'uploading' ? `Subiendo ${uploadPct(up)}%` : up?.status === 'error' ? 'Error' : up ? 'Procesando…' : 'Interrumpida'}
                        </span>
                        {up?.status === 'uploading' && (
                          <div className="h-1 w-full overflow-hidden rounded-full bg-line-2">
                            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${uploadPct(up)}%` }} />
                          </div>
                        )}
                      </div>
                    ) : m.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.viewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <video src={m.viewUrl} muted className="absolute inset-0 h-full w-full object-cover" />
                    )}
                  </button>
                  <label className="absolute left-3.5 top-3.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-line-2 bg-surface shadow-sm">
                    <input type="checkbox" checked={on} onChange={() => toggle(m.id)} className="h-3.5 w-3.5 accent-[var(--color-accent)]" aria-label={on ? 'Desmarcar' : 'Marcar'} />
                  </label>
                  <p className="mt-1.5 truncate text-center text-xs font-medium" title={m.name}>
                    {m.name}
                  </p>
                  <p className="truncate text-center text-[11px] text-muted">{fileType(m)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
