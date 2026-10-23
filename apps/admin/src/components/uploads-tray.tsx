'use client';

// The uploads in flight, bottom right, like a mail client's outbox: a header
// with the count and «Cancelar todo», then one row per file with its bar and
// its own cancel. The list scrolls when the queue is long. Finished and
// cancelled ones fade out on their own, failed ones stay until dismissed.
// While anything is uploading, reloading or closing the tab asks first (that
// is the only way to lose an upload).
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { cancelAllUploads, cancelUpload, dismissUpload, formatBytes, isActiveUpload, uploadPct, useUploads } from '@/lib/uploads';

export function UploadsTray() {
  const uploads = useUploads();
  const qc = useQueryClient();
  const active = uploads.filter(isActiveUpload);
  const cancellable = active.filter((u) => !u.cancelling);
  useEffect(() => {
    if (!active.length) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [active.length]);
  // Whatever shows media (library, pickers, thumbs) learns the file is ready (or gone).
  const settledKey = uploads
    .filter((u) => !isActiveUpload(u))
    .map((u) => u.assetId)
    .join(',');
  useEffect(() => {
    if (!settledKey) return;
    qc.invalidateQueries({ queryKey: ['media'] });
    qc.invalidateQueries({ queryKey: ['media-view'] });
    qc.invalidateQueries({ queryKey: ['media-usage'] });
  }, [settledKey, qc]);
  if (!uploads.length) return null;
  // Overall progress of what is still being sent, for the header.
  const sending = active.filter((u) => u.status === 'uploading');
  const loaded = sending.reduce((n, u) => n + u.loaded, 0);
  const total = sending.reduce((n, u) => n + u.total, 0);
  const title = active.length
    ? `${active.length === 1 ? 'Una subida' : `${active.length} subidas`} en curso${sending.length ? ` · ${Math.round((loaded / Math.max(1, total)) * 100)}%` : ''}`
    : 'Subidas';
  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-[90] flex w-[340px] max-h-[min(60vh,480px)] flex-col overflow-hidden rounded-xl border border-line-2 bg-surface shadow-[0_16px_40px_-12px_rgba(0,0,0,0.3)]"
    >
      <div className="flex items-center gap-2 border-b border-line-3 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">{title}</span>
        {cancellable.length > 1 && (
          <button type="button" onClick={cancelAllUploads} className="text-[11.5px] font-medium text-ink-3 hover:text-accent-dark">
            Cancelar todo
          </button>
        )}
        {!active.length && (
          <button
            type="button"
            onClick={() => uploads.forEach((u) => dismissUpload(u.assetId))}
            className="rounded px-1 text-[12px] text-faint-2 hover:text-ink"
            aria-label="Cerrar"
          >
            ✕
          </button>
        )}
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line-3 overflow-y-auto">
        {uploads.map((u) => {
          const pct = uploadPct(u);
          const busy = isActiveUpload(u);
          return (
            <li key={u.assetId} className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                {busy && (
                  <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line-2 border-t-accent" aria-hidden />
                )}
                {u.status === 'done' && <span className="shrink-0 text-[13px] font-bold text-green-600">✓</span>}
                {u.status === 'error' && <span className="shrink-0 text-[13px] font-bold text-red-600">!</span>}
                {u.status === 'cancelled' && <span className="shrink-0 text-[13px] font-bold text-faint-2">–</span>}
                <span className={cn('min-w-0 flex-1 truncate text-[12.5px] font-semibold', u.status === 'cancelled' ? 'text-muted line-through' : 'text-ink')} title={u.name}>
                  {u.name}
                </span>
                {busy && !u.cancelling && (
                  <button
                    type="button"
                    onClick={() => cancelUpload(u.assetId)}
                    className="rounded px-1 text-[11.5px] font-medium text-ink-3 hover:text-accent-dark"
                    aria-label={`Cancelar la subida de ${u.name}`}
                  >
                    Cancelar
                  </button>
                )}
                {!busy && (
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
              ) : u.status === 'cancelled' ? (
                <p className="mt-1 text-[11.5px] leading-snug text-muted">Cancelada · el archivo se eliminó.</p>
              ) : (
                <>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-2">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-300',
                        u.status === 'done' ? 'bg-green-600' : u.cancelling ? 'bg-line-2' : 'bg-accent',
                        u.status === 'processing' && !u.cancelling && 'animate-pulse',
                      )}
                      style={{ width: `${u.status === 'uploading' ? pct : 100}%` }}
                    />
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted">
                    {u.cancelling
                      ? 'Cancelando…'
                      : u.status === 'uploading'
                        ? `Subiendo ${pct}% · ${formatBytes(u.loaded)} de ${formatBytes(u.total)}`
                        : u.status === 'processing'
                          ? u.kind === 'video'
                            ? 'Subido · Cloudflare está procesando el video…'
                            : 'Procesando…'
                          : `${u.replaceOf ? 'Reemplazado' : 'Listo'} · ${formatBytes(u.total)}`}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
