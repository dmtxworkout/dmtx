'use client';

import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react';
import type { MediaStatus } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { MediaPicker } from '@/components/media-picker';
import { formatBytes, startUpload, uploadPct, useUpload } from '@/lib/uploads';

/**
 * Upload + preview a single media asset (image or video), or pick an existing
 * one from the library. Supports click and drag-and-drop. Holds only the id:
 * a dropped file is handed to the background upload queue and the field gets
 * its id right away, so the form can be saved (or left) while it uploads.
 */
export function MediaField({
  kind,
  label,
  value,
  onChange,
  onDuration,
}: {
  kind: 'image' | 'video';
  label: string;
  value: string | null;
  onChange: (assetId: string | null) => void;
  /** Video only: the duration in seconds once the file's metadata loads (null when the video is removed). */
  onDuration?: (seconds: number | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  // Name, size and status of the current file, shown under a video so a heavy one is obvious.
  const [info, setInfo] = useState<{ name: string; sizeBytes: number | null; status: MediaStatus } | null>(null);
  // The field's asset while its bytes are still travelling (from the global queue).
  const entry = useUpload(value);
  const uploadState = entry?.status;
  const [starting, setStarting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Re-read when the asset changes and again when its upload finishes or fails.
  useEffect(() => {
    let alive = true;
    if (value && uploadState !== 'uploading' && uploadState !== 'processing') {
      api.media
        .view(value)
        .then((a) => {
          if (!alive) return;
          setViewUrl(a.status === 'ready' || a.status === 'uploaded' ? a.viewUrl : null);
          setInfo({ name: a.name, sizeBytes: a.sizeBytes, status: a.status });
        })
        .catch(() => alive && setViewUrl(null));
    } else {
      setViewUrl(null);
      if (!value) setInfo(null);
    }
    return () => {
      alive = false;
    };
  }, [value, uploadState]);
  // A failed upload took its record with it: the field lets go of the id.
  const entryError = entry?.status === 'error' ? (entry.error ?? es.app.error) : null;
  useEffect(() => {
    if (!entryError) return;
    onChange(null);
    onDuration?.(null);
    setError(entryError);
  }, [entryError, onChange, onDuration]);

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
      setError(err instanceof Error ? err.message : es.app.error);
    } finally {
      setStarting(false);
    }
  }
  const inFlight = starting || uploadState === 'uploading' || uploadState === 'processing';
  // The record says "uploading" but nothing is in flight here: the tab that was sending it is gone.
  const orphan = !!value && !inFlight && !!info && info.status === 'uploading';
  const hasVideo = kind === 'video' && !!viewUrl;

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void upload(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  return (
    <div>
      <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{label}</div>
      <input
        ref={inputRef}
        type="file"
        accept={kind === 'image' ? 'image/*' : 'video/*'}
        className="hidden"
        onChange={onInput}
      />
      <div
        role={hasVideo ? undefined : 'button'}
        tabIndex={hasVideo ? undefined : 0}
        onClick={hasVideo ? undefined : () => inputRef.current?.click()}
        onKeyDown={hasVideo ? undefined : (e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
          !hasVideo && 'cursor-pointer',
          dragging
            ? 'border-accent bg-accent-tint/40'
            : viewUrl
              ? hasVideo
                ? 'border-line bg-black'
                : 'border-line'
              : 'border-dashed border-line-2 bg-surface-3 hover:bg-surface-2',
        )}
      >
        {viewUrl && kind === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {viewUrl && kind === 'video' && (
          // Playable right here, so what was uploaded can be checked without leaving the form.
          <video
            key={viewUrl}
            src={viewUrl}
            controls
            preload="metadata"
            playsInline
            onLoadedMetadata={(e) => onDuration?.(Number.isFinite(e.currentTarget.duration) ? Math.round(e.currentTarget.duration) : null)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
        {!viewUrl && !inFlight && !orphan && (
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M17 8l-5-5-5 5" />
              <path d="M12 3v12" />
            </svg>
            Arrastra {kind === 'image' ? 'una imagen' : 'un video'} aquí
            <br />o haz clic para subir
          </div>
        )}
        {inFlight && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-surface/90 px-8 text-sm font-medium text-ink-2">
            <span>{entry && entry.status === 'uploading' ? `${es.app.uploading} ${uploadPct(entry)}%` : 'Procesando…'}</span>
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
          </div>
        )}
        {orphan && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface/90 px-8 text-center text-sm font-medium text-ink-2">
            <span>La subida se interrumpió</span>
            <span className="text-[11px] font-normal text-muted">Se cerró la pestaña antes de terminar. Quita el archivo y súbelo de nuevo.</span>
          </div>
        )}
      </div>

      {hasVideo && info && (
        <div className="mt-1.5 truncate font-mono text-[11px] text-muted" title={info.name}>
          {info.name}
          {info.sizeBytes ? ` · ${formatBytes(info.sizeBytes)}` : ''}
          {info.sizeBytes && info.sizeBytes > 524288000 ? ' · pesado: tardará en subir y en cargar en la app' : ''}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {hasVideo && (
          <button type="button" onClick={() => inputRef.current?.click()} className="font-medium text-accent hover:text-accent-dark">
            Subir otro video
          </button>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="font-medium text-accent hover:text-accent-dark"
        >
          {es.media.library}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              onDuration?.(null);
            }}
            className="text-ink-3 hover:text-accent-dark"
          >
            {es.app.remove}
          </button>
        )}
        {error && <span className="text-accent-dark">{error}</span>}
      </div>

      <MediaPicker
        kind={kind}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => onChange(id)}
      />
    </div>
  );
}
