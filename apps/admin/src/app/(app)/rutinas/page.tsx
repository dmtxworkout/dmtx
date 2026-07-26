import { rutinaCards, rutinaFilters } from '@/lib/mock';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { SearchField } from '@/components/ui/search-field';
import { ContentCard } from '@/components/content-card';

export default function RutinasPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Rutinas"
        subtitle="312 rutinas · 44 en borrador"
        actions={
          <>
            <Button variant="outline">Importar CSV</Button>
            <Button>Nueva rutina</Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField placeholder="Buscar rutina, formato o ejercicio" />
          {rutinaFilters.map((f, i) => (
            <Chip key={f} active={i === 0}>
              {f}
            </Chip>
          ))}
          <span className="ml-auto font-mono text-xs font-medium text-muted">
            Ordenar: actualizado ↓
          </span>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-[22px]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rutinaCards.map((c) => (
            <ContentCard key={c.name} c={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
