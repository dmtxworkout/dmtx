'use client';

import { type ReactNode, useEffect } from 'react';
import { cn } from '@/lib/utils';

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xl',
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-line-3 px-5 py-3.5">
            <h2 className="text-base font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="text-faint hover:text-ink">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
