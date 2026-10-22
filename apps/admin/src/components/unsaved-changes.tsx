'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { es } from '@/i18n/es';

/**
 * Shopify-style unsaved changes: a floating "Cambios sin guardar · Descartar ·
 * Guardar" bar while `dirty`, ⌘S to save, the browser prompt on reload/close,
 * and in-app navigation blocked with a shake of the bar. The host renders
 * `bar` inside a `relative` container and routes its own back actions through
 * `guardNav`.
 */
export function useUnsavedChanges({
  dirty,
  saving,
  onSave,
  onDiscard,
  canSave = true,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  canSave?: boolean;
}): { bar: ReactNode; guardNav: (go: () => void) => void; shake: () => void } {
  const [shake, setShake] = useState(0);
  const hold = dirty;
  const dirtyRef = useRef(hold);
  dirtyRef.current = hold;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const guardNav = (go: () => void) => {
    if (dirtyRef.current) setShake((n) => n + 1);
    else go();
  };
  // Clicks on the app's own links are intercepted while dirty.
  useEffect(() => {
    if (!hold) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setShake((n) => n + 1);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [hold]);
  useEffect(() => {
    if (!shake) return;
    const t = window.setTimeout(() => setShake(0), 600);
    return () => window.clearTimeout(t);
  }, [shake]);
  // ⌘S / Ctrl+S saves when there is something to save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirtyRef.current) onSaveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Reload/close with unsaved changes asks first (the browser's own prompt).
  useEffect(() => {
    if (!hold) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [hold]);

  const bar = hold ? (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
      <div
        key={shake}
        className={cn(
          'pointer-events-auto flex items-center gap-1 rounded-full bg-ink p-1 pl-4 text-white shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)]',
          shake > 0 && 'animate-shake',
        )}
      >
        <span className="mr-2 text-[13px] font-semibold">Cambios sin guardar</span>
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-white/85 hover:bg-white/15 hover:text-white disabled:opacity-50"
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !canSave}
          className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold text-ink hover:bg-white/90 disabled:opacity-60"
        >
          {saving ? es.app.saving : es.app.save}
        </button>
      </div>
    </div>
  ) : null;

  return { bar, guardNav, shake: () => setShake((n) => n + 1) };
}
