import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateWorkoutLogInput, SetResultInput } from '@dmtx/schemas';
import { Loading } from '../../../components/ui';
import {
  DistanceScreen,
  RepsScreen,
  RestScreen,
  StrengthSetScreen,
  SummaryScreen,
  TimeScreen,
  type MarkRow,
  type Nav,
} from '../../../components/player';
import { AmrapPlayer } from '../../../components/player-amrap';
import { EmomPlayer } from '../../../components/player-emom';
import { GuidedPlayer, SectionIntro } from '../../../components/player-guided';
import type { WorkoutDetail } from '../../../lib/types';
import { api } from '../../../lib/api';
import { buildSession, type ExerciseStep, type Step, type StepMeasure } from '../../../lib/session';
import { mmss } from '../../../lib/format';
import { useUnits } from '../../../lib/units-context';
import { formatDistance, formatWeight } from '../../../lib/units';
import { es } from '../../../i18n';

interface Mark {
  exerciseId: string;
  name: string;
  measure: StepMeasure;
  round: number;
  setNumber: number | null;
  reps: number | null;
  seconds: number | null;
  distanceMeters: number | null;
  loadKg: number | null;
  display: string;
  prevDisplay: string | null;
  improved: boolean;
}

export default function Entrenar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['workout', id], queryFn: () => api.workout(id) });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-center font-sans text-[15px] text-ink-3">{es.common.error}</Text>
      </View>
    );
  }
  return <Session workout={q.data} />;
}

const sectionWorkout = (w: WorkoutDetail, section: 'warmup' | 'main' | 'cooldown'): WorkoutDetail => ({
  ...w,
  blocks: w.blocks.filter((b) => (b.section ?? 'main') === section),
});
const hasExercises = (w: WorkoutDetail) =>
  w.blocks.some((b) => b.items.some((it) => it.kind === 'exercise' && it.exercise));

/**
 * Sequences the optional warmup and cooldown around the tracked main workout.
 * Warmup/cooldown are guided but not recorded and never appear in the results.
 */
function Session({ workout }: { workout: WorkoutDetail }) {
  const router = useRouter();
  const warmup = useMemo(() => sectionWorkout(workout, 'warmup'), [workout]);
  const main = useMemo(() => sectionWorkout(workout, 'main'), [workout]);
  const cooldown = useMemo(() => sectionWorkout(workout, 'cooldown'), [workout]);
  const hasWarmup = useMemo(() => hasExercises(warmup), [warmup]);
  const hasCooldown = useMemo(() => hasExercises(cooldown), [cooldown]);

  const [phase, setPhase] = useState<
    'warmup-intro' | 'warmup' | 'main' | 'cooldown-intro' | 'cooldown'
  >(hasWarmup ? 'warmup-intro' : 'main');
  const exit = () => router.back();

  if (phase === 'warmup-intro') {
    return (
      <SectionIntro
        workout={warmup}
        title="Calentamiento"
        subtitle="¿Quieres calentar?"
        doLabel="Hacer calentamiento"
        skipLabel="Saltar"
        onDo={() => setPhase('warmup')}
        onSkip={() => setPhase('main')}
        onExit={exit}
      />
    );
  }
  if (phase === 'warmup') {
    return <GuidedPlayer workout={warmup} onComplete={() => setPhase('main')} onExit={exit} />;
  }
  if (phase === 'cooldown-intro') {
    return (
      <SectionIntro
        workout={cooldown}
        title="Enfriamiento"
        subtitle="¿Quieres enfriar?"
        doLabel="Hacer enfriamiento"
        skipLabel="Saltar"
        onDo={() => setPhase('cooldown')}
        onSkip={exit}
        onExit={exit}
      />
    );
  }
  if (phase === 'cooldown') {
    return <GuidedPlayer workout={cooldown} onComplete={exit} onExit={exit} />;
  }

  const onFinish = () => (hasCooldown ? setPhase('cooldown-intro') : exit());
  if (workout.format === 'amrap') return <AmrapPlayer workout={main} onFinish={onFinish} />;
  if (workout.format === 'emom') return <EmomPlayer workout={main} onFinish={onFinish} />;
  return <Player workout={main} onFinish={onFinish} />;
}

