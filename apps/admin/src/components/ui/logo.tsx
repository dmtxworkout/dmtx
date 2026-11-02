import { cn } from '@/lib/utils';

/** The DMTX gorilla. Set its height with `className`; the width follows. */
export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a small static mark
  return <img src="/logo-mark.png" alt="DMTX" className={cn('h-8 w-auto select-none', className)} />;
}
