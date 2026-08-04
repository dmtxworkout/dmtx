'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'success' | 'error';
type Toast = { id: number; message: string; variant: Variant };

// Tiny sonner-style store so `toast()` can be called from anywhere without
// threading a context through every component.
let toasts: Toast[] = [];
let listeners: Array<() => void> = [];
let counter = 0;
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, variant: Variant = 'success') {
  const id = (counter += 1);
  toasts = [...toasts, { id, message, variant }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 3200);
}

export function Toaster() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-line-2 bg-surface px-4 py-3 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.3)]"
        >
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white',
              t.variant === 'success' ? 'bg-green-600' : 'bg-red-500',
            )}
          >
            {t.variant === 'success' ? '✓' : '!'}
          </span>
          <span className="text-[13px] font-medium text-ink">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
