import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Button, Loading, Thumb } from '../../../components/ui';
import { api } from '../../../lib/api';
import { difficultyLabel, es, formatLabel } from '../../../i18n';
import { durationLabel, loadLabel, mmss, targetLabel, tempoDash } from '../../../lib/format';
import type { WorkoutBlock, WorkoutItem } from '../../../lib/types';

function itemSub(item: WorkoutItem): string {
  const tempo = item.tempoOverride ?? item.exercise?.defaultTempo ?? null;
  const parts: string[] = [];
  if (tempo) parts.push(`Tempo ${tempoDash(tempo)}`);
  else if (item.exercise) parts.push(es.measurement[item.exercise.measurementType]);
  const load = loadLabel(item.loadPrescription);
  if (load) parts.push(load);
  if (item.perSide) parts.push('bilateral');
  return parts.join(' · ');
}

function blockTag(b: WorkoutBlock): string {
  const map = { single: '', superset: 'Superserie', circuit: 'Circuito', emom: 'EMOM', tabata: 'Tabata' };
  return map[b.type] || '';
}

export default function RutinaDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ['workout', id], queryFn: () => api.workout(id) });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-center font-sans text-[15px] text-ink-3">{es.common.error}</Text>
      </View>
    );
  }

  const w = q.data;
  const stats = [
    { k: 'Formato', v: w.type === 'video' ? 'Video' : formatLabel(w.format) || '—' },
    { k: 'Duración', v: w.estimatedDurationSeconds ? mmss(w.estimatedDurationSeconds) : '—' },
    { k: 'Nivel', v: difficultyLabel(w.difficulty, true) || '—' },
  ];

  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-32">
        {/* Hero */}
        <View className="relative" style={{ height: 300 }}>
          <Thumb uri={w.thumbnailUrl} className="absolute inset-0 h-full w-full" radius={0} />
          <View className="absolute inset-0 bg-black/40" />
          <View className="absolute inset-x-0 bottom-0 h-32 bg-bg/80" />
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            className="absolute left-5 h-10 w-10 items-center justify-center rounded-full bg-black/60"
            style={{ top: insets.top + 6 }}
          >
            <Text className="text-[17px] text-ink">←</Text>
          </Pressable>
          <View className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-7 -translate-y-7 items-center justify-center rounded-full bg-ink/90">
            <Text className="text-[20px] text-bg">▶</Text>
          </View>
          {w.type !== 'video' && (w.format || w.estimatedDurationSeconds) ? (
            <View className="absolute bottom-3.5 left-5 self-start rounded bg-accent px-2 py-1">
              <Text className="font-mono-semibold text-[10px] uppercase tracking-wider text-white">
                {[formatLabel(w.format), w.estimatedDurationSeconds ? mmss(w.estimatedDurationSeconds) : '']
                  .filter(Boolean)
                  .join(' ')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Body */}
        <View className="gap-4 px-5 pt-3">
          <Text className="font-extrabold text-[26px] leading-tight tracking-tight text-ink">
            {w.name}
          </Text>

          <View className="flex-row border-y border-line-2">
            {stats.map((s) => (
              <View key={s.k} className="flex-1 gap-1 py-3">
                <Text className="font-mono-medium text-[9px] uppercase tracking-widest text-ink-3">
                  {s.k}
                </Text>
                <Text className="font-bold text-[17px] tracking-tight text-ink">{s.v}</Text>
              </View>
            ))}
          </View>

          {w.description ? (
            <Text className="font-sans text-[14px] leading-6 text-ink-2">{w.description}</Text>
          ) : null}

          {/* Blocks */}
          <View className="gap-4 pt-1">
            {w.blocks.map((b, bi) => (
              <View key={b.id} className="gap-2.5">
                <View className="flex-row items-baseline gap-2">
                  <Text className="font-bold text-[15px] tracking-tight text-ink">
                    {b.label || `Bloque ${bi + 1}`}
                  </Text>
                  {blockTag(b) ? (
                    <View className="rounded bg-surface-2 px-1.5 py-0.5">
                      <Text className="font-mono-medium text-[10px] tracking-wide text-ink-2">
                        {blockTag(b)}
                      </Text>
                    </View>
                  ) : null}
                  {b.rounds ? (
                    <Text className="ml-auto font-mono text-[11px] text-ink-4">
                      {b.rounds} rondas
                    </Text>
                  ) : null}
                </View>
                {b.items.map((it) => (
                  <View key={it.id} className="flex-row items-center gap-3">
                    <Thumb uri={it.exercise?.thumbnailUrl} className="h-9 w-[58px]" radius={7} />
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="font-semibold text-[14px] text-ink">
                        {it.exercise?.name ?? 'Ejercicio'}
                      </Text>
                      {itemSub(it) ? (
                        <Text numberOfLines={1} className="font-mono text-[10px] text-ink-3">
                          {itemSub(it)}
                        </Text>
                      ) : null}
                    </View>
                    <Text className="font-mono-semibold text-[13px] text-ink-2">{targetLabel(it)}</Text>
                  </View>
                ))}
              </View>
            ))}
            {w.type === 'video' ? (
              <Text className="font-sans text-[14px] leading-6 text-ink-3">
                Rutina en video · {durationLabel(w.videoDurationSeconds)}
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View
        className="absolute inset-x-0 bottom-0 flex-row gap-2.5 bg-bg px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Pressable className="h-[52px] w-[52px] items-center justify-center rounded-xl bg-surface-2">
          <Text className="text-[19px] text-ink">♡</Text>
        </Pressable>
        <Button label="Empezar rutina" className="flex-1" onPress={() => router.push(`/(app)/entrenar/${id}`)} />
      </View>
    </View>
  );
}
