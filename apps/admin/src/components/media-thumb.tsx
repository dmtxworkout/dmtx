'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Fetches and renders a media asset's preview by id. */
export function MediaThumb({ assetId, className }: { assetId: string; className?: string }) {
  const { data } = useQuery({
    queryKey: ['media-view', assetId],
    queryFn: () => api.media.view(assetId),
    staleTime: 5 * 60 * 1000,
    // A video Stream is still encoding: ask again until it is ready.
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 5000 : false),
  });
  const cls = cn('bg-surface-2 object-cover', className);
  if (!data) return <div className={cls} />;
  if (data.status !== 'ready' || !data.thumbnailUrl) {
    return (
      <div
        className={cn(cls, 'flex items-center justify-center font-mono text-[9px] uppercase tracking-wider text-muted-2')}
        title={data.status === 'failed' ? 'Error al procesar' : data.status === 'processing' ? 'Procesando…' : 'Subiendo…'}
      >
        {data.status === 'failed' ? '!' : '…'}
      </div>
    );
  }
  // Images are resized by Cloudflare; a video shows Stream's poster frame.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={data.thumbnailUrl} alt="" className={cls} />;
}
