'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * An image that fades in once its bytes are here; until then its box pulses,
 * so a thumbnail on its way never reads as an empty card. Sits absolutely
 * over its (relative) parent.
 */
export function FadeImg({
  src,
  className,
  placeholder = 'bg-surface-2',
}: {
  src: string;
  className?: string;
  /** The pulsing box's colour (a dark card wants a dark one). */
  placeholder?: string;
}) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const ready = loaded === src;
  return (
    <>
      {!ready && <span aria-hidden className={cn('absolute inset-0 animate-pulse', placeholder)} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onLoad={() => setLoaded(src)}
        ref={(el) => {
          // Already in the browser's cache: complete before React attached onLoad.
          if (el?.complete && el.naturalWidth && loaded !== src) setLoaded(src);
        }}
        className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-200', ready ? 'opacity-100' : 'opacity-0', className)}
      />
    </>
  );
}
