'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { Button } from '@/components/ui/button';
import { Thumb } from '@/components/ui/thumb';

/**
 * Upload + preview a single media asset (image or video) via presigned R2.
 * Holds only the asset id; the parent stores it on the entity.
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

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
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

  return (
    <div>
      <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{label}</div>
      <div className="flex items-center gap-3">
        <Thumb className="h-[70px] w-[112px] shrink-0 rounded-lg border border-line" ratio="auto">
          {viewUrl && kind === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          {viewUrl && kind === 'video' && (
            <video src={viewUrl} muted className="absolute inset-0 h-full w-full object-cover" />
          )}
        </Thumb>
        <div className="flex flex-col items-start gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept={kind === 'image' ? 'image/*' : 'video/*'}
            className="hidden"
            onChange={onFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? es.app.uploading : value ? es.app.change : es.app.upload}
          </Button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-ink-3 hover:text-accent-dark"
            >
              {es.app.remove}
            </button>
          )}
          {error && <span className="text-xs text-accent-dark">{error}</span>}
        </div>
      </div>
    </div>
  );
}
