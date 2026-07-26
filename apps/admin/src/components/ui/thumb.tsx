import { type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const HATCH = 'repeating-linear-gradient(135deg,#f0ece4 0 6px,#e6e1d7 6px 12px)';

/** Diagonal-hatch media placeholder used throughout the design. */
export function Thumb({
  className,
  ratio = '16 / 9',
  children,
  style,
}: {
  className?: string;
  ratio?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-lg', className)}
      style={{ aspectRatio: ratio, background: HATCH, ...style }}
    >
      {children}
    </div>
  );
}
