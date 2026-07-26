import { programaCards } from '@/lib/mock';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { SearchField } from '@/components/ui/search-field';
import { ContentCard } from '@/components/content-card';

const filters = ['Todo', 'Calendario', 'Playlist', 'Borrador'];

export default function ProgramasPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Programas"
        subtitle="48 programas · 6 en borrador · 2 con días vacíos"
        actions={
          <>
            <Button variant="outline">Duplicar plantilla</Button>
            <Button>Nuevo programa</Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField placeholder="Buscar programa" />
          {filters.map((f, i) => (
            <Chip key={f} active={i === 0}>
              {f}
            </Chip>
          ))}
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-[22px]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programaCards.map((c) => (
            <ContentCard key={c.name} c={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
