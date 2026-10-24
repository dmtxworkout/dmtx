'use client';

import type { MediaAsset } from '@dmtx/api-client';
import { cn } from '@/lib/utils';
import { fileType } from '@/components/media-library';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const added = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });

export const EyeIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/**
 * A file as it is, big: the image, or the video playing in Stream's player,
 * with its name and details (date · type · size in pixels or length). Used by
 * the picker's preview pane and the media field's «Vista previa».
 */
export function MediaPreview({ asset, className }: { asset: MediaAsset; className?: string }) {
  const details = [
    added(asset.createdAt),
    fileType(asset),
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : null,
    asset.durationSeconds ? mmss(asset.durationSeconds) : null,
  ].filter(Boolean);
  return (
    <div className={cn('flex min-h-0 flex-col gap-4', className)}>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-line-3 bg-surface-2">
        {asset.status !== 'ready' ? (
          <p className="px-6 text-center text-sm text-muted">
            {asset.status === 'failed' ? 'Cloudflare no pudo procesar este archivo.' : 'Cloudflare está procesando el archivo…'}
          </p>
        ) : asset.kind === 'video' && asset.embedUrl ? (
          <iframe
            key={asset.id}
            src={asset.embedUrl}
            title={asset.name}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
            className="aspect-video w-full border-0 bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.viewUrl ?? undefined} alt={asset.altText ?? ''} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <div className="flex-none">
        <p className="truncate text-[14px] font-semibold text-ink" title={asset.name}>
          {asset.name}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted">{details.join(' · ')}</p>
      </div>
    </div>
  );
}
