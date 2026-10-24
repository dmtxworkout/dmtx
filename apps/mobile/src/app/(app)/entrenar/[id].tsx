import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flattenBlocks } from '../../../lib/blocks';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateWorkoutLogInput, SetResultInput, TrainingMode } from '@dmtx/schemas';
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
import { CooldownFlow, SectionIntro, SegmentPlayer } from '../../../components/player-guided';
import { VideoPhase } from '../../../components/video-phase';
import { ModeChoice } from '../../../components/mode-choice';
import { localVideoUri, useDownload } from '../../../lib/downloads';
import type { WorkoutDetail } from '../../../lib/types';
import { api } from '../../../lib/api';
import { buildSession, type ExerciseStep, type Step, type StepMeasure } from '../../../lib/session';
import { mmss } from '../../../lib/format';
import { useUnits } from '../../../lib/units-context';
import { formatDistance, formatWeight } from '../../../lib/units';
import { es, formatLabel } from '../../../i18n';

const elapsedSince = (startMs: number) => Math.round((Date.now() - startMs) / 1000);

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

/**
 * A section as a list of PARTS, each a workout-shaped slice with its own format:
 * part blocks (AMRAP/EMOM/… holding blocks) become one part each; blocks outside
 * any part are grouped into format-less parts (a plain sequential walk).
 */
const sectionParts = (w: WorkoutDetail, section: 'warmup' | 'main' | 'cooldown'): WorkoutDetail[] => {
  const blocks = w.blocks.filter((b) => (b.section ?? 'main') === section);
  const parts: WorkoutDetail[] = [];
  let loose: WorkoutDetail['blocks'] = [];
  const flushLoose = () => {
    if (loose.length) parts.push({ ...w, format: 'circuit', formatConfig: null, blocks: loose });
    loose = [];
  };
  for (const b of blocks) {
    if (b.kind === 'part') {
      flushLoose();
      parts.push({ ...w, format: b.format ?? 'circuit', formatConfig: b.formatConfig, blocks: flattenBlocks(b.blocks) });
    } else loose.push(...flattenBlocks([b]));
  }
  flushLoose();
  return parts;
};
const hasExercises = (w: WorkoutDetail) =>
  w.blocks.some((b) => b.items.some((it) => it.kind === 'exercise' && it.exercise));

/** What one tracked part reports when it ends, merged into a single log at the end. */
export interface PartResult {
  format: WorkoutDetail['format'];
  durationSeconds: number;
  roundsCompleted: number | null;
  totalVolume: number | null;
  results: SetResultInput[];
  stats: { k: string; v: string }[];
  marks: MarkRow[];
}

