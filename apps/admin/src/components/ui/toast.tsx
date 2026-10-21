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
  setTimeout(
    () => {
      toasts = toasts.filter((t) => t.id !== id);
      emit();
    },
    variant === 'error' ? 6000 : 3200,
  );
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

  // Bottom centre (where Shopify puts them), solid colour: green for success,
  // red for errors. Hard to miss, and never over the save bar at the top.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.variant === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex max-w-[640px] items-center gap-3 rounded-xl px-5 py-3.5 text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.45)]',
            t.variant === 'success' ? 'bg-green-600' : 'bg-red-600',
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-[13px] font-bold">
            {t.variant === 'success' ? '✓' : '!'}
          </span>
          <span className="text-[14px] font-semibold leading-snug">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
