import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { colors } from '../theme';
import { es, formatLabel } from '../i18n';
import { mmss, tempoCompact } from '../lib/format';
import type { ExerciseStep, RestStep, Session } from '../lib/session';

/** Countdown that ticks while `running`, fires `onDone` once at zero. */
function useCountdown(total: number, running: boolean, onDone: () => void) {
  // Each step remounts this hook (screens are keyed by step.key), so initial
  // state from `total` is always correct — no reset effect needed.
  const [remaining, setRemaining] = useState(total);
  const onDoneRef = useRef(onDone);
  const doneRef = useRef(false);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (!doneRef.current) {
            doneRef.current = true;
            onDoneRef.current();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, total]);

  const adjust = (delta: number) =>
    setRemaining((r) => {
      doneRef.current = false;
      return Math.max(0, r + delta);
    });
  return { remaining, adjust };
}

/** Looping, muted demo video with a placeholder fallback. */
function Demo({ uri, aspect }: { uri: string | null; aspect: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <View className={`w-full overflow-hidden rounded-2xl bg-[#1c1c21] ${aspect}`}>
      {uri ? (
        <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
      ) : null}
    </View>
  );
}

export interface Nav {
  exercisePos: number;
  exerciseTotal: number;
  segIndex: number;
  segCount: number;
}

