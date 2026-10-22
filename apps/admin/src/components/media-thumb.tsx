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
  });
  const cls = cn('bg-surface-2 object-cover', className);
  if (!data) return <div className={cls} />;
  if (data.status !== 'ready' && data.status !== 'uploaded') {
    return (
      <div className={cn(cls, 'flex items-center justify-center font-mono text-[9px] uppercase tracking-wider text-muted-2')} title="Subiendo…">
        …
      </div>
    );
  }
  return data.kind === 'image' ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={data.viewUrl} alt="" className={cls} />
  ) : (
    <video src={data.viewUrl} muted className={cls} />
  );
}
