import { collections } from '@/lib/mock';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Thumb } from '@/components/ui/thumb';

export default function ColeccionesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Colecciones"
        subtitle="Las filas que verán los usuarios en la app, en este orden."
        actions={
          <>
            <Button variant="outline">Vista de la app</Button>
            <Button>Nueva colección</Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-8 pb-10 pt-[22px]">
        {collections.map((col) => (
          <div key={col.title} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line-3 bg-surface-2 px-4 py-3.5">
              <span className="cursor-grab font-mono text-[13px] text-faint">⠿</span>
              <span className="text-base font-bold tracking-[-0.01em]">{col.title}</span>
              <span className="rounded-md bg-[#f0ece4] px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.04em] text-[#6b6760]">
                {col.tag}
              </span>
              <span className="font-mono text-xs text-muted">{col.count}</span>
              <div className="ml-auto flex items-center gap-2">
                <Badge tone={col.tone}>{col.badge}</Badge>
                <span className="text-faint-2">⋯</span>
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto px-4 py-3.5">
              {col.items.map((it) => (
                <div key={it.name} className="flex w-[172px] flex-shrink-0 flex-col gap-1.5">
                  <Thumb ratio="16 / 9" className="rounded-[9px]">
                    <span className="absolute left-1.5 top-1.5 rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                      {it.kind}
                    </span>
                    <span className="absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-surface text-[11px] text-faint">
                      ✕
                    </span>
                  </Thumb>
                  <div className="truncate text-[13px] font-semibold leading-tight">{it.name}</div>
                  <div className="font-mono text-[10px] text-muted">{it.meta}</div>
                </div>
              ))}
              <div className="flex aspect-video w-[172px] flex-shrink-0 items-center justify-center rounded-[9px] border border-dashed border-line-2 bg-surface-3 text-[13px] font-semibold text-ink-3">
                + Agregar
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
