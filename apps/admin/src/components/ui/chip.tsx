import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Rounded filter pill. `active` fills it dark. */
export function Chip({
  active,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { active?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors',
        active
          ? 'border-ink bg-ink text-white'
          : 'border-line-2 bg-surface text-ink-3 hover:bg-surface-2',
        className,
      )}
      {...props}
    />
  );
}
