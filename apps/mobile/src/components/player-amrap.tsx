import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import type { CreateWorkoutLogInput, SetResultInput } from '@dmtx/schemas';
import { api } from '../lib/api';
import { NumPad } from './num-pad';
import { mmss } from '../lib/format';
import { useUnits } from '../lib/units-context';
import { formatDistance, formatWeight, weightToKg } from '../lib/units';
import type { DistanceUnit } from '../lib/units';
import type { WorkoutDetail, WorkoutItem } from '../lib/types';
import type { PartResult } from '../app/(app)/entrenar/[id]';

const loadKgOf = (it: WorkoutItem): number | null => {
  const l = it.loadPrescription;
  return l?.type === 'absolute' ? weightToKg(l.value, l.unit) : null;
};

const isReps = (it: WorkoutItem) => {
  const mt = it.measure ?? 'reps';
  return mt === 'reps' && it.reps != null;
};

function targetText(it: WorkoutItem, du: DistanceUnit): string {
  const mt = it.measure;
  if (mt === 'time' && it.workSeconds != null)
    return it.workSeconds >= 60 ? mmss(it.workSeconds) : `${it.workSeconds} s`;
  if (mt === 'distance' && it.distanceMeters != null) return formatDistance(it.distanceMeters, du);
  if (it.reps != null) return `${it.reps}`;
  return '—';
}

/**
 * AMRAP player: a global countdown, a big round counter you tap to advance, the
 * circuit shown for reference, and a partial-round entry at the end so the total
 * reps come out exact ("12 rondas + 10 pushups + 8 toes-to-bar").
 */
