import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  draft: { background: '#fdf0d9', color: '#8a5a12' },
  published: { background: '#e2f2e4', color: '#276b34' },
  archived: { background: '#f0ece4', color: '#6b6760' },
  active: { background: '#e2f2e4', color: '#276b34' },
  trialing: { background: '#eae6f5', color: '#5b4b8a' },
  past_due: { background: '#fbe3dc', color: '#9c3618' },
  paused: { background: '#fdf0d9', color: '#8a5a12' },
  canceled: { background: '#f0ece4', color: '#6b6760' },
  neutral: { background: '#f0ece4', color: '#6b6760' },
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = 'neutral',
  className,
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      style={{ ...TONES[tone], ...style }}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        className,
      )}
      {...props}
    />
  );
}
