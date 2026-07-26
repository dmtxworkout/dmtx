import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** The small uppercase IBM Plex Mono labels used across the design. */
export function MonoLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2',
        className,
      )}
      {...props}
    />
  );
}
