'use client';

import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * A small icon-only button with its name in a dark tooltip centred above it
 * on hover or focus (Shopify's row actions). `label` is also the accessible
 * name. The tooltip is rendered at the document root, positioned from the
 * button's rect, so a scrolling table neither clips it nor grows to fit it.
 */
export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setTip({ x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => setTip(null);
  // Centred on the button, but kept inside the viewport (the last column's tooltip would run off the right edge).
  const tipRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) {
      setShift(0);
      return;
    }
    const half = tipRef.current.offsetWidth / 2;
    const margin = 8;
    setShift(
      Math.min(0, window.innerWidth - margin - (tip.x + half)) + Math.max(0, margin - (tip.x - half)),
    );
  }, [tip]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-ink-3 transition-colors hover:border-line-2 hover:bg-surface hover:text-ink hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:shadow-none',
          className,
        )}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        {...props}
      >
        {children}
      </button>
      {tip &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            style={{ position: 'fixed', left: tip.x + shift, top: tip.y - 6 }}
            className="pointer-events-none z-[90] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11.5px] font-medium text-white shadow"
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
