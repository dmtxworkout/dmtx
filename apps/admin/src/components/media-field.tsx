'use client';

import { type DragEvent, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MediaAsset } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { MediaPicker } from '@/components/media-picker';
import { EyeIcon, MediaPreview } from '@/components/media-preview';
import { Dialog } from '@/components/ui/dialog';
import { FadeImg } from '@/components/ui/fade-img';
import { IconButton } from '@/components/ui/icon-button';
import { cancelUpload, formatBytes, isUploadDeclined, startUpload, uploadPct, useUpload } from '@/lib/uploads';

/**
 * A single media asset (image or video), the Shopify way: clicking the field
 * opens the library (which also uploads), a file dropped on it uploads
 * straight away, and on hover an eye shows it big (a video plays) and a trash
 * can takes it off. Holds only the id: a dropped file is handed to the
 * background upload queue and the field gets its id right away, so the form
 * can be saved (or left) while it uploads.
 */
export function MediaField({
  kind,
  label,
  value,
  onChange,
  onDuration,
  variant = 'card',
}: {
  kind: 'image' | 'video';
  label: string;
  value: string | null;
  onChange: (assetId: string | null) => void;
  /** Video only: the duration in seconds once Stream has read it (null when the video is removed). */
  onDuration?: (seconds: number | null) => void;
  /** `card`: the 16:9 box (forms). `bar`: one slim row (thumbnail, name, length) that sits above the rutina editor. */
  variant?: 'card' | 'bar';
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  // The field's asset while its bytes are still travelling (from the global queue).
  const entry = useUpload(value);
  const uploadState = entry?.status;
  const [starting, setStarting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Read through the shared cache (the preview reads the same key), so a day or section seen before
  // shows at once; re-read when its upload finishes, and every few seconds while Stream encodes.
  const inQueue = uploadState === 'uploading' || uploadState === 'processing';
  const view = useQuery({
    queryKey: ['media-view', value],
    queryFn: () => api.media.view(value!),
    enabled: !!value && !inQueue,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 5000 : false),
  });
  const info: MediaAsset | null = value && !inQueue ? (view.data ?? null) : null;
  // The id points at a file that is no longer in the library (deleted before deletes were refused while in use).
  // Only a 404 means the file is gone; anything else (offline, a 500) is not a verdict.
  const missing = !!value && !inQueue && view.isError && (view.error as { status?: number } | null)?.status === 404;
  // Waiting for the record: the field shows a skeleton, not an empty box.
  const loading = !!value && !inQueue && view.isPending && view.fetchStatus !== 'idle';
  // The callbacks are read through refs: callers pass fresh arrow functions
  // on every render, and an effect keyed on them would fire (and set state)
  // without end.
  const onChangeRef = useRef(onChange);
  const onDurationRef = useRef(onDuration);
  onChangeRef.current = onChange;
  onDurationRef.current = onDuration;
  // The duration comes from Stream once the video is ready.
  const duration = kind === 'video' && info?.status === 'ready' ? info.durationSeconds : undefined;
  useEffect(() => {
    if (duration !== undefined) onDurationRef.current?.(duration);
  }, [duration]);
  // A failed or cancelled upload took its record with it: the field lets go of the id.
  const gone = entry?.status === 'error' ? (entry.error ?? es.app.error) : entry?.status === 'cancelled' ? '' : null;
  useEffect(() => {
    if (gone === null) return;
    onChangeRef.current(null);
    onDurationRef.current?.(null);
    setError(gone || null);
  }, [gone]);

  async function upload(file: File) {
    const expected = kind === 'image' ? 'image/' : 'video/';
    if (!file.type.startsWith(expected)) {
      setError(kind === 'image' ? 'Debe ser una imagen' : 'Debe ser un video');
      return;
    }
    setError(null);
    setStarting(true);
    try {
      // The record exists as soon as this resolves; the bytes follow in the background.
      onChange(await startUpload(file, kind));
      onDuration?.(null);
    } catch (err) {
      if (!isUploadDeclined(err)) setError(err instanceof Error ? err.message : es.app.error);
    } finally {
      setStarting(false);
    }
  }
  const inFlight = starting || inQueue;
  // Not in flight here, but the record is not ready either: encoding at
  // Cloudflare (processing), broken (failed) or abandoned by a closed tab (uploading).
  const stalled = !!value && !inFlight && !!info && info.status !== 'ready' ? info.status : null;
  const ready = !inFlight && info?.status === 'ready' ? info : null;
  // A video shows its poster frame here (it plays in the preview); an image itself.
  const poster = ready ? (kind === 'video' ? ready.thumbnailUrl : ready.viewUrl) : null;
  const remove = () => {
    onChange(null);
    onDuration?.(null);
    setError(null);
  };

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }
  const openPicker = () => {
    if (!inFlight) setPickerOpen(true);
  };

  const what = kind === 'image' ? 'imagen' : 'video';
  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  const dialogs = (
    <>
      <MediaPicker
        kind={kind}
        open={pickerOpen}
        current={value}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => {
          if (id !== value) onDuration?.(null);
          onChange(id);
        }}
      />
      <Dialog open={previewOpen && !!ready} onClose={() => setPreviewOpen(false)} title="Vista previa" className="max-w-4xl md:h-[min(85vh,44rem)]">
        {ready && <MediaPreview asset={ready} className="min-h-0 flex-1 px-5 pb-5 pt-4" />}
      </Dialog>
    </>
  );
  const actions = value && !inFlight && (
    <div className="flex flex-none gap-1 opacity-0 transition-opacity group-hover/field:opacity-100 group-focus-within/field:opacity-100">
      {ready && (
        <IconButton
          label="Vista previa"
          onClick={(e) => {
            e.stopPropagation();
            setPreviewOpen(true);
          }}
          className="border-line-2 bg-surface text-ink shadow-sm hover:bg-surface"
        >
          <EyeIcon className="h-4 w-4" />
        </IconButton>
      )}
      <IconButton
        label="Quitar"
        onClick={(e) => {
          e.stopPropagation();
          remove();
        }}
        className="border-line-2 bg-surface text-ink shadow-sm hover:bg-surface hover:text-accent-dark"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
      </IconButton>
    </div>
  );

  if (variant === 'bar' && !value && !inFlight) {
    // Nothing yet: one quiet line, plainly optional (the written rutina is what most sections are); it still takes a drop.
    return (
      <div>
        <button
          type="button"
          onClick={openPicker}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          title="Una clase completa que el usuario puede seguir en lugar de la versión guiada"
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors',
            dragging ? 'bg-accent-tint/40 text-accent-dark ring-1 ring-accent' : 'text-ink-3 hover:bg-surface-3 hover:text-ink',
          )}
        >
          <span className="text-[15px] leading-none">+</span>
          {dragging ? 'Suelta el video aquí' : `Agregar ${label.toLowerCase()}`}
          <span className="text-muted">(opcional)</span>
        </button>
        {error && <p className="mt-1 px-2 text-xs text-accent-dark">{error}</p>}
        {dialogs}
      </div>
    );
  }

  if (variant === 'bar') {
    // One slim row: what the section's video is, or a dashed «Agregar video»; same clicks, drop and hover actions as the card.
    const title = inFlight
      ? entry?.cancelling
        ? 'Cancelando…'
        : entry?.status === 'uploading'
          ? `${es.app.uploading} ${uploadPct(entry)}%`
          : kind === 'video'
            ? 'Subido · Cloudflare está procesando el video…'
            : 'Procesando…'
      : missing
        ? `El ${what} ya no está en la biblioteca`
        : stalled === 'processing'
          ? 'Cloudflare está procesando el video…'
          : stalled === 'failed'
            ? 'Cloudflare no pudo procesar el video'
            : stalled
              ? 'La subida se interrumpió'
              : ready
                ? ready.name
                : value
                  ? ''
                  : `Agregar ${what}`;
    const sub = inFlight
      ? 'Puedes guardar y seguir trabajando mientras tanto.'
      : missing || stalled === 'failed' || stalled === 'uploading'
        ? `Haz clic para elegir ${kind === 'image' ? 'otra' : 'otro'} o quítalo.`
        : stalled === 'processing'
          ? 'Estará listo en unos minutos.'
          : ready
            ? [label, ready.durationSeconds ? mmss(ready.durationSeconds) : null, ready.sizeBytes ? formatBytes(ready.sizeBytes) : null].filter(Boolean).join(' · ')
            : value
              ? ''
              : `${label} · o arrastra un archivo aquí`;
    return (
      <div>
        <div
          role="button"
          tabIndex={0}
          aria-label={value ? `Cambiar el ${what}` : `Agregar ${what}`}
          onClick={openPicker}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openPicker())}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'group/field flex h-14 items-center gap-3 rounded-lg border px-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
            !inFlight && 'cursor-pointer',
            dragging
              ? 'border-accent bg-accent-tint/40'
              : missing || stalled === 'failed'
                ? 'border-dashed border-accent/50 bg-accent-tint/30'
                : value
                  ? 'border-line-2 bg-surface hover:bg-surface-2'
                  : 'border-dashed border-line-2 bg-surface hover:bg-surface-2',
          )}
        >
          <div className="relative flex h-10 w-[72px] flex-none items-center justify-center overflow-hidden rounded-md bg-surface-2">
            {loading ? (
              <span aria-hidden className="absolute inset-0 animate-pulse bg-line-2/60" />
            ) : poster ? (
              <>
                <FadeImg src={poster} />
                {kind === 'video' && (
                  <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-white/90">
                    <svg viewBox="0 0 24 24" className="ml-px h-2.5 w-2.5 text-ink" fill="currentColor" aria-hidden="true">
                      <path d="M8 5.5v13l11-6.5z" />
                    </svg>
                  </span>
                )}
              </>
            ) : inFlight ? (
              <span className="h-1 w-12 overflow-hidden rounded-full bg-line-2">
                <span
                  className={cn('block h-full rounded-full bg-accent', entry?.status !== 'uploading' && 'animate-pulse')}
                  style={{ width: `${entry && entry.status === 'uploading' ? uploadPct(entry) : 100}%` }}
                />
              </span>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted" aria-hidden="true">
                {value ? (
                  <>
                    <rect x="3" y="5" width="18" height="14" rx="3" />
                    <path d="m10 9 5 3-5 3z" />
                  </>
                ) : (
                  <>
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </>
                )}
              </svg>
            )}
          </div>
          {loading ? (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5" aria-label={es.app.loading}>
              <span className="h-3 w-40 max-w-full animate-pulse rounded bg-line-2/60" />
              <span className="h-2.5 w-28 max-w-full animate-pulse rounded bg-line-2/40" />
            </div>
          ) : (
          <div className="min-w-0 flex-1">
            <p className={cn('truncate text-[13px] font-semibold', missing || stalled === 'failed' ? 'text-accent-dark' : 'text-ink')} title={ready?.name}>
              {title}
            </p>
            <p className="truncate text-[11.5px] text-muted">{sub}</p>
          </div>
          )}
          {inFlight && entry && !entry.cancelling && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cancelUpload(entry.assetId);
              }}
              className="flex-none px-2 text-xs font-medium text-ink-3 hover:text-accent-dark"
            >
              {es.app.cancel}
            </button>
          )}
          {actions}
        </div>
        {error && <p className="mt-1.5 text-xs text-accent-dark">{error}</p>}
        {dialogs}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{label}</div>
      <div
        role="button"
        tabIndex={0}
        aria-label={value ? `Cambiar ${kind === 'image' ? 'la imagen' : 'el video'}` : `Elegir ${kind === 'image' ? 'una imagen' : 'un video'}`}
        onClick={openPicker}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openPicker())}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'group/field relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
          !inFlight && 'cursor-pointer',
          dragging
            ? 'border-accent bg-accent-tint/40'
            : poster
              ? 'border-line bg-black'
              : 'border-dashed border-line-2 bg-surface-3 hover:bg-surface-2',
        )}
      >
        {poster && <FadeImg src={poster} className={kind === 'video' ? 'opacity-90' : undefined} />}
        {ready && kind === 'video' && (
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-md">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 text-ink" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
        )}
        {!value && !inFlight && (
          <div className="px-4 text-xs text-muted">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="mx-auto mb-1.5 h-6 w-6 text-faint"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            <span className="font-semibold text-ink-2">Elegir {kind === 'image' ? 'una imagen' : 'un video'}</span>
            <br />o arrastra el archivo aquí
          </div>
        )}
        {loading && <div className="absolute inset-0 animate-pulse bg-surface-2" />}
        {missing && !inFlight && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 border border-dashed border-accent/50 bg-accent-tint/30 px-8 text-center text-sm font-medium text-accent-dark">
            <span>{kind === 'image' ? 'La imagen' : 'El video'} ya no está en la biblioteca</span>
            <span className="text-[11px] font-normal text-ink-3">
              Haz clic para elegir {kind === 'image' ? 'otra' : 'otro'} o quítalo con la papelera.
            </span>
          </div>
        )}
        {inFlight && (
          <div className="absolute inset-0 flex cursor-default flex-col items-center justify-center gap-2.5 bg-surface/90 px-8 text-sm font-medium text-ink-2">
            <span>
              {entry?.cancelling
                ? 'Cancelando…'
                : entry && entry.status === 'uploading'
                  ? `${es.app.uploading} ${uploadPct(entry)}%`
                  : entry?.status === 'processing' && kind === 'video'
                    ? 'Subido · Cloudflare está procesando el video…'
                    : 'Procesando…'}
            </span>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-line-2">
              <div
                className={cn('h-full rounded-full bg-accent transition-[width] duration-200', entry?.status !== 'uploading' && 'animate-pulse')}
                style={{ width: `${entry && entry.status === 'uploading' ? uploadPct(entry) : 100}%` }}
              />
            </div>
            {entry && entry.status === 'uploading' && (
              <span className="font-mono text-[11px] text-muted">
                {formatBytes(entry.loaded)} de {formatBytes(entry.total)}
              </span>
            )}
            <span className="text-[11px] font-normal text-muted">Puedes guardar y seguir trabajando mientras tanto.</span>
            {entry && !entry.cancelling && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelUpload(entry.assetId);
                }}
                className="text-xs font-medium text-ink-3 hover:text-accent-dark"
              >
                {es.app.cancel}
              </button>
            )}
          </div>
        )}
        {stalled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface/90 px-8 text-center text-sm font-medium text-ink-2">
            {stalled === 'processing' ? (
              <>
                <span>Cloudflare está procesando el video…</span>
                <span className="text-[11px] font-normal text-muted">Estará listo en unos minutos; puedes guardar mientras tanto.</span>
              </>
            ) : stalled === 'failed' ? (
              <>
                <span>Cloudflare no pudo procesar el video</span>
                <span className="text-[11px] font-normal text-muted">Quítalo y elige otro (MP4 H.264 suele funcionar).</span>
              </>
            ) : (
              <>
                <span>La subida se interrumpió</span>
                <span className="text-[11px] font-normal text-muted">Se cerró la pestaña antes de terminar. Quítalo y súbelo de nuevo.</span>
              </>
            )}
          </div>
        )}
        {/* On hover: look at it big, or take it off. */}
        {value && !inFlight && (
          <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover/field:opacity-100 group-focus-within/field:opacity-100">
            {ready && (
              <IconButton
                label="Vista previa"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewOpen(true);
                }}
                className="border-line-2 bg-surface text-ink shadow-sm hover:bg-surface"
              >
                <EyeIcon className="h-4 w-4" />
              </IconButton>
            )}
            <IconButton
              label="Quitar"
              onClick={(e) => {
                e.stopPropagation();
                remove();
              }}
              className="border-line-2 bg-surface text-ink shadow-sm hover:bg-surface hover:text-accent-dark"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </IconButton>
          </div>
        )}
      </div>

      {ready && (
        <div className="mt-1.5 truncate font-mono text-[11px] text-muted" title={ready.name}>
          {ready.name}
          {ready.sizeBytes ? ` · ${formatBytes(ready.sizeBytes)}` : ''}
          {ready.durationSeconds ? ` · ${Math.floor(ready.durationSeconds / 60)}:${String(ready.durationSeconds % 60).padStart(2, '0')}` : ''}
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-accent-dark">{error}</p>}

      {dialogs}
    </div>
  );
}
