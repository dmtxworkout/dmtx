import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Loading, Thumb } from '../../../components/ui';
import { api } from '../../../lib/api';
import { difficultyLabel, es } from '../../../i18n';

export default function ProgramaDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ['program', id], queryFn: () => api.program(id) });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-center font-sans text-[15px] text-ink-3">{es.common.error}</Text>
      </View>
    );
  }

  const p = q.data;
  const meta = [
    p.weeks ? `${p.weeks} semanas` : p.durationDays ? `${p.durationDays} días` : '',
    difficultyLabel(p.difficulty, true),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <View className="relative" style={{ height: 300 }}>
          <Thumb uri={p.thumbnailUrl} className="absolute inset-0 h-full w-full" radius={0} />
          <View className="absolute inset-0 bg-black/45" />
          <View className="absolute inset-x-0 bottom-0 h-32 bg-bg/80" />
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            className="absolute left-5 h-10 w-10 items-center justify-center rounded-full bg-black/60"
            style={{ top: insets.top + 6 }}
          >
            <Text className="text-[17px] text-ink">←</Text>
          </Pressable>
          <View className="absolute inset-x-0 bottom-0 gap-2 px-5 pb-4">
            <Text className="font-extrabold text-[28px] leading-tight tracking-tight text-ink">
              {p.name}
            </Text>
            {meta ? <Text className="font-mono text-[12px] text-ink-2">{meta}</Text> : null}
          </View>
        </View>

        <View className="gap-3 px-5 pt-4">
          {p.description ? (
            <Text className="font-sans text-[14px] leading-6 text-ink-2">{p.description}</Text>
          ) : null}

          <Text className="pt-2 font-mono-medium text-[11px] uppercase tracking-wider text-ink-3">
            Calendario
          </Text>
          {p.days.map((d) => {
            const first = d.workouts[0];
            return (
              <Pressable
                key={d.id}
                disabled={!first}
                onPress={() => first && router.push(`/(app)/rutinas/${first.id}`)}
                className="flex-row items-center gap-3 border-b border-line-2 py-2.5"
              >
                <Text className="w-9 font-mono-semibold text-[11px] text-ink-3">
                  D{d.position + 1}
                </Text>
                {d.isRestDay ? (
                  <View className="h-[38px] w-[62px] items-center justify-center rounded-[7px] bg-surface">
                    <Text className="text-[14px] text-ink-4">·</Text>
                  </View>
                ) : (
                  <Thumb uri={first?.thumbnailUrl} className="h-[38px] w-[62px]" radius={7} />
                )}
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-semibold text-[14px] text-ink">
                    {d.isRestDay ? 'Descanso' : (d.title ?? first?.name ?? 'Entrenamiento')}
                  </Text>
                  <Text numberOfLines={1} className="font-mono text-[10px] text-ink-3">
                    {d.isRestDay ? 'Recuperación' : (first?.meta ?? '')}
                  </Text>
                </View>
                {first ? <Text className="text-[15px] text-ink-4">›</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
