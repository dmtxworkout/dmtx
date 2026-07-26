import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const tones: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-600',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-amber-100 text-amber-700',
  neutral: 'bg-zinc-100 text-zinc-600',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone] ?? tones.neutral,
        className,
      )}
      {...props}
    />
  );
}
