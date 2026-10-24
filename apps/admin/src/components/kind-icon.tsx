'use client';

import { cn } from '@/lib/utils';

/** What a section (or a day) holds: a video, or a structured rutina written as text. One icon each. */
export function KindIcon({ kind, className }: { kind: 'video' | 'text'; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-3.5 w-3.5 shrink-0', className)}
      aria-hidden="true"
    >
      {kind === 'video' ? (
        <>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m10 9 5 3-5 3z" fill="currentColor" />
        </>
      ) : (
        <>
          <path d="M9 6h11" />
          <path d="M9 12h11" />
          <path d="M9 18h11" />
          <path d="M4.5 6h.01" />
          <path d="M4.5 12h.01" />
          <path d="M4.5 18h.01" />
        </>
      )}
    </svg>
  );
}
