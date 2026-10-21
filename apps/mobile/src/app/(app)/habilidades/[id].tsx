import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Loading, Thumb } from '../../../components/ui';
import { api } from '../../../lib/api';
import { difficultyLabel, es } from '../../../i18n';
import type { SkillGoal } from '@dmtx/schemas';

const seconds = (s: number) => (s % 60 === 0 ? `${s / 60} min` : s > 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`);
const meters = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${m} m`);

/** "3 Dominadas", "Plancha 60 s", "Sentadilla 5 reps @100 kg". */
function goalLabel(g: SkillGoal): string {
  if (g.metric === 'reps') return `${g.value} ${g.exerciseName}`;
  if (g.metric === 'time_seconds') return `${g.exerciseName} ${seconds(g.value)}`;
  if (g.metric === 'distance_meters') return `${meters(g.value)} ${g.exerciseName}`;
  return `${g.exerciseName} ${g.reps ? `${g.reps} reps ` : ''}@${g.value} kg`;
}

export default function HabilidadDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ['skill', id], queryFn: () => api.skill(id) });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-center font-sans text-[15px] text-ink-3">{es.common.error}</Text>
      </View>
    );
  }

  const s = q.data;
  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <View className="relative" style={{ height: 260 }}>
          <Thumb uri={s.thumbnailUrl} className="absolute inset-0 h-full w-full" radius={0} />
          <View className="absolute inset-0 bg-black/45" />
          <View className="absolute inset-x-0 bottom-0 h-28 bg-bg/80" />
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
              {s.name}
            </Text>
            <Text className="font-mono text-[12px] text-ink-2">
              {[difficultyLabel(s.difficulty, true), `${s.levels.length} niveles`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        <View className="gap-3 px-5 pt-4">
          {s.description ? (
            <Text className="font-sans text-[14px] leading-6 text-ink-2">{s.description}</Text>
          ) : null}
          <Text className="pt-2 font-mono-medium text-[11px] uppercase tracking-wider text-ink-3">
            Niveles
          </Text>
          {s.levels.map((l, i) => (
            <Pressable
              key={l.id}
              disabled={!l.workout}
              onPress={() => l.workout && router.push(`/(app)/rutinas/${l.workout.id}`)}
              className="flex-row items-center gap-3 rounded-xl border border-line bg-surface p-3"
            >
              <View className="h-8 w-8 items-center justify-center rounded-full bg-accent">
                <Text className="font-bold text-[13px] text-white">{i + 1}</Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-semibold text-[15px] text-ink">
                  {l.name}
                </Text>
                {l.workout ? (
                  <Text numberOfLines={1} className="font-mono text-[10px] text-ink-3">
                    {l.workout.name}
                  </Text>
                ) : null}
              </View>
              {l.unlockGoals.length ? (
                <Text numberOfLines={2} className="max-w-[40%] text-right font-mono-semibold text-[11px] text-ink-2">
                  {l.unlockGoals.map(goalLabel).join('\n')}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
