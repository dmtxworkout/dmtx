import { media, mediaFilters } from '@/lib/mock';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { SearchField } from '@/components/ui/search-field';
import { Thumb } from '@/components/ui/thumb';

export default function BibliotecaPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Biblioteca"
        subtitle="3 401 archivos · 214 GB en R2 · 12 sin usar"
        actions={
          <>
            <Button variant="outline">Sin usar (12)</Button>
            <Button>Subir archivos</Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField placeholder="Buscar archivo" />
          {mediaFilters.map((f, i) => (
            <Chip key={f} active={i === 0}>
              {f}
            </Chip>
          ))}
        </div>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-8 pb-10 pt-[22px]">
        <div className="flex items-center gap-4 rounded-xl border border-dashed border-line-2 bg-surface-3 p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-[#f0ece4] text-lg text-ink-3">
            ↑
          </div>
          <div>
            <div className="text-[15px] font-semibold">Arrastra videos o imágenes aquí</div>
            <div className="font-mono text-xs text-muted">
              MP4 hasta 4 GB · JPG/PNG · subida directa a R2
            </div>
          </div>
          <div className="ml-auto">
            <Button variant="outline">Elegir archivos</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {media.map((m) => (
            <div key={m.name} className="flex flex-col gap-2">
              <Thumb className="rounded-[10px] border border-line">
                <span className="absolute left-2 top-2 rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                  {m.kind}
                </span>
                <span className="absolute bottom-2 right-2 rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] text-white">
                  {m.dur}
                </span>
              </Thumb>
              <div className="truncate text-[13px] font-semibold">{m.name}</div>
              <div className="font-mono text-[10px] text-muted">{m.meta}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
