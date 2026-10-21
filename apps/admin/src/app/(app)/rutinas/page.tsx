import { WorkoutList } from '@/components/workout-list';
import { es } from '@/i18n/es';

export default function RutinasPage() {
  return (
    <WorkoutList
      basePath="/rutinas"
      title={es.workouts.title}
      newLabel={es.workouts.new}
      newHref="/rutinas/nueva"
      empty={es.workouts.empty}
      noun="rutina"
      searchPlaceholder="Buscar rutina, formato o ejercicio"
    />
  );
}
