import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateWorkoutLogInput, SetResultInput } from '@dmtx/schemas';
import { Loading } from '../../../components/ui';
import {
  RepsScreen,
  RestScreen,
  SummaryScreen,
  TimeScreen,
  type MarkRow,
  type Nav,
} from '../../../components/player';
import { AmrapPlayer } from '../../../components/player-amrap';
import { api } from '../../../lib/api';
import { buildSession, type ExerciseStep, type Step, type StepMeasure } from '../../../lib/session';
import { mmss } from '../../../lib/format';
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
  if (q.data.format === 'amrap') return <AmrapPlayer workout={q.data} />;
  return <Player workout={q.data} />;
}

function Player({ workout }: { workout: NonNullable<Awaited<ReturnType<typeof api.workout>>> }) {
  const router = useRouter();
  const session = useMemo(() => buildSession(workout), [workout]);

  const exerciseSteps = useMemo(
    () => session.steps.filter((s): s is ExerciseStep => s.type === 'exercise'),
    [session],
  );

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
    onSuccess: () => router.back(),
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
    opts: { reps?: number; seconds?: number; display: string },
  ) => {
    const lastVal = s.measure === 'time' ? (s.last?.seconds ?? null) : (s.last?.reps ?? null);
    const cur = opts.reps ?? opts.seconds ?? null;
    const prevDisplay =
      lastVal != null
        ? s.measure === 'time'
          ? lastVal >= 60
            ? mmss(lastVal)
            : `${lastVal} s`
          : `${lastVal} reps`
        : null;
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
        distanceMeters: null,
        loadKg: s.loadKg,
        display: opts.display,
        prevDisplay,
        improved: lastVal != null && cur != null && cur > lastVal,
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
    const volume = list.reduce((sum, m) => sum + (m.reps || 0), 0);
    const roundsCompleted = session.mode === 'amrap' ? Math.max(0, round - 1) : null;
    const stats: { k: string; v: string }[] = [];
    if (session.mode === 'amrap') stats.push({ k: 'Rondas', v: String(roundsCompleted) });
    stats.push({ k: 'Tiempo', v: mmss(elapsed) });
    stats.push({ k: 'Ejercicios', v: String(list.length) });
    if (volume > 0) stats.push({ k: 'Volumen', v: `${volume}` });
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
