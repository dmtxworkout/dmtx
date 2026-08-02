import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Button, Loading } from '../../../components/ui';
import { api } from '../../../lib/api';

// Placeholder for the workout player (Ejercicio reps/tiempo · Descanso · Resumen).
// The full per-format timer/counter flow is built in the next step.
export default function Entrenar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ['workout', id], queryFn: () => api.workout(id) });

  if (q.isLoading) return <Loading />;

  const w = q.data;
  const exercises = w?.blocks.flatMap((b) => b.items).length ?? 0;

  return (
    <View className="flex-1 bg-bg px-6" style={{ paddingTop: insets.top + 8 }}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        className="h-10 w-10 items-center justify-center"
      >
        <Text className="text-[18px] text-ink-3">✕</Text>
      </Pressable>

      <View className="flex-1 items-center justify-center gap-4">
        <Text className="font-mono-semibold text-[11px] uppercase tracking-widest text-accent">
          Reproductor
        </Text>
        <Text className="text-center font-extrabold text-[24px] leading-tight text-ink">
          {w?.name ?? 'Rutina'}
        </Text>
        <Text className="max-w-[290px] text-center font-sans text-[14px] leading-6 text-ink-3">
          {exercises} ejercicio{exercises === 1 ? '' : 's'} listos. El reproductor con cronómetros,
          contadores y registro de marcas es el siguiente paso.
        </Text>
      </View>

      <View className="gap-2.5" style={{ paddingBottom: insets.bottom + 16 }}>
        <Button label="Ver resumen" variant="surface" onPress={() => router.push('/(app)/resumen')} />
        <Button label="Salir" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
