'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ActionItem } from '@/components/ui/actions-menu';

/**
 * A primary button with a chevron glued to its right that drops a menu of
 * alternatives for the same action («Guardar» ▾ «Guardar como nueva imagen»),
 * the way Shopify's Save works.
 */
export function SplitButton({
  label,
  onClick,
  disabled,
  items,
  menuLabel = 'Más opciones',
  size = 'sm',
}: {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  items: ActionItem[];
  menuLabel?: string;
  size?: 'sm' | 'default';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const h = size === 'sm' ? 'h-8 text-[13px]' : 'h-[38px] text-sm';
  const radius = size === 'sm' ? 'rounded-[7px]' : 'rounded-lg';
  const base =
    'inline-flex items-center justify-center bg-accent font-bold text-white transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30';
  return (
    <div ref={ref} className={cn('relative inline-flex', radius)}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(base, h, radius, 'rounded-r-none px-3')}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        className={cn(base, h, radius, 'rounded-l-none border-l border-white/25 px-2')}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]"
        >
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cn(
                'flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold disabled:opacity-50',
                it.danger ? 'text-accent-dark hover:bg-red-50' : 'text-ink-2 hover:bg-surface-2',
              )}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