function Header({
  session,
  nav,
  subtitle,
  onExit,
}: {
  session: Session;
  nav: Nav;
  subtitle: string;
  onExit: () => void;
}) {
  return (
    <View className="gap-3 px-5">
      <View className="flex-row items-center gap-3">
        <Pressable onPress={onExit} hitSlop={12} className="h-10 w-10 items-center justify-center">
          <Text className="text-[18px] text-ink-3">✕</Text>
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-center font-semibold text-[13px] text-ink">
            {session.name}
            {session.format ? ` · ${formatLabel(session.format)}` : ''}
          </Text>
          <Text className="text-center font-mono text-[11px] text-ink-3">{subtitle}</Text>
        </View>
        <View className="h-10 w-10" />
      </View>
      <View className="flex-row gap-1.5">
        {Array.from({ length: Math.max(1, nav.segCount) }).map((_, i) => (
          <View
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= nav.segIndex ? 'bg-accent' : 'bg-line'}`}
          />
        ))}
      </View>
    </View>
  );
}

/** Reps-based exercise: target + tempo + a score (marca) stepper. */
export function RepsScreen({
  step,
  session,
  round,
  nav,
  capRemaining,
  onExit,
  onDone,
  onSkip,
}: {
  step: ExerciseStep;
  session: Session;
  round: number;
  nav: Nav;
  capRemaining: number | null;
  onExit: () => void;
  onDone: (mark: number) => void;
  onSkip: () => void;
}) {
  const [mark, setMark] = useState(step.last?.reps ?? step.targetReps ?? 0);

  return (
    <View className="flex-1 bg-bg pt-14">
      <Header
        session={session}
        nav={nav}
        subtitle={`Ronda ${round} · ejercicio ${nav.exercisePos} de ${nav.exerciseTotal}`}
        onExit={onExit}
      />
      {capRemaining != null ? (
        <View className="mt-3 flex-row items-center justify-between px-5">
          <Text className="font-mono-semibold text-[13px] text-ink-3">Restante</Text>
          <Text className="font-mono text-[22px] text-accent">{mmss(capRemaining)}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerClassName="gap-4 px-5 pt-4 pb-4">
        <Demo uri={step.demoVideoUrl} aspect="aspect-[16/10]" />

        <View>
          <Text className="font-extrabold text-[25px] leading-tight tracking-tight text-ink">
            {step.name}
          </Text>
          {step.cue ? (
            <Text className="mt-1.5 font-mono text-[12px] leading-5 text-ink-3">{step.cue}</Text>
          ) : null}
        </View>

        <View className="flex-row gap-2.5">
          <View className="flex-1 gap-1 rounded-xl bg-surface p-3.5">
            <Text className="font-mono-medium text-[9px] uppercase tracking-widest text-ink-3">
              Objetivo
            </Text>
            <Text className="font-extrabold text-[26px] leading-none text-ink">
              {step.targetReps ?? '—'}{' '}
              <Text className="font-semibold text-[14px] text-ink-2">
                reps{step.perSide ? '/lado' : ''}
              </Text>
            </Text>
          </View>
          {step.tempo ? (
            <View className="flex-1 gap-1 rounded-xl bg-surface p-3.5">
              <Text className="font-mono-medium text-[9px] uppercase tracking-widest text-ink-3">
                Tempo
              </Text>
              <Text className="font-mono-semibold text-[26px] leading-none text-ink">
                {tempoCompact(step.tempo)}
              </Text>
            </View>
          ) : step.loadLabel ? (
            <View className="flex-1 gap-1 rounded-xl bg-surface p-3.5">
              <Text className="font-mono-medium text-[9px] uppercase tracking-widest text-ink-3">
                Carga
              </Text>
              <Text className="font-extrabold text-[26px] leading-none text-ink">
                {step.loadLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="gap-2.5">
          <View className="flex-row items-center justify-between">
            <Text className="font-mono-medium text-[10px] uppercase tracking-widest text-ink-3">
              Tu marca
            </Text>
            {step.last?.reps != null ? (
              <Text className="font-mono text-[11px] text-ink-4">Antes: {step.last.reps} reps</Text>
            ) : null}
          </View>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => setMark((m) => Math.max(0, m - 1))}
              className="h-[52px] w-[52px] items-center justify-center rounded-xl bg-surface-2"
            >
              <Text className="text-[22px] text-ink">−</Text>
            </Pressable>
            <View className="h-[52px] flex-1 flex-row items-baseline justify-center gap-1.5 rounded-xl border border-accent bg-surface">
              <Text className="font-extrabold text-[28px] text-ink">{mark}</Text>
              <Text className="font-semibold text-[14px] text-ink-2">reps</Text>
            </View>
            <Pressable
              onPress={() => setMark((m) => m + 1)}
              className="h-[52px] w-[52px] items-center justify-center rounded-xl bg-surface-2"
            >
              <Text className="text-[22px] text-ink">+</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View className="flex-row gap-2.5 px-5 pb-9 pt-2">
        <Pressable
          onPress={onSkip}
          className="h-[54px] w-[76px] items-center justify-center rounded-xl bg-surface-2"
        >
          <Text className="font-semibold text-[14px] text-ink-2">{es.common.skip}</Text>
        </Pressable>
        <Pressable
          onPress={() => onDone(mark)}
          className="h-[54px] flex-1 items-center justify-center rounded-xl bg-accent active:opacity-80"
        >
          <Text className="font-bold text-[17px] text-white">Hecho · siguiente</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Time-based exercise: a work countdown that auto-advances at zero. */
export function TimeScreen({
  step,
  session,
  round,
  nav,
  onExit,
  onDone,
  onSkip,
}: {
  step: ExerciseStep;
  session: Session;
  round: number;
  nav: Nav;
  onExit: () => void;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const total = step.targetSeconds ?? 30;
  const { remaining, adjust } = useCountdown(total, !paused, onDone);
  const pct = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;

  return (
    <View className="flex-1 bg-bg pt-14">
      <Header
        session={session}
        nav={nav}
        subtitle={`Ronda ${round} · ejercicio ${nav.exercisePos} de ${nav.exerciseTotal}`}
        onExit={onExit}
      />
      <View className="flex-1 items-center gap-5 px-5 pt-5">
        <Demo uri={step.demoVideoUrl} aspect="aspect-[16/9]" />
        <View className="items-center gap-1.5">
          <Text className="text-center font-extrabold text-[24px] tracking-tight text-ink">
            {step.name}
          </Text>
          {step.withinReps ? (
            <Text className="font-mono text-[12px] text-ink-3">
              {step.withinReps} reps en el intervalo
            </Text>
          ) : step.cue ? (
            <Text className="font-mono text-[12px] text-ink-3">{step.cue}</Text>
          ) : null}
          {step.last?.seconds != null ? (
            <Text className="font-mono text-[11px] text-ink-4">
              Antes: {step.last.seconds >= 60 ? mmss(step.last.seconds) : `${step.last.seconds} s`}
            </Text>
          ) : null}
        </View>

        <View className="h-[210px] w-[210px] items-center justify-center rounded-full border-[6px] border-surface-2">
          <View
            className="absolute inset-0 rounded-full border-[6px] border-transparent"
            style={{ borderTopColor: colors.accent, borderRightColor: pct > 25 ? colors.accent : 'transparent', borderBottomColor: pct > 50 ? colors.accent : 'transparent', borderLeftColor: pct > 75 ? colors.accent : 'transparent', transform: [{ rotate: '-45deg' }] }}
          />
          <Text className="font-mono-medium text-[10px] uppercase tracking-widest text-ink-3">
            Restante
          </Text>
          <Text className="font-mono text-[52px] leading-none text-ink">{mmss(remaining)}</Text>
          <Text className="font-mono text-[12px] text-ink-4">de {mmss(total)}</Text>
        </View>

        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => adjust(-10)}
            className="h-[54px] w-[54px] items-center justify-center rounded-full bg-surface-2"
          >
            <Text className="font-mono-semibold text-[12px] text-ink-2">−10</Text>
          </Pressable>
          <Pressable
            onPress={() => setPaused((p) => !p)}
            className="h-[66px] w-[66px] items-center justify-center rounded-full bg-ink"
          >
            <Text className="text-[20px] text-bg">{paused ? '▶' : '❚❚'}</Text>
          </Pressable>
          <Pressable
            onPress={() => adjust(10)}
            className="h-[54px] w-[54px] items-center justify-center rounded-full bg-surface-2"
          >
            <Text className="font-mono-semibold text-[12px] text-ink-2">+10</Text>
          </Pressable>
        </View>
      </View>

      <View className="flex-row gap-2.5 px-5 pb-9 pt-4">
        <Pressable
          onPress={onSkip}
          className="h-[54px] w-[76px] items-center justify-center rounded-xl bg-surface-2"
        >
          <Text className="font-semibold text-[14px] text-ink-2">{es.common.skip}</Text>
        </Pressable>
        <Pressable
          onPress={onDone}
          className="h-[54px] flex-1 items-center justify-center rounded-xl bg-surface-2"
        >
          <Text className="font-bold text-[17px] text-ink">Terminar antes</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Rest countdown between sets / rounds. */
export function RestScreen({
  step,
  onExit,
  onDone,
  onSkip,
}: {
  step: RestStep;
  onExit: () => void;
  onDone: () => void;
  onSkip: () => void;
}) {
  const { remaining, adjust } = useCountdown(step.seconds, true, onDone);
  return (
    <View className="flex-1 bg-bg pt-14">
      <View className="flex-row items-center gap-3 px-5">
        <Pressable onPress={onExit} hitSlop={12} className="h-10 w-10 items-center justify-center">
          <Text className="text-[18px] text-ink-3">✕</Text>
        </Pressable>
        <Text className="flex-1 text-center font-mono text-[11px] text-ink-3">Descanso</Text>
        <View className="h-10 w-10" />
      </View>

      <View className="flex-1 items-center justify-center gap-7 px-6">
        <View className="items-center gap-2">
          <Text className="font-mono-semibold text-[11px] uppercase tracking-[0.18em] text-accent">
            Descanso
          </Text>
          <Text className="font-mono text-[84px] leading-none text-ink">{mmss(remaining)}</Text>
        </View>
        <View className="flex-row gap-2.5">
          <Pressable
            onPress={() => adjust(30)}
            className="min-h-[44px] justify-center rounded-xl bg-surface-2 px-5"
          >
            <Text className="font-mono-semibold text-[13px] text-ink-2">+30 s</Text>
          </Pressable>
          <Pressable
            onPress={onSkip}
            className="min-h-[44px] justify-center rounded-xl bg-ink px-5"
          >
            <Text className="font-bold text-[14px] text-bg">Saltar descanso</Text>
          </Pressable>
        </View>

        {step.nextName ? (
          <View className="w-full gap-3 rounded-2xl bg-surface p-4">
            <Text className="font-mono-medium text-[10px] uppercase tracking-widest text-ink-3">
              Sigue
            </Text>
            <Text className="font-bold text-[16px] text-ink">{step.nextName}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export interface MarkRow {
  name: string;
  value: string;
  prev?: string | null;
  improved?: boolean;
}

/** Post-workout summary. */
export function SummaryScreen({
  name,
  stats,
  marks,
  onSave,
  saving = false,
  error = null,
}: {
  name: string;
  stats: { k: string; v: string }[];
  marks: MarkRow[];
  onSave: () => void;
  saving?: boolean;
  error?: string | null;
}) {
  return (
    <View className="flex-1 bg-bg px-6 pt-16">
      <Text className="font-mono-semibold text-[11px] uppercase tracking-[0.18em] text-accent">
        Rutina completada
      </Text>
      <Text className="mt-2 font-extrabold text-[30px] leading-tight tracking-tight text-ink">
        {name}
      </Text>

      <View className="mt-5 flex-row flex-wrap gap-2.5">
        {stats.map((s) => (
          <View key={s.k} className="min-w-[47%] flex-1 gap-1 rounded-xl bg-surface p-3.5">
            <Text className="font-mono-medium text-[9px] uppercase tracking-widest text-ink-3">
              {s.k}
            </Text>
            <Text className="font-extrabold text-[26px] leading-none text-ink">{s.v}</Text>
          </View>
        ))}
      </View>

      <Text className="mt-6 font-mono-medium text-[10px] uppercase tracking-widest text-ink-3">
        Tus marcas
      </Text>
      <ScrollView className="mt-2 flex-1" showsVerticalScrollIndicator={false}>
        {marks.length === 0 ? (
          <Text className="py-6 text-center font-sans text-[14px] text-ink-3">
            No registraste marcas.
          </Text>
        ) : (
          marks.map((m, i) => (
            <View key={i} className="flex-row items-center gap-3 border-b border-line-2 py-2.5">
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-semibold text-[14px] text-ink">
                  {m.name}
                </Text>
                {m.prev ? (
                  <Text className="font-mono text-[10px] text-ink-4">antes: {m.prev}</Text>
                ) : null}
              </View>
              <Text
                className={`font-mono-semibold text-[14px] ${m.improved ? 'text-success' : 'text-ink-2'}`}
              >
                {m.value}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {error ? (
        <Text className="mt-3 text-center font-medium text-[13px] text-accent">{error}</Text>
      ) : null}
      <Pressable
        onPress={onSave}
        disabled={saving}
        className={`mb-9 mt-3 h-[54px] items-center justify-center rounded-xl bg-accent ${saving ? 'opacity-60' : 'active:opacity-80'}`}
      >
        <Text className="font-bold text-[17px] text-white">
          {saving ? 'Guardando…' : 'Guardar y salir'}
        </Text>
      </Pressable>
    </View>
  );
}
