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
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-ink-3 transition-colors hover:border-line-2 hover:bg-surface hover:text-ink hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:shadow-none',
          className,
        )}
        {...props}
      >
        {children}
      </button>
      <span
        role="tooltip"
        // `hidden` until hovered: an invisible-but-present tooltip would still widen a scrolling table.
        // The group is named so a hovered row (a `group` of its own) does not open every tooltip in it.
        className={cn(
          'pointer-events-none absolute bottom-full z-30 mb-1.5 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11.5px] font-medium text-white shadow group-hover/tip:block group-focus-within/tip:block',
          tooltipAlign === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2',
        )}
      >
        {label}
      </span>
    </span>
  );
}
