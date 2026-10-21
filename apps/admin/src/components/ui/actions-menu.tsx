'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ActionItem {
  label: ReactNode;
  onSelect: () => void;
  /** Red text: a destructive action. */
  danger?: boolean;
  disabled?: boolean;
}

/** "Acciones ▾": a small menu of secondary actions for a record's page. */
export function ActionsMenu({ label = 'Acciones', items }: { label?: string; items: ActionItem[] }) {
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

  return (
    <div ref={ref} className="relative">
      <Button type="button" variant="outline" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {label}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('ml-1.5 text-ink-3 transition-transform', open && 'rotate-180')}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]"
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
