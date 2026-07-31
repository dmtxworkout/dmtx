'use client';

import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';

/**
 * Upload + preview a single media asset (image or video) via presigned R2.
 * Supports click-to-pick and drag-and-drop. Holds only the asset id.
 */
export function MediaField({
  kind,
  label,
  value,
  onChange,
}: {
  kind: 'image' | 'video';
  label: string;
  value: string | null;
  onChange: (assetId: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (value) {
      api.media
        .view(value)
        .then((a) => alive && setViewUrl(a.viewUrl))
        .catch(() => alive && setViewUrl(null));
    } else {
      setViewUrl(null);
    }
    return () => {
      alive = false;
    };
  }, [value]);

  async function upload(file: File) {
    const expected = kind === 'image' ? 'image/' : 'video/';
    if (!file.type.startsWith(expected)) {
      setError(kind === 'image' ? 'Debe ser una imagen' : 'Debe ser un video');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const result = await api.media.upload(file, kind);
      onChange(result.assetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : es.app.error);
    } finally {
      setUploading(false);
    }
  }

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
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
          dragging
            ? 'border-accent bg-accent-tint/40'
            : viewUrl
              ? 'border-line'
              : 'border-dashed border-line-2 bg-surface-3 hover:bg-surface-2',
        )}
      >
        {viewUrl && kind === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {viewUrl && kind === 'video' && (
          <video src={viewUrl} muted className="absolute inset-0 h-full w-full object-cover" />
        )}
        {!viewUrl && !uploading && (
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
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/80 text-sm font-medium text-ink-2">
            {es.app.uploading}
          </div>
        )}
      </div>
      {(value || error) && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          {value && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-ink-3 hover:text-ink"
            >
              {es.app.change}
            </button>
          )}
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-ink-3 hover:text-accent-dark"
            >
              {es.app.remove}
            </button>
          )}
          {error && <span className="text-accent-dark">{error}</span>}
        </div>
      )}
    </div>
  );
}
