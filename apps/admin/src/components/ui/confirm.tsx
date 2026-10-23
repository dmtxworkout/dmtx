'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

type Ask = {
  id: number;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (ok: boolean) => void;
};

// Same shape as the toaster: a tiny store so `confirm()` can be awaited from
// plain code (the upload queue, for one) without threading a context through.
let current: Ask | null = null;
let listeners: Array<() => void> = [];
let counter = 0;
const emit = () => listeners.forEach((l) => l());

/** Ask the admin a yes/no question in a dialog; resolves with the answer. */
export function confirm(opts: { title: string; message: ReactNode; confirmLabel?: string; cancelLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    current?.resolve(false);
    current = {
      id: (counter += 1),
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Continuar',
      cancelLabel: opts.cancelLabel ?? 'Cancelar',
      resolve: (ok) => {
        current = null;
        emit();
        resolve(ok);
      },
    };
    emit();
  });
}

export function ConfirmHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);
  const ask = current;
  if (!ask) return null;
  return (
    <Dialog open onClose={() => ask.resolve(false)} title={ask.title} className="max-w-sm">
      <div className="flex flex-col gap-4 p-5">
        <p className="text-[14px] leading-relaxed text-ink-2">{ask.message}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => ask.resolve(false)}>
            {ask.cancelLabel}
          </Button>
          <Button type="button" autoFocus onClick={() => ask.resolve(true)}>
            {ask.confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
