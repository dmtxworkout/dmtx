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
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { isUploadDeclined, startUpload, uploadPct, useUploads, type UploadEntry } from '@/lib/uploads';
import { USAGE_LABEL, USAGE_PATH, usageFieldLabel } from '@/lib/media-usage';

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
  onOpen,
  layout = 'grid',
  className,
}: {
  /** The kinds shown. With `onKindChange`, the chips to switch are shown too. */
  kind: MediaKindFilter;
  onKindChange?: (kind: MediaKindFilter) => void;
  selectable: 'single' | 'multi';
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  /** With this, clicking a tile opens the file (the checkbox still marks it); without it, clicking marks. */
  onOpen?: (id: string) => void;
  /** Tiles (the picker) or Shopify-style rows with alt text, date, size, where each file is used and «Reemplazar». */
  layout?: 'grid' | 'table';
  className?: string;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  // «Reemplazar» on a row: the chosen file takes that asset's place (same id).
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<MediaAsset | null>(null);
  const [usageOpen, setUsageOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploads = useUploads();
  /** dragenter minus dragleave: children fire their own pairs. */
  const [dragging, setDragging] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['media', kind, search],
    queryFn: () => api.media.list({ kind: kind === 'all' ? undefined : kind, search: search || undefined, pageSize: 200 }),
    // While Stream encodes a video, the list asks again until it is ready.
    refetchInterval: (q) => (q.state.data?.data.some((m) => m.status === 'processing') ? 5000 : false),
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
      if (!isUploadDeclined(e)) setError(e instanceof Error ? e.message : es.app.error);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }
  async function replaceWith(file: File) {
    const target = replacing;
    setReplacing(null);
    if (!target) return;
    if (!file.type.startsWith(`${target.kind}/`)) {
      setError(target.kind === 'video' ? 'Un video solo se puede reemplazar por otro video.' : 'Una imagen solo se puede reemplazar por otra imagen.');
      return;
    }
    setError(null);
    try {
      await startUpload(file, target.kind, { replaceOf: target.id });
    } catch (e) {
      if (!isUploadDeclined(e)) setError(e instanceof Error ? e.message : es.app.error);
    } finally {
      if (replaceRef.current) replaceRef.current.value = '';
    }
  }
  const pendingLabel = (m: MediaAsset, up: UploadEntry | undefined) =>
    up?.cancelling
      ? 'Cancelando…'
      : up?.status === 'cancelled'
        ? 'Cancelada'
        : up?.status === 'uploading'
          ? `Subiendo ${uploadPct(up)}%`
          : up?.status === 'error' || m.status === 'failed'
            ? 'Error'
            : up || m.status === 'processing'
              ? 'Procesando…'
              : 'Interrumpida';
  const added = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  const sizeLabel = (n: number | null) => (n == null ? '—' : n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const allOn = items.length > 0 && items.every((m) => selected.includes(m.id));
  const someOn = items.some((m) => selected.includes(m.id));

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
        ref={replaceRef}
        type="file"
        accept={replacing ? `${replacing.kind}/*` : undefined}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void replaceWith(f);
        }}
      />
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
        ) : layout === 'table' ? (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="w-10">
                  <Checkbox
                    checked={allOn}
                    indeterminate={!allOn && someOn}
                    onChange={(v) => onSelectedChange(v ? items.map((m) => m.id) : [])}
                    label={allOn ? 'Desmarcar todos' : 'Marcar todos'}
                  />
                </TH>
                <TH>Archivo</TH>
                <TH>Texto alternativo</TH>
                <TH>Añadido</TH>
                <TH className="text-right">Peso</TH>
                <TH>Usos</TH>
                <TH className="w-12" />
              </TR>
            </THead>
            <TBody>
              {items.map((m) => {
                const on = selected.includes(m.id);
                const up = uploads.find((u) => u.assetId === m.id);
                const replacingThis = uploads.find((u) => u.replaceOf === m.id && (u.status === 'uploading' || u.status === 'processing'));
                const pending = m.status !== 'ready' || (up && up.status !== 'done');
                const usage = m.usage ?? [];
                return (
                  <TR key={m.id} className={cn('cursor-pointer', on && 'bg-accent-tint/30 hover:bg-accent-tint/30')} onClick={() => (onOpen ? onOpen(m.id) : toggle(m.id))}>
                    <TD onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={on} onChange={() => toggle(m.id)} label={on ? 'Desmarcar' : 'Marcar'} />
                    </TD>
                    <TD>
                      <div className="flex items-center gap-3">
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-line-3 bg-surface-2">
                          {!pending && m.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-semibold text-ink" title={m.name}>
                            {m.name}
                          </p>
                          <p className="font-mono text-[11px] text-muted">
                            {fileType(m)}
                            {pending ? ` · ${pendingLabel(m, up)}` : replacingThis ? ` · reemplazando ${replacingThis.status === 'uploading' ? `${uploadPct(replacingThis)}%` : '…'}` : ''}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD className="max-w-[260px] truncate text-[13px]">{m.kind === 'image' ? (m.altText ?? <span className="text-faint-2">—</span>) : <span className="text-faint-2">—</span>}</TD>
                    <TD className="whitespace-nowrap font-mono text-[12px]">{added(m.createdAt)}</TD>
                    <TD className="whitespace-nowrap text-right font-mono text-[12px]">{sizeLabel(m.sizeBytes)}</TD>
                    <TD onClick={(e) => e.stopPropagation()}>
                      {usage.length ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setUsageOpen((o) => (o === m.id ? null : m.id))}
                            className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-ink hover:bg-surface-3"
                          >
                            {usage.length} {usage.length === 1 ? 'uso' : 'usos'} ▾
                          </button>
                          {usageOpen === m.id && (
                            <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-line-2 bg-surface p-2 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
                              <ul className="flex flex-col gap-1">
                                {usage.map((u) => (
                                  <li key={`${u.type}-${u.id}-${u.field}`} className="text-[12.5px]">
                                    <Link href={`${USAGE_PATH[u.type]}/${u.id}`} className="font-medium text-accent hover:text-accent-dark">
                                      {u.name}
                                    </Link>
                                    <span className="text-muted">
                                      {' '}
                                      · {USAGE_LABEL[u.type]} · {usageFieldLabel(u.field)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-faint-2">—</span>
                      )}
                    </TD>
                    <TD onClick={(e) => e.stopPropagation()}>
                      {!pending && !replacingThis && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplacing(m);
                            // The input's accept follows `replacing`; open it on the next tick.
                            setTimeout(() => replaceRef.current?.click(), 0);
                          }}
                          className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-3 hover:bg-surface-3 hover:text-ink"
                          title={m.kind === 'video' ? 'Subir otro video en su lugar (las rutinas que lo usan lo verán)' : 'Subir otra imagen en su lugar (lo que la usa la verá)'}
                        >
                          Reemplazar
                        </button>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,9.25rem)] justify-start gap-3">
            {items.map((m) => {
              const on = selected.includes(m.id);
              const up = uploads.find((u) => u.assetId === m.id);
              const pending = m.status !== 'ready' || (up && up.status !== 'done');
              return (
                <div
                  key={m.id}
                  className={cn('relative rounded-lg border p-2 transition-colors', on ? 'border-accent bg-accent-tint/30' : 'border-line-2')}
                >
                  <button
                    type="button"
                    onClick={() => (onOpen ? onOpen(m.id) : toggle(m.id))}
                    className="relative block aspect-square w-full overflow-hidden rounded-md border border-line-3 bg-surface-2"
                    title={onOpen ? 'Abrir' : on ? 'Desmarcar' : 'Marcar'}
                  >
                    {pending ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
                        <span className="font-mono text-[11px] text-ink-2">{pendingLabel(m, up)}</span>
                        {up?.status === 'uploading' && (
                          <div className="h-1 w-full overflow-hidden rounded-full bg-line-2">
                            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${uploadPct(up)}%` }} />
                          </div>
                        )}
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.thumbnailUrl ?? undefined} alt="" className="absolute inset-0 h-full w-full object-cover" />
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