/** The stretch: its video (if it has one), then its guided exercises (if any). */
function CooldownSequence({
  workout,
  view,
  parts,
  videoUri,
  offline,
  onDone,
}: {
  workout: WorkoutDetail;
  view: WorkoutDetail;
  parts: WorkoutDetail[];
  videoUri: string | null;
  offline: boolean;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'video' | 'parts'>(videoUri ? 'video' : 'parts');
  if (step === 'video' && videoUri) {
    return (
      <VideoPhase
        title="Estiramiento"
        name={workout.name}
        uri={videoUri}
        offline={offline}
        durationSeconds={workout.cooldownVideoDurationSeconds}
        notes={workout.videoNotes?.cooldown}
        doneLabel={parts.length ? 'Continuar' : 'Terminar'}
        onDone={() => (parts.length ? setStep('parts') : onDone())}
        onExit={onDone}
      />
    );
  }
  return <CooldownFlow workout={view} parts={parts} onDone={onDone} />;
}

/**
 * Sequences the optional warmup and cooldown around the tracked main workout.
 * Warmup/cooldown are guided but not recorded and never appear in the results.
 */
function Session({ workout }: { workout: WorkoutDetail }) {
  const router = useRouter();
  const { units } = useUnits();
  const warmupParts = useMemo(() => sectionParts(workout, 'warmup').filter(hasExercises), [workout]);
  const mainParts = useMemo(() => sectionParts(workout, 'main'), [workout]);
  const cooldownParts = useMemo(() => sectionParts(workout, 'cooldown').filter(hasExercises), [workout]);
  // Whole-section views for the intros (all parts, flattened by CircuitView).
  const warmupView = useMemo<WorkoutDetail>(
    () => ({ ...workout, blocks: workout.blocks.filter((b) => b.section === 'warmup') }),
    [workout],
  );
  const mainView = useMemo<WorkoutDetail>(
    () => ({ ...workout, blocks: workout.blocks.filter((b) => (b.section ?? 'main') === 'main') }),
    [workout],
  );
  const cooldownView = useMemo<WorkoutDetail>(
    () => ({ ...workout, blocks: workout.blocks.filter((b) => b.section === 'cooldown') }),
    [workout],
  );
  // Each section may be written, a video, or both. With both somewhere, the
  // user chooses once: follow the class (each section's video where it has
  // one) or be guided (each section's exercises where it has them). A section
  // with only one of the two plays that one either way.
  const download = useDownload(workout.id);
  const warmupUrl = workout.warmupVideoUrl ? (localVideoUri(download, 'warmup') ?? workout.warmupVideoUrl) : null;
  const mainVideo = workout.videoUrl ? (localVideoUri(download, 'main') ?? workout.videoUrl) : null;
  const cooldownUrl = workout.cooldownVideoUrl ? (localVideoUri(download, 'cooldown') ?? workout.cooldownVideoUrl) : null;
  const mainGuided = workout.isGuided && mainParts.length > 0;
  const canChoose =
    (!!warmupUrl && warmupParts.length > 0) || (workout.hasVideo && mainGuided) || (!!cooldownUrl && cooldownParts.length > 0);
  const [mode, setMode] = useState<TrainingMode | null>(null);
  const classMode = mode === 'class';
  const warmupVideo = warmupUrl && (classMode || warmupParts.length === 0) ? warmupUrl : null;
  const warmupGuidedParts = warmupVideo ? [] : warmupParts;
  const cooldownVideo = cooldownUrl && (classMode || cooldownParts.length === 0) ? cooldownUrl : null;
  const cooldownGuidedParts = cooldownVideo ? [] : cooldownParts;
  // The video class replaces the tracked work (a pending video still counts: it shows «se está preparando»).
  const mainIsVideo = workout.hasVideo && (classMode || !mainGuided);
  const hasWarmup = warmupGuidedParts.length > 0;
  const hasCooldown = cooldownGuidedParts.length > 0 || !!cooldownVideo;
  // What gets recorded: how the main work was done, whether or not there was a choice.
  const loggedMode: TrainingMode = mainIsVideo ? 'class' : 'guided';

  type Phase = 'choose' | 'warmup-video' | 'warmup-intro' | 'warmup' | 'warmup-done' | 'main-video' | 'main' | 'cooldown' | 'summary' | 'finished';
  const firstPhase = (wv: boolean, hw: boolean, mv: boolean): Phase => (wv ? 'warmup-video' : hw ? 'warmup-intro' : mv ? 'main-video' : 'main');
  const [phase, setPhase] = useState<Phase>(() =>
    canChoose ? 'choose' : firstPhase(!!warmupVideo, hasWarmup, mainIsVideo),
  );
  const goMain = () => setPhase(mainIsVideo ? 'main-video' : 'main');
  const [warmupIdx, setWarmupIdx] = useState(0);
  const [mainIdx, setMainIdx] = useState(0);
  const [results, setResults] = useState<PartResult[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const startRef = useRef(0);
  useEffect(() => {
    startRef.current = Date.now();
  }, []);
  const exit = () => router.back();

  const saveMutation = useMutation({
    mutationFn: (payload: CreateWorkoutLogInput) => api.saveLog(payload),
    onSuccess: exit,
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'No se pudo guardar'),
  });
  // A class has no marks, but finishing it is still a session: logged as soon as the finish screen shows.
  const classLog = useMutation({ mutationFn: (payload: CreateWorkoutLogInput) => api.saveLog(payload) });
  const classLogged = useRef(false);
  useEffect(() => {
    if (phase !== 'finished' || classLogged.current) return;
    classLogged.current = true;
    classLog.mutate({
      workoutId: workout.id,
      workoutName: workout.name,
      format: null,
      mode: loggedMode,
      startedAt: new Date(startRef.current).toISOString(),
      completedAt: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - startRef.current) / 1000),
      results: [],
    });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'choose') {
    return (
      <ModeChoice
        name={workout.name}
        videoSeconds={workout.videoDurationSeconds}
        onChoose={(m) => {
          setMode(m);
          const cls = m === 'class';
          const wv = !!warmupUrl && (cls || warmupParts.length === 0);
          const hw = !wv && warmupParts.length > 0;
          const mv = workout.hasVideo && (cls || !mainGuided);
          setPhase(firstPhase(wv, hw, mv));
        }}
        onExit={exit}
      />
    );
  }

  if (phase === 'warmup-video' && warmupVideo) {
    return (
      <VideoPhase
        title="Calentamiento"
        name={workout.name}
        uri={warmupVideo}
        offline={!!localVideoUri(download, 'warmup')}
        durationSeconds={workout.warmupVideoDurationSeconds}
        notes={workout.videoNotes?.warmup}
        doneLabel={hasWarmup ? 'Continuar' : 'Empezar rutina'}
        onDone={() => (hasWarmup ? setPhase('warmup-intro') : goMain())}
        onExit={exit}
      />
    );
  }
  if (phase === 'warmup-intro') {
    return (
      <SectionIntro
        workout={warmupView}
        title="Calentamiento"
        subtitle="¿Quieres calentar?"
        note="Calentar reduce el riesgo de lesión y te prepara para rendir mejor."
        doLabel="Hacer calentamiento"
        skipLabel="Saltar calentamiento"
        onDo={() => setPhase('warmup')}
        onSkip={goMain}
        onExit={exit}
      />
    );
  }
  if (phase === 'warmup') {
    const part = warmupGuidedParts[warmupIdx]!;
    return (
      <SegmentPlayer
        key={`w${warmupIdx}`}
        workout={part}
        onComplete={() => {
          if (warmupIdx + 1 < warmupGuidedParts.length) setWarmupIdx(warmupIdx + 1);
          else setPhase('warmup-done');
        }}
        onExit={exit}
      />
    );
  }
  if (phase === 'warmup-done') {
    return (
      <SectionIntro
        workout={mainView}
        title="Calentamiento completo"
        subtitle="Ahora empieza la rutina"
        doLabel="Empezar rutina"
        onDo={goMain}
        onExit={exit}
      />
    );
  }

  // The stretch runs after the work but before the results: its video first, then its exercises.
  const renderCooldown = hasCooldown
    ? (onDone: () => void) => (
        <CooldownSequence
          workout={workout}
          view={cooldownView}
          parts={cooldownGuidedParts}
          videoUri={cooldownVideo}
          offline={!!localVideoUri(download, 'cooldown')}
          onDone={onDone}
        />
      )
    : undefined;

  // A video class: nothing to track, so the stretch (if any) and a plain finish follow it.
  if (phase === 'main-video' && mainIsVideo) {
    if (!mainVideo) {
      return (
        <View className="flex-1 items-center justify-center gap-4 bg-bg px-8">
          <Text className="text-center font-extrabold text-[20px] text-ink">{workout.name}</Text>
          <Text className="text-center font-sans text-[14px] leading-6 text-ink-3">El video todavía se está preparando. Vuelve en unos minutos.</Text>
          <Pressable onPress={exit} className="h-[52px] items-center justify-center rounded-xl bg-surface-2 px-6">
            <Text className="font-semibold text-[15px] text-ink">Volver</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <VideoPhase
        title="Rutina"
        name={workout.name}
        uri={mainVideo}
        offline={!!localVideoUri(download, 'main')}
        durationSeconds={workout.videoDurationSeconds}
        notes={workout.videoNotes?.main}
        doneLabel={hasCooldown ? 'Continuar' : 'Terminar'}
        onDone={() => setPhase(hasCooldown ? 'cooldown' : 'finished')}
        onExit={exit}
      />
    );
  }
  if (phase === 'finished') {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-bg px-8">
        <Text className="text-center font-extrabold text-[24px] text-ink">¡Rutina completada!</Text>
        <Text className="text-center font-sans text-[14px] leading-6 text-ink-3">{workout.name}</Text>
        <Pressable onPress={exit} className="h-[52px] items-center justify-center rounded-xl bg-accent px-8">
          <Text className="font-bold text-[15px] text-white">Volver</Text>
        </Pressable>
      </View>
    );
  }

  // One main part: the players own their summary and save, as before.
  if (!mainIsVideo && mainParts.length <= 1) {
    const main = mainParts[0] ?? { ...workout, blocks: [] };
    if (main.format === 'amrap') return <AmrapPlayer workout={main} onFinish={exit} renderCooldown={renderCooldown} />;
    if (main.format === 'emom') return <EmomPlayer workout={main} onFinish={exit} renderCooldown={renderCooldown} />;
    return <Player workout={main} onFinish={exit} renderCooldown={renderCooldown} />;
  }

  // Several parts: each player reports its result; one combined summary + log.
  if (phase === 'main') {
    const part = mainParts[mainIdx]!;
    const onPartDone = (r: PartResult) => {
      const next = [...results, r];
      setResults(next);
      if (mainIdx + 1 < mainParts.length) setMainIdx(mainIdx + 1);
      else setPhase(hasCooldown ? 'cooldown' : 'summary');
    };
    const key = `m${mainIdx}`;
    if (part.format === 'amrap') return <AmrapPlayer key={key} workout={part} partIndex={mainIdx + 1} partCount={mainParts.length} onPartDone={onPartDone} />;
    if (part.format === 'emom') return <EmomPlayer key={key} workout={part} partIndex={mainIdx + 1} partCount={mainParts.length} onPartDone={onPartDone} />;
    return <Player key={key} workout={part} partIndex={mainIdx + 1} partCount={mainParts.length} onPartDone={onPartDone} />;
  }
  if (phase === 'cooldown' && renderCooldown) {
    return <>{renderCooldown(() => setPhase(mainIsVideo ? 'finished' : 'summary'))}</>;
  }

  // Combined summary.
  const elapsed = results.reduce((s, r) => s + r.durationSeconds, 0);
  const volume = results.reduce((s, r) => s + (r.totalVolume ?? 0), 0);
  const rounds = results.find((r) => r.roundsCompleted != null)?.roundsCompleted ?? null;
  const stats: { k: string; v: string }[] = [{ k: 'Partes', v: String(results.length) }];
  if (rounds != null) stats.push({ k: 'Rondas', v: String(rounds) });
  stats.push({ k: 'Tiempo', v: mmss(elapsed) });
  if (volume > 0) stats.push({ k: 'Volumen', v: workout.format === 'strength' ? formatWeight(volume, units.weight) : `${volume}` });
  const marks: MarkRow[] = results.flatMap((r, i) => [
    { name: `— ${formatLabel(r.format) || 'Parte'} ${i + 1} —`, value: mmss(r.durationSeconds), prev: null, improved: false },
    ...r.marks,
  ]);
  const save = () => {
    setSaveError(null);
    let pos = 0;
    saveMutation.mutate({
      workoutId: workout.id,
      workoutName: workout.name,
      format: mainParts[0]?.format ?? workout.format,
      mode: 'guided',
      startedAt: new Date(startRef.current).toISOString(),
      completedAt: new Date().toISOString(),
      durationSeconds: elapsed,
      roundsCompleted: rounds,
      totalVolume: volume || null,
      results: results.flatMap((r) => r.results.map((x) => ({ ...x, position: pos++ }))),
    });
  };
  return (
    <SummaryScreen
      name={workout.name}
      stats={stats}
      marks={marks}
      onSave={save}
      saving={saveMutation.isPending}
      error={saveError}
    />
  );
}

