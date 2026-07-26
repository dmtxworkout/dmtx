import type { BadgeTone } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { Thumb } from '@/components/ui/thumb';

export interface ContentCardData {
  name: string;
  meta: string;
  format: string;
  dur: string;
  badge: string;
  tone: BadgeTone;
  ago: string;
}

/** Thumbnail content card used by Rutinas and Programas grids. */
export function ContentCard({ c }: { c: ContentCardData }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-line-2">
      <Thumb>
        <span className="absolute left-2.5 top-2.5 rounded-md bg-ink px-1.5 py-1 font-mono text-[10px] font-semibold tracking-[0.06em] text-white">
          {c.format}
        </span>
        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-surface px-1.5 py-1 font-mono text-[10px] font-medium text-ink-3">
          {c.dur}
        </span>
      </Thumb>
      <div className="flex flex-1 flex-col gap-1.5 px-3.5 pb-3.5 pt-3">
        <div className="text-[15px] font-semibold leading-tight tracking-[-0.01em]">{c.name}</div>
        <div className="font-mono text-[11px] text-muted">{c.meta}</div>
        <div className="mt-auto flex items-center gap-2 pt-1.5">
          <Badge tone={c.tone}>{c.badge}</Badge>
          <span className="font-mono text-[11px] text-faint">{c.ago}</span>
          <span className="ml-auto text-faint-2">⋯</span>
        </div>
      </div>
    </div>
  );
}
