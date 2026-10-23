'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * A small panel anchored under an element, rendered at the document root so
 * a scrolling table cannot clip it. Closes on outside click, Escape or scroll.
 */
export function Popover({
  anchor,
  onClose,
  children,
  width = 288,
}: {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    // Keep it inside the viewport horizontally.
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ top: r.bottom + 4, left: Math.max(8, left) });
  }, [anchor, width]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node))
        onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [anchor, onClose]);
  if (!pos) return null;
  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
      className="z-[80] rounded-xl border border-line-2 bg-surface p-2 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]"
    >
      {children}
    </div>,
    document.body,
  );
}