export function AmrapPlayer({
  workout,
  onFinish,
  renderCooldown,
  onPartDone,
  partIndex,
  partCount,
}: {
  workout: WorkoutDetail;
  onFinish?: () => void;
  renderCooldown?: (onDone: () => void) => ReactNode;
  /** Multi-part session: report the result instead of showing the summary. */
  onPartDone?: (r: PartResult) => void;
  partIndex?: number;
  partCount?: number;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { units } = useUnits();

  // Blocks with their round count (a block is "these exercises, N rounds").
  // Rest items/blocks stay in the reference circuit but are excluded from
  // scoring by `isReps`/`repsItems` below.
  const blocksView = useMemo(
    () =>
      workout.blocks
        .map((b) => ({
          name: b.label,
          kind: b.kind,
          rounds: b.rounds && b.rounds > 0 ? b.rounds : 1,
          items: b.items.filter((it) => it.kind === 'rest' || it.exercise),
        }))
        .filter((bv) => bv.items.length > 0),
    [workout],
  );
  const repsItems = useMemo(
    () =>
      blocksView.flatMap((bv) =>
        bv.items.filter(isReps).map((it) => ({ it, blockRounds: bv.rounds })),
      ),
    [blocksView],
  );
  const cap =
    (workout.formatConfig as { totalSeconds?: number } | null)?.totalSeconds ??
    workout.estimatedDurationSeconds ??
    600;

  const [remaining, setRemaining] = useState(cap);
  const [rounds, setRounds] = useState(0);
  const [phase, setPhase] = useState<'running' | 'partial' | 'cooldown' | 'summary'>('running');
  const [partial, setPartial] = useState<Record<string, number>>({});
  // Which value the numeric keypad is editing (round count, or a partial rep).
  const [pad, setPad] = useState<
    { kind: 'rounds' } | { kind: 'partial'; id: string; name: string; target: number } | null
  >(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    startRef.current = Date.now();
  }, []);

  const stop = (next: 'partial') => {
    setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    setPhase(next);
  };
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });

  // Global cap countdown.
  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          stopRef.current('partial');
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const totals = useMemo(() => {
    const volume = repsItems.reduce(
      (sum, { it, blockRounds }) => sum + blockRounds * (it.reps ?? 0) * rounds + (partial[it.id] ?? 0),
      0,
    );
    return { volume };
  }, [repsItems, rounds, partial]);

  const saveMutation = useMutation({
    mutationFn: (payload: CreateWorkoutLogInput) => api.saveLog(payload),
    onSuccess: () => (onFinish ? onFinish() : router.back()),
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'No se pudo guardar'),
  });

  const resultsList = (): SetResultInput[] =>
    repsItems.map(({ it, blockRounds }, i) => ({
      exerciseId: it.exerciseId!,
      exerciseName: it.exercise!.name,
      position: i,
      measure: 'reps',
      reps: blockRounds * (it.reps ?? 0) * rounds + (partial[it.id] ?? 0),
      loadKg: loadKgOf(it),
    }));
  const reportPart = () =>
    onPartDone?.({
      format: 'amrap',
      durationSeconds: elapsed,
      roundsCompleted: rounds,
      totalVolume: totals.volume,
      results: resultsList(),
      stats: [],
      marks: [
        { name: 'Rondas completas', value: String(rounds), prev: null, improved: false },
        ...repsItems
          .filter(({ it }) => (partial[it.id] ?? 0) > 0)
          .map(({ it }) => ({ name: it.exercise?.name ?? '', value: `+${partial[it.id]}`, prev: null, improved: false })),
      ],
    });
  const save = () => {
    setSaveError(null);
    const results = resultsList();
    saveMutation.mutate({
      workoutId: workout.id,
      workoutName: workout.name,
      format: 'amrap',
      startedAt: startRef.current ? new Date(startRef.current).toISOString() : null,
      completedAt: new Date().toISOString(),
      durationSeconds: elapsed,
      roundsCompleted: rounds,
      totalVolume: totals.volume,
      results,
    });
  };

  // ---- Running -------------------------------------------------------------
  if (phase === 'running') {
    const last = workout.lastLog?.roundsCompleted;
    return (
      <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center px-5">
          <Pressable onPress={() => router.back()} hitSlop={12} className="h-10 w-10 items-center justify-center">
            <Text className="text-[18px] text-ink-3">✕</Text>
          </Pressable>
          <Text numberOfLines={1} className="flex-1 text-center font-semibold text-[14px] text-ink">
            {workout.name} · AMRAP{partCount && partCount > 1 ? ` · parte ${partIndex}/${partCount}` : ''}
          </Text>
          <View className="h-10 w-10" />
        </View>

        <View className="items-center pb-2 pt-1">
          <Text className="font-mono-medium text-[10px] uppercase tracking-widest text-ink-3">Restante</Text>
          <Text className="font-mono text-[68px] leading-none text-accent">{mmss(remaining)}</Text>
          {last != null ? (
            <Text className="mt-1 font-mono text-[11px] text-ink-4">Última vez: {last} rondas</Text>
          ) : null}
        </View>

        <View className="flex-row items-center justify-center gap-4 pb-3">
          <Pressable
            onPress={() => setRounds((r) => Math.max(0, r - 1))}
            className="h-12 w-12 items-center justify-center rounded-full bg-surface-2"
          >
            <Text className="text-[20px] text-ink">−</Text>
          </Pressable>
          <Pressable onPress={() => setPad({ kind: 'rounds' })} className="items-center">
            <Text className="font-extrabold text-[52px] leading-none text-ink">{rounds}</Text>
            <Text className="font-mono-medium text-[10px] uppercase tracking-widest text-ink-3">Rondas</Text>
          </Pressable>
          <View className="h-12 w-12" />
        </View>

        <Pressable
          onPress={() => setRounds((r) => r + 1)}
          className="mx-5 mb-3 h-16 items-center justify-center rounded-2xl bg-accent active:opacity-80"
        >
          <Text className="font-bold text-[18px] text-white">+ Ronda completada</Text>
        </Pressable>

        <Text className="px-5 pb-1 font-mono-medium text-[10px] uppercase tracking-widest text-ink-3">
          El circuito
        </Text>
        <ScrollView contentContainerClassName="gap-3 px-5 pb-4">
          {blocksView.map((bv, i) => {
            const label = [bv.name, bv.rounds > 1 ? `× ${bv.rounds} rondas` : '']
              .filter(Boolean)
              .join('  ·  ');
            return (
            <View key={i} className="gap-0.5">
              {label ? (
                <Text className="pb-0.5 font-mono-semibold text-[11px] uppercase tracking-wider text-accent">
                  {label}
                </Text>
              ) : null}
              {bv.items.map((it) =>
                it.kind === 'rest' ? (
                  <View key={it.id} className="flex-row items-center gap-3 border-b border-line-2 py-2">
                    <Text className="w-14 font-mono-semibold text-[15px] text-ink-4">
                      {it.workSeconds != null
                        ? it.workSeconds >= 60
                          ? mmss(it.workSeconds)
                          : `${it.workSeconds} s`
                        : '—'}
                    </Text>
                    <Text numberOfLines={1} className="min-w-0 flex-1 font-semibold text-[15px] text-ink-3">
                      Descanso
                    </Text>
                  </View>
                ) : (
                  <View key={it.id} className="flex-row items-center gap-3 border-b border-line-2 py-2">
                    <Text className="w-14 font-mono-semibold text-[15px] text-accent">
                      {targetText(it, units.distance)}
                    </Text>
                    <Text numberOfLines={1} className="min-w-0 flex-1 font-semibold text-[15px] text-ink">
                      {it.exercise?.name}
                    </Text>
                    {loadKgOf(it) != null ? (
                      <Text className="font-mono text-[12px] text-ink-3">
                        {formatWeight(loadKgOf(it), units.weight)}
                      </Text>
                    ) : null}
                  </View>
                ),
              )}
            </View>
            );
          })}
        </ScrollView>

        <View className="px-5" style={{ paddingBottom: insets.bottom + 12 }}>
          <Pressable
            onPress={() => stop('partial')}
            className="h-[52px] items-center justify-center rounded-xl bg-surface-2"
          >
            <Text className="font-bold text-[16px] text-ink">Terminar</Text>
          </Pressable>
        </View>

        {pad?.kind === 'rounds' ? (
          <NumPad
            initial={rounds}
            unit="rondas"
            label="Rondas"
            onClose={() => setPad(null)}
            onSubmit={(v) => setRounds(Math.max(0, Math.round(v)))}
          />
        ) : null}
      </View>
    );
  }

  // ---- Partial round -------------------------------------------------------
  if (phase === 'partial') {
    return (
      <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 16 }}>
        <Text className="font-extrabold text-[24px] leading-tight tracking-tight text-ink">
          Tu última ronda
        </Text>
        <Text className="mb-4 mt-1.5 font-sans text-[14px] leading-6 text-ink-3">
          ¿Cuántas reps completaste de cada ejercicio en la ronda que dejaste a medias? (déjalo en 0
          si no la empezaste)
        </Text>
        <ScrollView className="flex-1" contentContainerClassName="gap-2.5">
          {repsItems.map(({ it, blockRounds }) => {
            const val = partial[it.id] ?? 0;
            const target = blockRounds * (it.reps ?? 0);
            return (
              <View key={it.id} className="flex-row items-center gap-3 rounded-xl bg-surface p-2.5">
                <Text numberOfLines={1} className="min-w-0 flex-1 font-semibold text-[15px] text-ink">
                  {it.exercise?.name}
                  <Text className="font-mono text-[12px] text-ink-4"> /{target}</Text>
                </Text>
                <Pressable
                  onPress={() => setPartial((p) => ({ ...p, [it.id]: Math.max(0, val - 1) }))}
                  className="h-10 w-10 items-center justify-center rounded-lg bg-surface-2"
                >
                  <Text className="text-[18px] text-ink">−</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    setPad({ kind: 'partial', id: it.id, name: it.exercise?.name ?? 'Reps', target })
                  }
                  className="h-10 w-10 items-center justify-center rounded-lg border border-accent bg-surface"
                >
                  <Text className="text-center font-extrabold text-[18px] text-ink">{val}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPartial((p) => ({ ...p, [it.id]: Math.min(target, val + 1) }))}
                  className="h-10 w-10 items-center justify-center rounded-lg bg-surface-2"
                >
                  <Text className="text-[18px] text-ink">+</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
        <View style={{ paddingBottom: insets.bottom + 12, paddingTop: 12 }}>
          <Pressable
            onPress={() => (onPartDone ? reportPart() : setPhase(renderCooldown ? 'cooldown' : 'summary'))}
            className="h-[54px] items-center justify-center rounded-xl bg-accent active:opacity-80"
          >
            <Text className="font-bold text-[17px] text-white">{onPartDone ? 'Siguiente parte' : 'Ver resumen'}</Text>
          </Pressable>
        </View>

        {pad?.kind === 'partial' ? (
          <NumPad
            initial={partial[pad.id] ?? 0}
            unit="reps"
            label={pad.name}
            onClose={() => setPad(null)}
            onSubmit={(v) =>
              setPartial((p) => ({ ...p, [pad.id]: Math.max(0, Math.min(pad.target, Math.round(v))) }))
            }
          />
        ) : null}
      </View>
    );
  }

  // ---- Cooldown (before results) -------------------------------------------
  if (phase === 'cooldown' && renderCooldown) {
    return <>{renderCooldown(() => setPhase('summary'))}</>;
  }

  // ---- Summary -------------------------------------------------------------
  const partialBreakdown = repsItems
    .filter(({ it }) => (partial[it.id] ?? 0) > 0)
    .map(({ it }) => `${partial[it.id]} ${it.exercise?.name}`);
  return (
    <View className="flex-1 bg-bg px-6" style={{ paddingTop: insets.top + 24 }}>
      <Text className="font-mono-semibold text-[11px] uppercase tracking-[0.18em] text-accent">
        AMRAP completado
      </Text>
      <Text className="mt-2 font-extrabold text-[30px] leading-tight tracking-tight text-ink">
        {workout.name}
      </Text>

      <View className="mt-6 items-center rounded-2xl bg-surface p-6">
        <Text className="font-extrabold text-[64px] leading-none text-ink">{rounds}</Text>
        <Text className="font-mono-medium text-[11px] uppercase tracking-widest text-ink-3">
          rondas completas
        </Text>
        {partialBreakdown.length > 0 ? (
          <Text className="mt-3 text-center font-mono text-[13px] leading-5 text-ink-2">
            + {partialBreakdown.join('  +  ')}
          </Text>
        ) : null}
      </View>

      <View className="mt-4 flex-row gap-2.5">
        <View className="flex-1 gap-1 rounded-xl bg-surface p-3.5">
          <Text className="font-mono-medium text-[9px] uppercase tracking-widest text-ink-3">Tiempo</Text>
          <Text className="font-extrabold text-[24px] leading-none text-ink">{mmss(elapsed)}</Text>
        </View>
        <View className="flex-1 gap-1 rounded-xl bg-surface p-3.5">
          <Text className="font-mono-medium text-[9px] uppercase tracking-widest text-ink-3">
            Volumen
          </Text>
          <Text className="font-extrabold text-[24px] leading-none text-ink">
            {totals.volume}{' '}
            <Text className="font-semibold text-[13px] text-ink-3">reps</Text>
          </Text>
        </View>
      </View>

      <View className="flex-1" />
      {saveError ? (
        <Text className="text-center font-medium text-[13px] text-accent">{saveError}</Text>
      ) : null}
      <Pressable
        onPress={save}
        disabled={saveMutation.isPending}
        className={`mb-9 mt-3 h-[54px] items-center justify-center rounded-xl bg-accent ${saveMutation.isPending ? 'opacity-60' : 'active:opacity-80'}`}
        style={{ marginBottom: insets.bottom + 16 }}
      >
        <Text className="font-bold text-[17px] text-white">
          {saveMutation.isPending ? 'Guardando…' : 'Guardar y salir'}
        </Text>
      </Pressable>
    </View>
  );
}
