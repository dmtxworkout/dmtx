'use client';

import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react';
import type { MediaStatus } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { MediaPicker } from '@/components/media-picker';
import { cancelUpload, formatBytes, isUploadDeclined, startUpload, uploadPct, useUpload } from '@/lib/uploads';

interface Info {
  name: string;
  sizeBytes: number | null;
  status: MediaStatus;
  /** Image: the delivery URL; video: Stream's player (iframe). Null until ready. */
  url: string | null;
  durationSeconds: number | null;
}

/**
 * Upload + preview a single media asset (image or video), or pick an existing
 * one from the library. Supports click and drag-and-drop. Holds only the id:
 * a dropped file is handed to the background upload queue and the field gets
 * its id right away, so the form can be saved (or left) while it uploads. A
 * video is played through Cloudflare Stream's player once it is encoded.
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
  /** Video only: the duration in seconds once Stream has read it (null when the video is removed). */
  onDuration?: (seconds: number | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<Info | null>(null);
  // The field's asset while its bytes are still travelling (from the global queue).
  const entry = useUpload(value);
  const uploadState = entry?.status;
  const [starting, setStarting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Re-read when the asset changes and again when its upload finishes or
  // fails; a video Stream is still encoding is asked again every few seconds.
  const inQueue = uploadState === 'uploading' || uploadState === 'processing';
  useEffect(() => {
    if (!value || inQueue) {
      if (!value) setInfo(null);
      return;
    }
    let alive = true;
    let timer: number | undefined;
    const read = () => {
      api.media
        .view(value)
        .then((a) => {
          if (!alive) return;
          setInfo({
            name: a.name,
            sizeBytes: a.sizeBytes,
            status: a.status,
            url: a.status === 'ready' ? (a.kind === 'video' ? a.embedUrl : a.viewUrl) : null,
            durationSeconds: a.durationSeconds,
          });
          if (a.status === 'processing') timer = window.setTimeout(read, 5000);
        })
        .catch(() => alive && setInfo(null));
    };
    read();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [value, inQueue]);
  // The duration comes from Stream once the video is ready.
  const duration = kind === 'video' && info?.status === 'ready' ? info.durationSeconds : undefined;
  useEffect(() => {
    if (duration !== undefined) onDuration?.(duration);
  }, [duration, onDuration]);
  // A failed or cancelled upload took its record with it: the field lets go of the id.
  const gone = entry?.status === 'error' ? (entry.error ?? es.app.error) : entry?.status === 'cancelled' ? '' : null;
  useEffect(() => {
    if (gone === null) return;
    onChange(null);
    onDuration?.(null);
    setError(gone || null);
  }, [gone, onChange, onDuration]);

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
  const url = !inFlight && info?.status === 'ready' ? info.url : null;
  const hasVideo = kind === 'video' && !!url;

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
            : url
              ? hasVideo
                ? 'border-line bg-black'
                : 'border-line'
              : 'border-dashed border-line-2 bg-surface-3 hover:bg-surface-2',
        )}
      >
        {url && kind === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {url && kind === 'video' && (
          // Stream's player: plays the encoded HLS right here, so what was uploaded can be checked without leaving the form.
          <iframe
            key={url}
            src={url}
            title={info?.name ?? 'Video'}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
        {!url && !inFlight && !stalled && (
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
                <span className="text-[11px] font-normal text-muted">Quita el archivo y sube otro (MP4 H.264 suele funcionar).</span>
              </>
            ) : (
              <>
                <span>La subida se interrumpió</span>
                <span className="text-[11px] font-normal text-muted">Se cerró la pestaña antes de terminar. Quita el archivo y súbelo de nuevo.</span>
              </>
            )}
          </div>
        )}
      </div>

      {hasVideo && info && (
        <div className="mt-1.5 truncate font-mono text-[11px] text-muted" title={info.name}>
          {info.name}
          {info.sizeBytes ? ` · ${formatBytes(info.sizeBytes)}` : ''}
          {info.durationSeconds ? ` · ${Math.floor(info.durationSeconds / 60)}:${String(info.durationSeconds % 60).padStart(2, '0')}` : ''}
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
