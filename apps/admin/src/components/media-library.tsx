'use client';

// The media library the way Shopify (and the vivero admin) lay it out: search
// on top, a dashed "Subir" zone, square tiles with a checkbox and the file's
// name and type underneath. Dropping files anywhere on it uploads them. Used
// by the Biblioteca page (multi-select, delete) and by the picker dialog
// (single select, Listo).
import { type DragEvent, type RefObject, useImperativeHandle, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MediaAsset, MediaFolder } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  isActiveUpload,
  isUploadDeclined,
  startUpload,
  uploadPct,
  useUploads,
  type UploadEntry,
} from '@/lib/uploads';
import { USAGE_LABEL_PLURAL, USAGE_PATH, usageFieldLabel } from '@/lib/media-usage';
import { FolderIcon } from '@/components/folder-picker';
import { IconButton } from '@/components/ui/icon-button';
import { Popover } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { EyeIcon, MediaPreview } from '@/components/media-preview';

export type MediaKindFilter = 'all' | 'image' | 'video';

const ReplaceIcon = ({ className }: { className?: string }) => (
  // Two curved arrows (swap): the file is exchanged for another.
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);
const PencilIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const TrashIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);
const LinkIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
  </svg>
);

/** «N usos» with the list in a popover at the document root (a scrolling table cannot clip it): grouped by kind of content, each a row that opens it. */
function UsageCell({
  id,
  usage,
  open,
  onToggle,
  onClose,
}: {
  id: string;
  usage: NonNullable<MediaAsset['usage']>;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const groups = (['program', 'workout', 'exercise', 'skill', 'skillLevel', 'collection'] as const)
    .map((type) => [type, usage.filter((u) => u.type === type)] as const)
    .filter(([, items]) => items.length);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={onToggle}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-[12px] font-medium text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
          open
            ? 'border-line-2 bg-surface-2'
            : 'border-transparent hover:border-line-2 hover:bg-surface',
        )}
        aria-expanded={open}
        aria-controls={`usage-${id}`}
      >
        {usage.length} {usage.length === 1 ? 'uso' : 'usos'}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3 text-ink-3"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <Popover anchor={ref} onClose={onClose} width={300}>
          <div id={`usage-${id}`} className="flex flex-col">
            {groups.map(([type, items]) => (
              <div key={type} className="py-1">
                <div className="px-2 pb-1 pt-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-2">
                  {USAGE_LABEL_PLURAL[type]}
                </div>
                {items.map((u) => (
                  <Link
                    key={`${u.id}-${u.field}`}
                    href={`${USAGE_PATH[u.type]}/${u.id}`}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[13px] text-ink hover:bg-surface-2"
                  >
                    <span className="truncate font-medium">{u.name}</span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted">
                      {usageFieldLabel(u.field)}
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

/** "JPG", "MP4": from the file's extension; else its kind. */
export function fileType(m: MediaAsset): string {
  const ext = m.name.split('.').pop();
  if (ext && ext.length <= 5 && ext !== m.name) return ext.toUpperCase();
  return m.kind === 'image' ? es.media.image : es.media.video;
}

const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
const UploadIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
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
  uploadRef,
  folder,
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
  /** Lets the page put the «Subir» button where it wants (the header): `current.upload()` opens the file dialog. */
  uploadRef?: RefObject<{ upload: () => void } | null>;
  /** Browsing by folder (table only): the open folder, every folder (for its subfolders), and what to do with them. */
  folder?: {
    id: string | null;
    all: MediaFolder[];
    onOpen: (id: string) => void;
    onRename: (f: MediaFolder) => void;
    onDelete: (f: MediaFolder) => void;
    /** Folders marked for a bulk action, beside the files. */
    selected: string[];
    onSelectedChange: (ids: string[]) => void;
  };
  className?: string;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(uploadRef, () => ({ upload: () => inputRef.current?.click() }), []);
  // «Reemplazar» on a row: the chosen file takes that asset's place (same id).
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<MediaAsset | null>(null);
  const [usageOpen, setUsageOpen] = useState<string | null>(null);
  // The picker's «Vista previa»: the file shown big beside the grid (the eye on a tile), with ← → through the list.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploads = useUploads();
  /** dragenter minus dragleave: children fire their own pairs. */
  const [dragging, setDragging] = useState(0);

  // Inside a folder the list is that folder's; a search spans the whole library.
  const folderKey = folder ? (folder.id ?? 'root') : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['media', kind, search, folderKey ?? 'all'],
    queryFn: () =>
      api.media.list({
        kind: kind === 'all' ? undefined : kind,
        search: search || undefined,
        folder: search ? undefined : folderKey,
        pageSize: 200,
      }),
    // While Stream encodes a video, the list asks again until it is ready.
    refetchInterval: (q) =>
      q.state.data?.data.some((m) => m.status === 'processing') ? 5000 : false,
  });
  const items = data?.data ?? [];

  const toggle = (id: string) => {
    if (selected.includes(id)) onSelectedChange(selected.filter((x) => x !== id));
    else onSelectedChange(selectable === 'single' ? [id] : [...selected, id]);
  };

  const accepted = (f: File) =>
    kind === 'all'
      ? f.type.startsWith('image/') || f.type.startsWith('video/')
      : f.type.startsWith(`${kind}/`);

  async function upload(files: File[]) {
    const chosen = files.filter(accepted);
    if (!chosen.length) {
      setError(
        kind === 'video'
          ? 'Solo se pueden subir videos aquí.'
          : kind === 'image'
            ? 'Solo se pueden subir imágenes aquí.'
            : 'Solo imágenes o videos.',
      );
      return;
    }
    setUploading(true);
    setError(null);
    try {
      // The records exist right away; the bytes go on in the background (see the tray).
      const ids = await Promise.all(
        chosen.map((file) =>
          startUpload(file, file.type.startsWith('video/') ? 'video' : 'image', {
            folderId: folder?.id ?? null,
          }).then(async (id) => {
            // Each file's row replaces its placeholder as soon as its record exists, not when the whole batch has.
            await qc.invalidateQueries({ queryKey: ['media'] });
            return id;
          }),
        ),
      );
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
      setError(
        target.kind === 'video'
          ? 'Un video solo se puede reemplazar por otro video.'
          : 'Una imagen solo se puede reemplazar por otra imagen.',
      );
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
  // Files just dropped here that the list does not have yet: no record (preparing) or one
  // the list has not refetched. They show as placeholder rows so a drop answers at once.
  const placeholders = uploads.filter(
    (u) =>
      isActiveUpload(u) &&
      !u.replaceOf &&
      (u.folderId ?? null) === (folder?.id ?? null) &&
      !items.some((m) => m.id === u.assetId),
  );
  const placeholderLabel = (u: UploadEntry) =>
    u.cancelling ? 'Cancelando…' : u.status === 'uploading' ? `Subiendo ${uploadPct(u)}%` : u.status === 'processing' ? 'Procesando…' : 'Preparando…';
  const placeholderType = (u: UploadEntry) => {
    const ext = u.name.split('.').pop();
    return ext && ext.length <= 5 && ext !== u.name ? ext.toUpperCase() : u.kind === 'image' ? es.media.image : es.media.video;
  };
  const previewable = items.filter((m) => m.status === 'ready');
  const previewIndex = previewable.findIndex((m) => m.id === previewId);
  const previewAsset = previewIndex >= 0 ? previewable[previewIndex]! : null;
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
  const added = (iso: string) =>
    new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  const sizeLabel = (n: number | null) =>
    n == null
      ? '—'
      : n >= 1073741824
        ? `${(n / 1073741824).toFixed(2)} GB`
        : n >= 1048576
          ? `${(n / 1048576).toFixed(1)} MB`
          : `${Math.max(1, Math.round(n / 1024))} KB`;
  const folderSelected = folder?.selected ?? [];
  const setFolderSelected = folder?.onSelectedChange ?? (() => undefined);
  // Subfolders of the open folder (not while searching: a search is about files).
  const subfolders =
    folder && !search
      ? folder.all
          .filter((f) => f.parentId === (folder.id ?? null))
          .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      : [];
  // «Marcar todos» covers the files and the folders on screen.
  const total = items.length + subfolders.length;
  const marked =
    items.filter((m) => selected.includes(m.id)).length +
    subfolders.filter((f) => folderSelected.includes(f.id)).length;
  const allOn = total > 0 && marked === total;
  const someOn = marked > 0;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(0);
    void upload(Array.from(e.dataTransfer.files ?? []));
  };

  return (
    <div
      className={cn('relative flex min-h-0 flex-col', className)}
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
        {/* With the preview open the drop zone folds away (Shopify): «Subir» moves up here and the whole browser takes a drop. */}
        {layout === 'grid' && previewAsset && (
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <UploadIcon className="mr-1.5 h-4 w-4" />
            {uploading ? es.app.uploading : 'Subir'}
          </Button>
        )}
        {(layout === 'table' || previewAsset) && error && <p className="text-xs text-accent-dark">{error}</p>}
      </div>
      {/* The table has no drop zone of its own: the whole list takes a drop, like Shopify. */}
      {(layout === 'table' || previewAsset) && dragging > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-tint/70">
          <p className="rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-ink shadow">
            Suelta los archivos para subirlos
          </p>
        </div>
      )}

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
      {layout === 'grid' && !previewAsset && (
        <div
          className={cn(
            'mb-3 flex flex-none flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors',
            dragging > 0 ? 'border-accent bg-accent-tint/40' : 'border-line-2',
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
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
      )}

      <div className="flex min-h-0 flex-1 gap-5">
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted">{es.app.loading}</p>
        ) : items.length === 0 && subfolders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <SearchIcon className="h-10 w-10 text-faint-2" />
            <p className="mt-2 text-lg font-semibold">
              {search
                ? 'Sin resultados'
                : folder?.id
                  ? 'Esta carpeta está vacía'
                  : 'La biblioteca está vacía'}
            </p>
            <p className="text-sm text-muted">
              {search
                ? 'Prueba con otro nombre, o sube un archivo nuevo.'
                : folder?.id
                  ? 'Arrastra archivos aquí o súbelos; también puedes mover otros a esta carpeta.'
                  : 'Sube el primer archivo.'}
            </p>
            <Button
              type="button"
              className="mt-2"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
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
                    onChange={(v) => {
                      onSelectedChange(v ? items.map((m) => m.id) : []);
                      setFolderSelected(v ? subfolders.map((f) => f.id) : []);
                    }}
                    label={allOn ? 'Desmarcar todos' : 'Marcar todos'}
                  />
                </TH>
                <TH>{search && folder ? 'Archivo · en toda la biblioteca' : 'Archivo'}</TH>
                <TH>Texto alternativo</TH>
                <TH>Añadido</TH>
                <TH className="text-right">Peso</TH>
                <TH>Usos</TH>
                <TH className="w-24" />
              </TR>
            </THead>
            <TBody>
              {subfolders.map((f) => (
                <TR
                  key={`folder-${f.id}`}
                  className={cn(
                    'group cursor-pointer',
                    folderSelected.includes(f.id) && 'bg-accent-tint/30 hover:bg-accent-tint/30',
                  )}
                  onClick={() => folder?.onOpen(f.id)}
                >
                  <TD onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={folderSelected.includes(f.id)}
                      onChange={(v) =>
                        setFolderSelected(
                          v ? [...folderSelected, f.id] : folderSelected.filter((x) => x !== f.id),
                        )
                      }
                      label={folderSelected.includes(f.id) ? 'Desmarcar carpeta' : 'Marcar carpeta'}
                    />
                  </TD>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent-tint/60">
                        <FolderIcon className="h-5 w-5 text-accent-dark" />
                      </div>
                      <p className="truncate text-[13.5px] font-semibold text-ink">{f.name}</p>
                    </div>
                  </TD>
                  <TD className="text-faint-2">—</TD>
                  <TD className="whitespace-nowrap font-mono text-[12px]">{added(f.createdAt)}</TD>
                  <TD className="text-right text-faint-2">—</TD>
                  <TD className="text-faint-2">—</TD>
                  <TD onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <IconButton
                        label="Renombrar carpeta"
                        onClick={() => folder?.onRename(f)}
                      >
                        <PencilIcon className="h-[17px] w-[17px]" />
                      </IconButton>
                      <IconButton
                        label="Eliminar carpeta"
                        onClick={() => folder?.onDelete(f)}
                      >
                        <TrashIcon className="h-[17px] w-[17px]" />
                      </IconButton>
                    </div>
                  </TD>
                </TR>
              ))}
              {placeholders.map((u) => (
                <TR key={u.assetId} className="cursor-default">
                  <TD>
                    <span className="block h-4 w-4 rounded border border-line-2 bg-surface-2 opacity-60" aria-hidden />
                  </TD>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 shrink-0 rounded-md border border-line-3 bg-surface-2" />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-ink" title={u.name}>
                          {u.name}
                        </p>
                        <p className="font-mono text-[11px] text-muted">
                          {placeholderType(u)} · {placeholderLabel(u)}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD className="text-faint-2">—</TD>
                  <TD className="whitespace-nowrap font-mono text-[12px]">{added(new Date().toISOString())}</TD>
                  <TD className="whitespace-nowrap text-right font-mono text-[12px]">{sizeLabel(u.total)}</TD>
                  <TD className="text-faint-2">—</TD>
                  <TD />
                </TR>
              ))}
              {items.map((m) => {
                const on = selected.includes(m.id);
                const up = uploads.find((u) => u.assetId === m.id);
                const replacingThis = uploads.find(
                  (u) =>
                    u.replaceOf === m.id && (u.status === 'uploading' || u.status === 'processing'),
                );
                const pending = m.status !== 'ready' || (up && up.status !== 'done');
                const usage = m.usage ?? [];
                return (
                  <TR
                    key={m.id}
                    className={cn(
                      'group cursor-pointer',
                      on && 'bg-accent-tint/30 hover:bg-accent-tint/30',
                    )}
                    onClick={() => (onOpen ? onOpen(m.id) : toggle(m.id))}
                  >
                    <TD onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={on}
                        onChange={() => toggle(m.id)}
                        label={on ? 'Desmarcar' : 'Marcar'}
                      />
                    </TD>
                    <TD>
                      <div className="flex items-center gap-3">
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-line-3 bg-surface-2">
                          {!pending && m.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.thumbnailUrl}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="truncate text-[13.5px] font-semibold text-ink"
                            title={m.name}
                          >
                            {m.name}
                          </p>
                          <p className="font-mono text-[11px] text-muted">
                            {fileType(m)}
                            {pending
                              ? ` · ${pendingLabel(m, up)}`
                              : replacingThis
                                ? ` · reemplazando ${replacingThis.status === 'uploading' ? `${uploadPct(replacingThis)}%` : '…'}`
                                : ''}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD className="max-w-[260px] truncate text-[13px]">
                      {m.kind === 'image' ? (
                        (m.altText ?? <span className="text-faint-2">—</span>)
                      ) : (
                        <span className="text-faint-2">—</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap font-mono text-[12px]">
                      {added(m.createdAt)}
                    </TD>
                    <TD className="whitespace-nowrap text-right font-mono text-[12px]">
                      {sizeLabel(m.sizeBytes)}
                    </TD>
                    <TD onClick={(e) => e.stopPropagation()}>
                      {usage.length ? (
                        <UsageCell
                          id={m.id}
                          usage={usage}
                          open={usageOpen === m.id}
                          onToggle={() => setUsageOpen((o) => (o === m.id ? null : m.id))}
                          onClose={() => setUsageOpen(null)}
                        />
                      ) : (
                        <span className="text-faint-2">—</span>
                      )}
                    </TD>
                    <TD onClick={(e) => e.stopPropagation()}>
                      {/* Row actions: icons that name themselves on hover, shown when the row is hovered. */}
                      <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {!pending && !replacingThis && (
                          <IconButton
                            label={m.kind === 'video' ? 'Reemplazar video' : 'Reemplazar imagen'}
                            onClick={() => {
                              setReplacing(m);
                              // The input's accept follows `replacing`; open it on the next tick.
                              setTimeout(() => replaceRef.current?.click(), 0);
                            }}
                          >
                            <ReplaceIcon className="h-[17px] w-[17px]" />
                          </IconButton>
                        )}
                        {!pending && m.status === 'ready' && (
                          <IconButton
                            label="Copiar enlace"
                            onClick={() => {
                              void navigator.clipboard
                                .writeText(api.media.publicUrl(m.id))
                                .then(() => toast('Enlace copiado'));
                            }}
                          >
                            <LinkIcon className="h-[17px] w-[17px]" />
                          </IconButton>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,9.25rem)] justify-start gap-3">
            {placeholders.map((u) => (
              <div key={u.assetId} className="relative rounded-lg border border-line-2 p-2">
                <div className="relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-md border border-line-3 bg-surface-2 px-3 text-center">
                  <span className="font-mono text-[11px] text-ink-2">{placeholderLabel(u)}</span>
                  {u.status === 'uploading' && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-line-2">
                      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${uploadPct(u)}%` }} />
                    </div>
                  )}
                </div>
                <p className="mt-1.5 truncate text-[12px] font-semibold text-ink" title={u.name}>
                  {u.name}
                </p>
                <p className="font-mono text-[10.5px] text-muted">{placeholderType(u)}</p>
              </div>
            ))}
            {items.map((m) => {
              const on = selected.includes(m.id);
              const up = uploads.find((u) => u.assetId === m.id);
              const pending = m.status !== 'ready' || (up && up.status !== 'done');
              return (
                <div
                  key={m.id}
                  className={cn(
                    'group/tile relative rounded-lg border p-2 transition-colors',
                    on ? 'border-accent bg-accent-tint/30' : previewId === m.id ? 'border-ink-3' : 'border-line-2',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => (onOpen ? onOpen(m.id) : toggle(m.id))}
                    className="relative block aspect-square w-full overflow-hidden rounded-md border border-line-3 bg-surface-2"
                    title={onOpen ? 'Abrir' : on ? 'Desmarcar' : 'Marcar'}
                  >
                    {pending ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
                        <span className="font-mono text-[11px] text-ink-2">
                          {pendingLabel(m, up)}
                        </span>
                        {up?.status === 'uploading' && (
                          <div className="h-1 w-full overflow-hidden rounded-full bg-line-2">
                            <div
                              className="h-full rounded-full bg-accent transition-[width]"
                              style={{ width: `${uploadPct(up)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.thumbnailUrl ?? undefined}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                  </button>
                  {!pending && !onOpen && (
                    <button
                      type="button"
                      onClick={() => setPreviewId(previewId === m.id ? null : m.id)}
                      aria-label="Vista previa"
                      title="Vista previa"
                      className={cn(
                        'absolute right-3.5 top-[108px] flex h-6 w-6 items-center justify-center rounded-md shadow-sm transition-opacity',
                        previewId === m.id ? 'bg-accent text-white opacity-100' : 'bg-ink/80 text-white opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100',
                      )}
                    >
                      <EyeIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <label className="absolute left-3.5 top-3.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-line-2 bg-surface shadow-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(m.id)}
                      className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                      aria-label={on ? 'Desmarcar' : 'Marcar'}
                    />
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
      {layout === 'grid' && previewAsset && (
        <aside className="flex w-[min(46%,30rem)] flex-none flex-col border-l border-line-3 pb-3 pl-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-ink">Vista previa</h3>
            <div className="flex items-center gap-1">
              <IconButton label="Anterior" disabled={previewIndex <= 0} onClick={() => setPreviewId(previewable[previewIndex - 1]?.id ?? null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </IconButton>
              <IconButton
                label="Siguiente"
                disabled={previewIndex >= previewable.length - 1}
                onClick={() => setPreviewId(previewable[previewIndex + 1]?.id ?? null)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </IconButton>
              <IconButton label="Cerrar vista previa" onClick={() => setPreviewId(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </IconButton>
            </div>
          </div>
          <MediaPreview asset={previewAsset} className="min-h-0 flex-1" />
        </aside>
      )}
      </div>
    </div>
  );
}
