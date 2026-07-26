import { cn } from '@/lib/utils';

/**
 * DMTX wordmark. Swap for the real brand mark by dropping the asset in
 * `public/logo.png` and rendering `<img src="/logo.png" />` here.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'select-none font-sans text-[19px] font-bold leading-none tracking-[-0.03em] text-ink',
        className,
      )}
    >
      DMTX
    </span>
  );
}
