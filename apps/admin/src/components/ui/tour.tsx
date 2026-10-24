'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * One step of a guided tour. `target` is a `[data-tour="…"]` name; without
 * one the card sits in the middle of the screen. A step with `done` waits for
 * the admin to do the thing (polled) and moves on by itself when it is done;
 * «Siguiente» always works too. A step whose target is not on the page is
 * skipped.
 */
export interface TourStep {
  target?: string;
  title: string;
  body: ReactNode;
  /** The admin did what the step asks: move on. */
  done?: () => boolean;
  /** An extra button on the card (e.g. «Escríbelo por mí»). */
  action?: { label: string; run: () => void };
}

const PAD = 6;
const CARD_W = 360;
const GAP = 12;

const find = (name?: string) => (name ? document.querySelector<HTMLElement>(`[data-tour="${name}"]`) : null);

/**
 * Coach marks: the page dims except the step's element, and a card beside it
 * explains it. The page stays usable (the admin types and clicks for real);
 * Esc or «Saltar» ends it.
 */
export function Tour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(180);
  // A modal the step opened (the library, a preview): the tour steps aside until it closes.
  const [covered, setCovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[i];

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  const next = useCallback(() => {
    // Skip steps whose element is not on the page (a mode without it).
    let k = i + 1;
    while (k < steps.length && steps[k]!.target && !find(steps[k]!.target)) k += 1;
    if (k >= steps.length) onClose();
    else setI(k);
  }, [i, steps, onClose]);
  const back = () => {
    let k = i - 1;
    while (k > 0 && steps[k]!.target && !find(steps[k]!.target)) k -= 1;
    setI(Math.max(0, k));
  };

  // Follow the element (it may move, resize or appear late) and watch for the step being done.
  useEffect(() => {
    if (!open || !step) return;
    let doneAt = 0;
    // Only what the admin does during the step counts: one already done when it opens waits for «Siguiente».
    const doneAtStart = !!step.done?.();
    const tick = () => {
      setCovered(!!document.querySelector('[role="dialog"][aria-modal="true"]'));
      const el = find(step.target);
      if (step.target && !el) {
        setRect(null);
      } else {
        const r = el?.getBoundingClientRect() ?? null;
        setRect((prev) =>
          prev && r && prev.x === r.x && prev.y === r.y && prev.width === r.width && prev.height === r.height ? prev : r,
        );
      }
      if (!doneAtStart && step.done?.()) {
        if (!doneAt) doneAt = Date.now();
        else if (Date.now() - doneAt > 700) next();
      } else doneAt = 0;
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [open, step, next]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Esc closes an open modal first, not the tour.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });

  if (!open || !step || covered || typeof document === 'undefined') return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // The card goes where there is room: below, above, right, left of the element (centred without one).
  let pos: { left: number; top: number };
  if (!rect) {
    pos = { left: (vw - CARD_W) / 2, top: (vh - cardH) / 2 };
  } else {
    const below = rect.bottom + PAD + GAP;
    const above = rect.top - PAD - GAP - cardH;
    const right = rect.right + PAD + GAP;
    const left = rect.left - PAD - GAP - CARD_W;
    const centerX = rect.left + rect.width / 2 - CARD_W / 2;
    const centerY = rect.top + rect.height / 2 - cardH / 2;
    if (below + cardH <= vh - 8) pos = { left: centerX, top: below };
    else if (above >= 8) pos = { left: centerX, top: above };
    else if (right + CARD_W <= vw - 8) pos = { left: right, top: centerY };
    else if (left >= 8) pos = { left, top: centerY };
    // A huge element (the editor): over its top-right corner, inside it.
    else pos = { left: rect.right - CARD_W - 16, top: rect.top + 16 };
  }
  pos = { left: Math.min(Math.max(8, pos.left), vw - CARD_W - 8), top: Math.min(Math.max(8, pos.top), vh - cardH - 8) };
  const shown = steps.filter((s) => !s.target || find(s.target));
  const n = shown.indexOf(step) + 1;

  return createPortal(
    <>
      {rect ? (
        <div
          className="pointer-events-none fixed z-[95] rounded-lg ring-2 ring-accent transition-all duration-200"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(20,18,16,0.45)',
          }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 z-[95] bg-[rgba(20,18,16,0.45)]" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={step.title}
        className="fixed z-[96] rounded-xl border border-line-2 bg-surface p-4 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] transition-[left,top] duration-200"
        style={{ left: pos.left, top: pos.top, width: CARD_W }}
      >
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          Paso {n} de {shown.length}
        </div>
        <h3 className="text-[15px] font-bold text-ink">{step.title}</h3>
        <div className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{step.body}</div>
        {step.done && !step.done() && (
          <p className="mt-2 font-mono text-[10.5px] text-accent-dark">Cuando lo hagas, seguimos solos.</p>
        )}
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={onClose} className="text-[12px] font-medium text-ink-3 hover:text-ink">
            Saltar
          </button>
          <span className="flex-1" />
          {i > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={back}>
              Atrás
            </Button>
          )}
          {step.action && (
            <Button type="button" variant="outline" size="sm" onClick={step.action.run}>
              {step.action.label}
            </Button>
          )}
          <Button type="button" size="sm" onClick={next} className={cn(n === shown.length && 'px-4')}>
            {n === shown.length ? 'Terminar' : 'Siguiente'}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}
