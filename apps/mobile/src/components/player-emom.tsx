import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import type { CreateWorkoutLogInput } from '@dmtx/schemas';
import { api } from '../lib/api';
import { mmss } from '../lib/format';
import { CircuitView } from './circuit-view';
import type { WorkoutDetail } from '../lib/types';

/**
 * EMOM player: a per-interval countdown that resets each interval and auto-
 * advances, for N intervals. Shows the work to do (like AMRAP) — the athlete
 * does it and rests whatever's left of the interval.
 */
export function EmomPlayer({
  workout,
  onFinish,
  renderCooldown,
}: {
  workout: WorkoutDetail;
  onFinish?: () => void;
  renderCooldown?: (onDone: () => void) => ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const cfg = workout.formatConfig as { intervalSeconds?: number; rounds?: number } | null;
  const intervalSec = cfg?.intervalSeconds && cfg.intervalSeconds > 0 ? cfg.intervalSeconds : 60;
  const totalIntervals = cfg?.rounds && cfg.rounds > 0 ? cfg.rounds : 1;

  const [current, setCurrent] = useState(1);
  const [remaining, setRemaining] = useState(intervalSec);
  const [phase, setPhase] = useState<'running' | 'cooldown' | 'summary'>('running');
  const [elapsed, setElapsed] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const startRef = useRef(0);
  const currentRef = useRef(1);
  const remainingRef = useRef(intervalSec);
  useEffect(() => {
    startRef.current = Date.now();
  }, []);

  const finish = () => {
    setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    setPhase(renderCooldown ? 'cooldown' : 'summary');
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  // Interval countdown: reset + advance at zero, finish after the last interval.
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      const next = remainingRef.current - 1;
      if (next > 0) {
        remainingRef.current = next;
        setRemaining(next);
        return;
      }
      if (currentRef.current >= totalIntervals) {
        remainingRef.current = 0;
        setRemaining(0);
        clearInterval(id);
        finishRef.current();
        return;
      }
      currentRef.current += 1;
      remainingRef.current = intervalSec;
      setCurrent(currentRef.current);
      setRemaining(intervalSec);
    }, 1000);
    return () => clearInterval(id);
  }, [phase, intervalSec, totalIntervals]);

  const saveMutation = useMutation({
    mutationFn: (payload: CreateWorkoutLogInput) => api.saveLog(payload),
    onSuccess: () => (onFinish ? onFinish() : router.back()),
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'No se pudo guardar'),
  });
  const save = () => {
    setSaveError(null);
    saveMutation.mutate({
      workoutId: workout.id,
      workoutName: workout.name,
      format: 'emom',
      startedAt: startRef.current ? new Date(startRef.current).toISOString() : null,
      completedAt: new Date().toISOString(),
      durationSeconds: elapsed,
      roundsCompleted: currentRef.current,
      totalVolume: null,
      results: [],
    });
  };

  // ---- Cooldown (before results) -------------------------------------------
  if (phase === 'cooldown' && renderCooldown) {
    return <>{renderCooldown(() => setPhase('summary'))}</>;
  }

  // ---- Summary -------------------------------------------------------------
  if (phase === 'summary') {
    return (
      <View className="flex-1 bg-bg px-6" style={{ paddingTop: insets.top + 24 }}>
        <Text className="font-mono-semibold text-[11px] uppercase tracking-[0.18em] text-accent">
          EMOM completado
        </Text>
        <Text className="mt-2 font-extrabold text-[30px] leading-tight tracking-tight text-ink">
          {workout.name}
        </Text>
        <View className="mt-6 flex-row gap-2.5">
          <View className="flex-1 gap-1 rounded-xl bg-surface p-3.5">
            <Text className="font-mono-medium text-[9px] uppercase tracking-widest text-ink-3">
              Intervalos
            </Text>
            <Text className="font-extrabold text-[24px] leading-none text-ink">
              {current}
              <Text className="font-semibold text-[13px] text-ink-3"> / {totalIntervals}</Text>
            </Text>
          </View>
          <View className="flex-1 gap-1 rounded-xl bg-surface p-3.5">
            <Text className="font-mono-medium text-[9px] uppercase tracking-widest text-ink-3">Tiempo</Text>
            <Text className="font-extrabold text-[24px] leading-none text-ink">{mmss(elapsed)}</Text>
          </View>
        </View>

        <View className="flex-1" />
        {saveError ? (
          <Text className="text-center font-medium text-[13px] text-accent">{saveError}</Text>
        ) : null}
        <Pressable
          onPress={save}
          disabled={saveMutation.isPending}
          className={`mt-3 h-[54px] items-center justify-center rounded-xl bg-accent ${saveMutation.isPending ? 'opacity-60' : 'active:opacity-80'}`}
          style={{ marginBottom: insets.bottom + 16 }}
        >
          <Text className="font-bold text-[17px] text-white">
            {saveMutation.isPending ? 'Guardando…' : 'Guardar y salir'}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ---- Running -------------------------------------------------------------
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center px-5">
        <Pressable onPress={() => router.back()} hitSlop={12} className="h-10 w-10 items-center justify-center">
          <Text className="text-[18px] text-ink-3">✕</Text>
        </Pressable>
        <Text numberOfLines={1} className="flex-1 text-center font-semibold text-[14px] text-ink">
          {workout.name} · EMOM
        </Text>
        <View className="h-10 w-10" />
      </View>

      <View className="items-center pb-2 pt-2">
        <Text className="font-mono-medium text-[10px] uppercase tracking-widest text-ink-3">
          Intervalo {current} de {totalIntervals}
        </Text>
        <Text className="font-mono text-[72px] leading-none text-accent">{mmss(remaining)}</Text>
        <Text className="mt-1 font-mono text-[11px] text-ink-4">de {mmss(intervalSec)}</Text>
      </View>

      <View className="flex-row gap-1.5 px-5 pb-3">
        {Array.from({ length: Math.min(totalIntervals, 20) }).map((_, i) => (
          <View
            key={i}
            className={`h-1 flex-1 rounded-full ${i < current ? 'bg-accent' : 'bg-line'}`}
          />
        ))}
      </View>

      <Text className="px-5 pb-1 font-mono-medium text-[10px] uppercase tracking-widest text-ink-3">
        El trabajo
      </Text>
      <ScrollView contentContainerClassName="gap-3 px-5 pb-4">
        <CircuitView workout={workout} />
      </ScrollView>

      <View className="px-5" style={{ paddingBottom: insets.bottom + 12 }}>
        <Pressable
          onPress={finish}
          className="h-[52px] items-center justify-center rounded-xl bg-surface-2"
        >
          <Text className="font-bold text-[16px] text-ink">Terminar</Text>
        </Pressable>
      </View>
    </View>
  );
}