function Player({
  workout,
  onFinish,
}: {
  workout: NonNullable<Awaited<ReturnType<typeof api.workout>>>;
  onFinish?: () => void;
}) {
  const router = useRouter();
  const { units } = useUnits();
  const session = useMemo(() => buildSession(workout), [workout]);

  const exerciseSteps = useMemo(
    () => session.steps.filter((s): s is ExerciseStep => s.type === 'exercise'),
    [session],
  );
  // Distinct exercises (strength counts sets as steps, so dedupe by item for
  // "ejercicio X de Y").
  const distinctItems = useMemo(() => {
    const seen: string[] = [];
    for (const e of exerciseSteps) if (!seen.includes(e.itemId)) seen.push(e.itemId);
    return seen;
  }, [exerciseSteps]);

  const [stepIndex, setStepIndex] = useState(0);
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<'active' | 'summary'>('active');
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [capRemaining, setCapRemaining] = useState(session.capSeconds ?? 0);
  const [elapsed, setElapsed] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const startRef = useRef(0);
  const capRef = useRef(session.capSeconds ?? 0);
  useEffect(() => {
    startRef.current = Date.now();
  }, []);

  const saveMutation = useMutation({
    mutationFn: (payload: CreateWorkoutLogInput) => api.saveLog(payload),
    onSuccess: () => (onFinish ? onFinish() : router.back()),
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'No se pudo guardar'),
  });

  const step: Step | undefined = session.steps[stepIndex];

  const finish = () => {
    setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    setPhase('summary');
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  // Global cap countdown (AMRAP): tick, and end the session when it hits zero.
  useEffect(() => {
    if (session.capSeconds == null || phase !== 'active') return;
    const t = setInterval(() => {
      capRef.current = Math.max(0, capRef.current - 1);
      setCapRemaining(capRef.current);
      if (capRef.current === 0) {
        clearInterval(t);
        finishRef.current();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [session.capSeconds, phase]);

  const advance = () => {
    const nextI = stepIndex + 1;
    if (nextI >= session.steps.length) {
      if (session.mode === 'amrap' && capRemaining > 0) {
        setRound((r) => r + 1);
        setStepIndex(0);
      } else {
        finish();
      }
    } else {
      setStepIndex(nextI);
    }
  };

  const logExercise = (
    s: ExerciseStep,
    opts: { reps?: number; seconds?: number; distanceMeters?: number; loadKg?: number; display: string },
  ) => {
    // loadKg is stored as decimal kg, so the lb/kg conversion is kept exact.
    const loadKg = opts.loadKg ?? s.loadKg ?? null;
    // "Beat your last": weighted reps compare volume (reps × kg); else raw measure.
    let prevDisplay: string | null = null;
    let improved = false;
    if (s.measure === 'time') {
      const last = s.last?.seconds ?? null;
      prevDisplay = last != null ? (last >= 60 ? mmss(last) : `${last} s`) : null;
      improved = last != null && opts.seconds != null && opts.seconds > last;
    } else if (s.measure === 'distance') {
      const last = s.last?.distanceMeters ?? null;
      prevDisplay = last != null ? formatDistance(last, units.distance) : null;
      improved = last != null && opts.distanceMeters != null && opts.distanceMeters > last;
    } else {
      const lastReps = s.last?.reps ?? null;
      const lastLoad = s.last?.loadKg ?? null;
      if (lastReps != null && lastLoad != null && loadKg != null) {
        prevDisplay = `${lastReps} × ${formatWeight(lastLoad, units.weight)}`;
        improved = opts.reps != null && opts.reps * loadKg > lastReps * lastLoad;
      } else if (lastReps != null) {
        prevDisplay = `${lastReps} reps`;
        improved = opts.reps != null && opts.reps > lastReps;
      }
    }
    setMarks((m) => ({
      ...m,
      [`${s.key}:${round}`]: {
        exerciseId: s.exerciseId,
        name: s.name,
        measure: s.measure,
        round,
        setNumber: s.set,
        reps: opts.reps ?? null,
        seconds: opts.seconds ?? null,
        distanceMeters: opts.distanceMeters ?? null,
        loadKg,
        display: opts.display,
        prevDisplay,
        improved,
      },
    }));
  };

  if (session.steps.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-bg px-8">
        <Text className="text-center font-extrabold text-[20px] text-ink">{workout.name}</Text>
        <Text className="text-center font-sans text-[14px] leading-6 text-ink-3">
          Esta rutina es un video, no tiene reproductor por pasos.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="h-[52px] items-center justify-center rounded-xl bg-surface-2 px-6"
        >
          <Text className="font-semibold text-[15px] text-ink">Volver</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'summary') {
    const list = Object.values(marks);
    // Strength scores tonnage (Σ reps × kg); everything else scores total reps.
    const isStrength = session.format === 'strength';
    const tonnage = list.reduce((sum, m) => sum + (m.reps || 0) * (m.loadKg || 0), 0);
    const repVolume = list.reduce((sum, m) => sum + (m.reps || 0), 0);
    const volume = isStrength ? tonnage : repVolume;
    const roundsCompleted = session.mode === 'amrap' ? Math.max(0, round - 1) : null;
    const stats: { k: string; v: string }[] = [];
    if (session.mode === 'amrap') stats.push({ k: 'Rondas', v: String(roundsCompleted) });
    stats.push({ k: 'Tiempo', v: mmss(elapsed) });
    stats.push({ k: 'Ejercicios', v: String(list.length) });
    if (volume > 0)
      stats.push({ k: 'Volumen', v: isStrength ? formatWeight(volume, units.weight) : `${volume}` });
    const markRows: MarkRow[] = list.map((m) => ({
      name: m.name,
      value: m.display,
      prev: m.prevDisplay,
      improved: m.improved,
    }));

    const save = () => {
      setSaveError(null);
      const results: SetResultInput[] = list.map((m, i) => ({
        exerciseId: m.exerciseId,
        exerciseName: m.name,
        position: i,
        round: m.round,
        setNumber: m.setNumber,
        measure: m.measure,
        reps: m.reps,
        seconds: m.seconds,
        distanceMeters: m.distanceMeters,
        loadKg: m.loadKg,
      }));
      saveMutation.mutate({
        workoutId: session.workoutId,
        workoutName: session.name,
        format: session.format,
        startedAt: startRef.current ? new Date(startRef.current).toISOString() : null,
        completedAt: new Date().toISOString(),
        durationSeconds: elapsed,
        roundsCompleted,
        totalVolume: volume || null,
        results,
      });
    };

    return (
      <SummaryScreen
        name={workout.name}
        stats={stats}
        marks={markRows}
        onSave={save}
        saving={saveMutation.isPending}
        error={saveError}
      />
    );
  }

  if (!step) return <Loading />;

  const navFor = (s: Step): Nav => {
    if (s.type !== 'exercise') return { exercisePos: 0, exerciseTotal: exerciseSteps.length, segIndex: 0, segCount: 1 };
    const blockEx = exerciseSteps.filter((e) => e.blockIndex === s.blockIndex);
    return {
      exercisePos: exerciseSteps.indexOf(s) + 1,
      exerciseTotal: exerciseSteps.length,
      segIndex: blockEx.indexOf(s),
      segCount: blockEx.length,
    };
  };

  if (step.type === 'rest') {
    return (
      <RestScreen
        key={step.key}
        step={step}
        onExit={() => router.back()}
        onDone={advance}
        onSkip={advance}
      />
    );
  }

  if (step.measure === 'time') {
    return (
      <TimeScreen
        key={step.key}
        step={step}
        session={session}
        round={round}
        nav={navFor(step)}
        onExit={() => router.back()}
        onDone={() => {
          const secs = step.targetSeconds ?? 0;
          logExercise(step, { seconds: secs, display: secs >= 60 ? mmss(secs) : `${secs} s` });
          advance();
        }}
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
        round={round}
        nav={navFor(step)}
        onExit={() => router.back()}
        onDone={(meters) => {
          logExercise(step, { distanceMeters: meters, display: formatDistance(meters, units.distance) });
          advance();
        }}
        onSkip={advance}
      />
    );
  }

  if (session.format === 'strength' && step.measure === 'reps') {
    const strengthNav: Nav = {
      exercisePos: distinctItems.indexOf(step.itemId) + 1,
      exerciseTotal: distinctItems.length,
      segIndex: (step.set ?? 1) - 1,
      segCount: step.totalSets ?? 1,
    };
    return (
      <StrengthSetScreen
        key={step.key}
        step={step}
        session={session}
        nav={strengthNav}
        onExit={() => router.back()}
        onDone={(reps, loadKg) => {
          const display = loadKg > 0 ? `${reps} × ${formatWeight(loadKg, units.weight)}` : `${reps} reps`;
          logExercise(step, { reps, loadKg, display });
          advance();
        }}
        onSkip={advance}
      />
    );
  }

  return (
    <RepsScreen
      key={step.key}
      step={step}
      session={session}
      round={round}
      nav={navFor(step)}
      capRemaining={session.capSeconds != null ? capRemaining : null}
      onExit={() => router.back()}
      onDone={(mark) => {
        logExercise(step, { reps: mark, display: `${mark} reps` });
        advance();
      }}
      onSkip={advance}
    />
  );
}
