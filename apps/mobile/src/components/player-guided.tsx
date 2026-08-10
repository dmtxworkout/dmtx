import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RepsScreen, RestScreen, TimeScreen, DistanceScreen, type Nav } from './player';
import { CircuitView } from './circuit-view';
import { buildSession, type ExerciseStep, type Step } from '../lib/session';
import type { WorkoutDetail } from '../lib/types';

/**
 * Intro / prompt for an optional section (warmup or cooldown): shows the work
 * and lets the athlete do it or skip it. Progress is not tracked either way.
 */
export function SectionIntro({
  workout,
  title,
  subtitle,
  note,
  doLabel,
  skipLabel,
  onDo,
  onSkip,
  onExit,
}: {
  workout: WorkoutDetail;
  title: string;
  subtitle: string;
  note?: string;
  doLabel: string;
  skipLabel?: string;
  onDo: () => void;
  onSkip?: () => void;
  onExit: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center px-5">
        <Pressable onPress={onExit} hitSlop={12} className="h-10 w-10 items-center justify-center">
          <Text className="text-[18px] text-ink-3">✕</Text>
        </Pressable>
        <Text numberOfLines={1} className="flex-1 text-center font-semibold text-[14px] text-ink">
          {workout.name}
        </Text>
        <View className="h-10 w-10" />
      </View>

      <View className="px-6 pb-3 pt-4">
        <Text className="font-mono-semibold text-[11px] uppercase tracking-[0.18em] text-accent">
          {title}
        </Text>
        <Text className="mt-2 font-extrabold text-[26px] leading-tight tracking-tight text-ink">
          {subtitle}
        </Text>
        {note ? (
          <Text className="mt-2 font-sans text-[14px] leading-6 text-ink-3">{note}</Text>
        ) : null}
      </View>

      <ScrollView contentContainerClassName="gap-3 px-5 pb-4">
        <CircuitView workout={workout} />
      </ScrollView>

      <View className="gap-1 px-5 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
        <Pressable
          onPress={onDo}
          className="h-[54px] items-center justify-center rounded-xl bg-accent active:opacity-80"
        >
          <Text className="font-bold text-[16px] text-white">{doLabel}</Text>
        </Pressable>
        {onSkip ? (
          <Pressable onPress={onSkip} className="items-center justify-center py-3 active:opacity-60">
            <Text className="font-semibold text-[14px] text-ink-3">{skipLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The cooldown interstitial shown after the main work but before the results:
 * prompt to do it or skip straight to results, then guide it (untracked).
 * `onDone` fires for skip, exit, or completion — all lead to the results screen.
 */
export function CooldownFlow({ workout, onDone }: { workout: WorkoutDetail; onDone: () => void }) {
  const [p, setP] = useState<'intro' | 'run'>('intro');
  if (p === 'intro') {
    return (
      <SectionIntro
        workout={workout}
        title="Enfriamiento"
        subtitle="¿Quieres enfriar?"
        note="Enfriar ayuda a tu recuperación y baja las pulsaciones poco a poco."
        doLabel="Hacer enfriamiento"
        skipLabel="Saltar y ver resultados"
        onDo={() => setP('run')}
        onSkip={onDone}
        onExit={onDone}
      />
    );
  }
  return <GuidedPlayer workout={workout} onComplete={onDone} onExit={onDone} />;
}

/**
 * Guided walk-through of a section's exercises (warmup / cooldown). Steps through
 * the work with the same screens as the main player, but records nothing and
 * calls onComplete when finished.
 */
export function GuidedPlayer({
  workout,
  onComplete,
  onExit,
}: {
  workout: WorkoutDetail;
  onComplete: () => void;
  onExit: () => void;
}) {
  const session = useMemo(() => buildSession(workout), [workout]);
  const exerciseSteps = useMemo(
    () => session.steps.filter((s): s is ExerciseStep => s.type === 'exercise'),
    [session],
  );
  const [i, setI] = useState(0);
  const step: Step | undefined = session.steps[i];

  const advance = () => {
    if (i + 1 >= session.steps.length) onComplete();
    else setI(i + 1);
  };

  if (!step) return null;

  const navFor = (s: Step): Nav => {
    if (s.type !== 'exercise') return { exercisePos: 0, exerciseTotal: exerciseSteps.length, segIndex: 0, segCount: 1 };
    return {
      exercisePos: exerciseSteps.indexOf(s) + 1,
      exerciseTotal: exerciseSteps.length,
      segIndex: 0,
      segCount: 1,
    };
  };

  if (step.type === 'rest') {
    return <RestScreen key={step.key} step={step} onExit={onExit} onDone={advance} onSkip={advance} />;
  }
  if (step.measure === 'time') {
    return (
      <TimeScreen
        key={step.key}
        step={step}
        session={session}
        round={1}
        nav={navFor(step)}
        onExit={onExit}
        onDone={advance}
        onSkip={advance}
      />
    );
  }
  if (step.measure === 'distance') {
    return (
      <DistanceScreen
        key={step.key}
        step={step}
        session={session}
        round={1}
        nav={navFor(step)}
        onExit={onExit}
        onDone={advance}
        onSkip={advance}
      />
    );
  }
  return (
    <RepsScreen
      key={step.key}
      step={step}
      session={session}
      round={1}
      nav={navFor(step)}
      capRemaining={null}
      onExit={onExit}
      onDone={advance}
      onSkip={advance}
    />
  );
}
