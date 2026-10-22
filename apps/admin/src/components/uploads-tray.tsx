'use client';

// The uploads in flight, bottom right, like a mail client's outbox: one row
// per file with its bar. Finished ones fade out on their own, failed ones stay
// until dismissed. While anything is uploading, reloading or closing the tab
// asks first (that is the only way to lose an upload).
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { dismissUpload, formatBytes, uploadPct, useUploads } from '@/lib/uploads';

export function UploadsTray() {
  const uploads = useUploads();
  const qc = useQueryClient();
  const active = uploads.some((u) => u.status === 'uploading' || u.status === 'processing');
  useEffect(() => {
    if (!active) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [active]);
  // Whatever shows media (library, pickers, thumbs) learns the file is ready.
  const doneKey = uploads
    .filter((u) => u.status === 'done' || u.status === 'error')
    .map((u) => u.assetId)
    .join(',');
  useEffect(() => {
    if (!doneKey) return;
    qc.invalidateQueries({ queryKey: ['media'] });
    for (const id of doneKey.split(',')) qc.invalidateQueries({ queryKey: ['media-view', id] });
  }, [doneKey, qc]);
  if (!uploads.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[90] flex w-[320px] flex-col gap-2">
      {uploads.map((u) => {
        const pct = uploadPct(u);
        return (
          <div
            key={u.assetId}
            role="status"
            className="pointer-events-auto rounded-xl border border-line-2 bg-surface p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.3)]"
          >
            <div className="flex items-center gap-2">
              {(u.status === 'uploading' || u.status === 'processing') && (
                <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line-2 border-t-accent" aria-hidden />
              )}
              {u.status === 'done' && <span className="shrink-0 text-[13px] font-bold text-green-600">✓</span>}
              {u.status === 'error' && <span className="shrink-0 text-[13px] font-bold text-red-600">!</span>}
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink" title={u.name}>
                {u.name}
              </span>
              {(u.status === 'done' || u.status === 'error') && (
                <button
                  type="button"
                  onClick={() => dismissUpload(u.assetId)}
                  className="rounded px-1 text-[12px] text-faint-2 hover:text-ink"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              )}
            </div>
            {u.status === 'error' ? (
              <p className="mt-1 text-[11.5px] leading-snug text-red-600">{u.error}. El archivo no se guardó; vuelve a subirlo.</p>
            ) : (
              <>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-2">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-300',
                      u.status === 'done' ? 'bg-green-600' : 'bg-accent',
                      u.status === 'processing' && 'animate-pulse',
                    )}
                    style={{ width: `${u.status === 'uploading' ? pct : 100}%` }}
                  />
                </div>
                <p className="mt-1 font-mono text-[11px] text-muted">
                  {u.status === 'uploading'
                    ? `Subiendo ${pct}% · ${formatBytes(u.loaded)} de ${formatBytes(u.total)}`
                    : u.status === 'processing'
                      ? 'Procesando…'
                      : `Listo · ${formatBytes(u.total)}`}
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
