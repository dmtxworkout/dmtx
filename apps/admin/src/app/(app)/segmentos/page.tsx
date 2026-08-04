import { WorkoutList } from '@/components/workout-list';
import { es } from '@/i18n/es';

export default function SegmentosPage() {
  return (
    <WorkoutList
      kind="segment"
      basePath="/segmentos"
      title={es.segments.title}
      newLabel={es.segments.new}
      newHref="/segmentos/nuevo"
      empty={es.segments.empty}
      noun="segmento"
      searchPlaceholder="Buscar segmento o ejercicio"
    />
  );
}
