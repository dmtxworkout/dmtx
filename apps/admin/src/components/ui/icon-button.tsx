'use client';

import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A small icon-only button with its name in a dark tooltip above it on hover
 * or focus (Shopify's row actions). `label` is also the accessible name.
 */
export function IconButton({
  label,
  children,
  className,
  tooltipAlign = 'center',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  tooltipAlign?: 'center' | 'end';
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-40 disabled:hover:bg-transparent',
          className,
        )}
        {...props}
      >
        {children}
      </button>
      <span
        role="tooltip"
        // `hidden` until hovered: an invisible-but-present tooltip would still widen a scrolling table.
        className={cn(
          'pointer-events-none absolute bottom-full z-30 mb-1.5 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11.5px] font-medium text-white shadow group-hover:block group-focus-within:block',
          tooltipAlign === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2',
        )}
      >
        {label}
      </span>
    </span>
  );
}
