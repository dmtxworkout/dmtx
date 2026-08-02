import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Loading } from '../../../components/ui';
import {
  RepsScreen,
  RestScreen,
  SummaryScreen,
  TimeScreen,
  type MarkRow,
  type Nav,
} from '../../../components/player';
import { api } from '../../../lib/api';
import { buildSession, type ExerciseStep, type Step } from '../../../lib/session';
import { mmss } from '../../../lib/format';
import { es } from '../../../i18n';

interface Mark {
  name: string;
  value: string;
  reps: number;
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
  const startRef = useRef(0);
  const capRef = useRef(session.capSeconds ?? 0);
  useEffect(() => {
    startRef.current = Date.now();
  }, []);

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

  const logExercise = (s: ExerciseStep, value: number, display: string) => {
    setMarks((m) => ({ ...m, [`${s.key}:${round}`]: { name: s.name, value: display, reps: value } }));
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
    const stats: { k: string; v: string }[] = [];
    if (session.mode === 'amrap') stats.push({ k: 'Rondas', v: String(Math.max(0, round - 1)) });
    stats.push({ k: 'Tiempo', v: mmss(elapsed) });
    stats.push({ k: 'Ejercicios', v: String(list.length) });
    if (volume > 0) stats.push({ k: 'Volumen', v: `${volume}` });
    const markRows: MarkRow[] = list.map((m) => ({ name: m.name, value: m.value }));
    return (
      <SummaryScreen
        name={workout.name}
        stats={stats}
        marks={markRows}
        onSave={() => router.back()}
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
          logExercise(step, secs, secs >= 60 ? mmss(secs) : `${secs} s`);
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
        logExercise(step, mark, `${mark} reps`);
        advance();
      }}
      onSkip={advance}
    />
  );
}