function Player({
  workout,
  onFinish,
  renderCooldown,
  onPartDone,
}: {
  workout: NonNullable<Awaited<ReturnType<typeof api.workout>>>;
  onFinish?: () => void;
  renderCooldown?: (onDone: () => void) => ReactNode;
  /** Multi-part session: report instead of showing the summary. */
  onPartDone?: (r: PartResult) => void;
  partIndex?: number;
  partCount?: number;
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
  const [phase, setPhase] = useState<'active' | 'cooldown' | 'summary'>('active');
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
    const secs = elapsedSince(startRef.current);
    setElapsed(secs);
    if (onPartDone) {
      onPartDone(partResult(secs));
      return;
    }
    setPhase(renderCooldown ? 'cooldown' : 'summary');
  };
  // The part's outcome from the current marks (shared by summary and onPartDone).
  const partResult = (secs: number): PartResult => {
    const list = Object.values(marks);
    const isStrength = session.format === 'strength';
    const tonnage = list.reduce((sum, m) => sum + (m.reps || 0) * (m.loadKg || 0), 0);
    const repVolume = list.reduce((sum, m) => sum + (m.reps || 0), 0);
    const volume = isStrength ? tonnage : repVolume;
    const roundsCompleted = session.mode === 'amrap' ? Math.max(0, round - 1) : null;
    return {
      format: session.format,
      durationSeconds: secs,
      roundsCompleted,
      totalVolume: volume || null,
      results: list.map((m, i) => ({
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
      })),
      stats: [],
      marks: list.map((m) => ({ name: m.name, value: m.display, prev: m.prevDisplay, improved: m.improved })),
    };
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

  if (phase === 'cooldown' && renderCooldown) {
    return <>{renderCooldown(() => setPhase('summary'))}</>;
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
        mode: 'guided',
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
