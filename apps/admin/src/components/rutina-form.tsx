'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_STATUS, DIFFICULTY, WORKOUT_FORMAT } from '@dmtx/schemas';
import type {
  BlockType,
  CreateWorkoutInput,
  FormatConfig,
  LoadPrescription,
  MeasurementType,
  Workout,
  WorkoutFormat,
} from '@dmtx/schemas';
import type { ExerciseListItem } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MonoLabel } from '@/components/ui/mono-label';
import { MediaField } from '@/components/media-field';
import { MediaThumb } from '@/components/media-thumb';
import { EntityPicker } from '@/components/entity-picker';

const FORMAT_LABEL: Record<WorkoutFormat, string> = {
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'Tabata',
  strength: 'Fuerza',
  chipper: 'Chipper',
  for_time: 'Por tiempo',
  circuit: 'Circuito',
};

const FORMAT_FIELDS: Record<WorkoutFormat, { key: string; label: string }[]> = {
  amrap: [{ key: 'totalSeconds', label: 'Duración total (seg)' }],
  emom: [
    { key: 'intervalSeconds', label: 'Intervalo (seg)' },
    { key: 'rounds', label: 'Rondas' },
  ],
  tabata: [
    { key: 'workSeconds', label: 'Trabajo (seg)' },
    { key: 'restSeconds', label: 'Descanso (seg)' },
    { key: 'rounds', label: 'Rondas' },
  ],
  strength: [],
  chipper: [{ key: 'timeCapSeconds', label: 'Tiempo límite (seg)' }],
  for_time: [
    { key: 'timeCapSeconds', label: 'Tiempo límite (seg)' },
    { key: 'rounds', label: 'Rondas' },
  ],
  circuit: [
    { key: 'rounds', label: 'Rondas' },
    { key: 'restBetweenRoundsSeconds', label: 'Descanso/ronda (seg)' },
    { key: 'timeCapSeconds', label: 'Tiempo límite (seg)' },
  ],
};

// Plain-language explainer so the per-exercise fields make sense for the format.
const FORMAT_HELP: Record<WorkoutFormat, string> = {
  amrap: 'Repite el circuito las rondas que puedas dentro del tiempo límite. No hay series: define las reps objetivo por ejercicio.',
  emom: 'En cada intervalo haces el trabajo de un ejercicio y descansas el resto del minuto.',
  tabata: 'Trabajo/descanso fijos por N rondas (global). Los ejercicios rotan; sólo indica cuáles y su carga.',
  strength: 'Series × reps con carga y descanso entre series.',
  chipper: 'Haz cada ejercicio una vez, en orden, lo más rápido posible.',
  for_time: 'Completa el trabajo prescrito lo antes posible (opcional: tiempo límite).',
  circuit: 'Vueltas al circuito; las reps son por estación (las rondas se definen arriba).',
};

/** Which per-exercise columns a format shows. Only strength uses sets + rest-per-set. */
function itemColumns(format: WorkoutFormat) {
  const strength = format === 'strength';
  return { showSets: strength, showRest: strength, showTarget: format !== 'tabata' };
}

/** Formats configured as a single flat list of exercises (no blocks / grouping). */
const FLAT_FORMATS: WorkoutFormat[] = ['amrap'];

type TargetField = 'reps' | 'workSeconds' | 'distanceMeters';
/** The prescription field follows the exercise's own measurement type. */
function targetField(m?: MeasurementType): TargetField {
  if (m === 'time') return 'workSeconds';
  if (m === 'distance') return 'distanceMeters';
  return 'reps';
}
const TARGET_UNIT: Record<TargetField, string> = { reps: 'reps', workSeconds: 'seg', distanceMeters: 'm' };

type ItemState = {
  key: string;
  exerciseId: string;
  sets: string;
  reps: string;
  workSeconds: string;
  distanceMeters: string;
  rest: string;
  carga: string;
};

const emptyItem = (exerciseId: string): ItemState => ({
  key: uid(),
  exerciseId,
  sets: '',
  reps: '',
  workSeconds: '',
  distanceMeters: '',
  rest: '',
  carga: '',
});
type BlockState = {
  key: string;
  type: BlockType;
  rounds: string;
  restAfterSeconds: string;
  items: ItemState[];
};

const uid = () => crypto.randomUUID();
const num = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};

function loadToStr(l?: LoadPrescription | null): string {
  if (!l) return '';
  if (l.type === 'absolute') return String(l.value);
  if (l.type === 'percent_1rm') return `${l.value}%`;
  if (l.type === 'rpe') return `RPE ${l.value}`;
  return '';
}
function strToLoad(s: string): LoadPrescription | null {
  const t = s.trim();
  if (!t) return null;
  if (t.endsWith('%')) {
    const v = Number(t.slice(0, -1));
    return Number.isFinite(v) ? { type: 'percent_1rm', value: v } : null;
  }
  const rpe = t.match(/rpe\s*(\d+(?:\.\d+)?)/i);
  if (rpe) return { type: 'rpe', value: Number(rpe[1]) };
  const n = Number(t);
  return Number.isFinite(n) ? { type: 'absolute', value: n, unit: 'kg' } : null;
}

function buildFormatConfig(format: WorkoutFormat, cfg: Record<string, string>): FormatConfig {
  const n = (k: string, d = 0) => {
    const x = Number(cfg[k]);
    return Number.isFinite(x) && x > 0 ? Math.round(x) : d;
  };
  switch (format) {
    case 'amrap':
      return { format, configVersion: 1, totalSeconds: n('totalSeconds', 600) };
    case 'emom':
      return { format, configVersion: 1, intervalSeconds: n('intervalSeconds', 60), rounds: n('rounds', 10) };
    case 'tabata':
      return {
        format,
        configVersion: 1,
        workSeconds: n('workSeconds', 20),
        restSeconds: Math.max(0, Number(cfg.restSeconds) || 10),
        rounds: n('rounds', 8),
      };
    case 'strength':
      return { format, configVersion: 1 };
    case 'chipper': {
      const t = n('timeCapSeconds');
      return { format, configVersion: 1, ...(t > 0 ? { timeCapSeconds: t } : {}) };
    }
    case 'for_time': {
      const t = n('timeCapSeconds');
      const r = n('rounds');
      return { format, configVersion: 1, ...(t > 0 ? { timeCapSeconds: t } : {}), ...(r > 0 ? { rounds: r } : {}) };
    }
    case 'circuit': {
      const r = n('rounds');
      const rest = n('restBetweenRoundsSeconds');
      const t = n('timeCapSeconds');
      return {
        format,
        configVersion: 1,
        ...(r > 0 ? { rounds: r } : {}),
        ...(rest > 0 ? { restBetweenRoundsSeconds: rest } : {}),
        ...(t > 0 ? { timeCapSeconds: t } : {}),
      };
    }
  }
}

function initBlocks(w?: Workout): BlockState[] {
  if (!w) return [{ key: uid(), type: 'single', rounds: '', restAfterSeconds: '', items: [] }];
  return w.blocks.map((b) => ({
    key: uid(),
    type: b.type,
    rounds: b.rounds?.toString() ?? '',
    restAfterSeconds: b.restAfterSeconds?.toString() ?? '',
    items: b.items.map((it) => ({
      key: uid(),
      exerciseId: it.exerciseId,
      sets: it.sets?.toString() ?? '',
      reps: it.reps?.toString() ?? '',
      workSeconds: it.workSeconds?.toString() ?? '',
      distanceMeters: it.distanceMeters?.toString() ?? '',
      rest: it.restBetweenSeconds?.toString() ?? '',
      carga: loadToStr(it.loadPrescription),
    })),
  }));
}
function initCfg(w?: Workout): Record<string, string> {
  const out: Record<string, string> = {};
  const c = w?.formatConfig;
  if (c) for (const [k, v] of Object.entries(c)) if (k !== 'format' && k !== 'configVersion' && typeof v === 'number') out[k] = String(v);
  return out;
}

const boxCls =
  'h-[30px] w-full rounded-[7px] border border-[#e6e2d9] bg-surface-3 text-center font-mono text-[13px] font-medium focus:border-accent/40 focus:outline-none';

export function RutinaForm({ workout }: { workout?: Workout }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);

  const [name, setName] = useState(workout?.name ?? '');
  const [description, setDescription] = useState(workout?.description ?? '');
  const [difficulty, setDifficulty] = useState(workout?.difficulty ?? 'beginner');
  const [status, setStatus] = useState(workout?.status ?? 'draft');
  const [durationMin, setDurationMin] = useState(
    workout?.estimatedDurationSeconds ? String(Math.round(workout.estimatedDurationSeconds / 60)) : '',
  );
  const [type, setType] = useState<'structured' | 'video'>(workout?.type ?? 'structured');
  const [format, setFormat] = useState<WorkoutFormat>(workout?.format ?? 'amrap');
  const [formatCfg, setFormatCfg] = useState<Record<string, string>>(initCfg(workout));
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(workout?.thumbnailAssetId ?? null);
  const [videoAssetId, setVideoAssetId] = useState<string | null>(workout?.videoAssetId ?? null);
  const [blocks, setBlocks] = useState<BlockState[]>(() => initBlocks(workout));
  const [pickerBlock, setPickerBlock] = useState<string | null>(null);

  const { data: exList } = useQuery({
    queryKey: ['exercises', 'all'],
    queryFn: () => api.exercises.list({ pageSize: 500 }),
  });
  const exercise = (id: string) => exList?.data.find((e) => e.id === id);

  const setCfg = (k: string, v: string) => setFormatCfg((c) => ({ ...c, [k]: v }));
  const updateBlock = (key: string, patch: Partial<BlockState>) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const updateItem = (bk: string, ik: string, patch: Partial<ItemState>) =>
    setBlocks((bs) =>
      bs.map((b) =>
        b.key === bk ? { ...b, items: b.items.map((it) => (it.key === ik ? { ...it, ...patch } : it)) } : b,
      ),
    );

  const metaLine = [
    type === 'video' ? 'Video' : FORMAT_LABEL[format],
    durationMin ? `${durationMin} min` : null,
    es.difficulty[difficulty],
  ]
    .filter(Boolean)
    .join(' · ');

  // Per-exercise columns adapt to the selected format.
  const cols = itemColumns(format);
  const itemGtc = [
    'minmax(0,1fr)',
    cols.showSets && '56px',
    cols.showTarget && '72px',
    '74px',
    cols.showRest && '60px',
    '26px',
  ]
    .filter(Boolean)
    .join(' ');

  // Some formats (AMRAP) are a single flat list of exercises, not blocks.
  const flat = type === 'structured' && FLAT_FORMATS.includes(format);
  const flatItems = blocks.flatMap((b) => b.items.map((it) => ({ bk: b.key, it })));

  const addExerciseTo = (blockKey: string) => setPickerBlock(blockKey);
  const openFlatPicker = () => {
    if (blocks.length === 0) {
      const key = uid();
      setBlocks([{ key, type: 'single', rounds: '', restAfterSeconds: '', items: [] }]);
      setPickerBlock(key);
    } else {
      setPickerBlock(blocks[0]!.key);
    }
  };

  // Item header + row, reused by the flat list and the block editor.
  const itemHeader = () => (
    <div
      className="grid gap-3 border-b border-[#f4f1eb] px-3.5 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-2"
      style={{ gridTemplateColumns: itemGtc }}
    >
      <span>{es.pick.exercise.replace('Elegir ', '')}</span>
      {cols.showSets && <span className="text-center">{es.workouts.sets}</span>}
      {cols.showTarget && <span className="text-center">Objetivo</span>}
      <span className="text-center">Carga</span>
      {cols.showRest && <span className="text-center">Descanso</span>}
      <span />
    </div>
  );

  const itemRow = (bk: string, it: ItemState) => {
    const ex = exercise(it.exerciseId);
    const tf = targetField(ex?.measurementType);
    return (
      <div
        key={it.key}
        className="grid items-center gap-3 border-b border-[#f4f1eb] px-3.5 py-2"
        style={{ gridTemplateColumns: itemGtc }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {ex?.thumbnailAssetId ? (
            <MediaThumb assetId={ex.thumbnailAssetId} className="h-9 w-[58px] shrink-0 rounded-md" />
          ) : (
            <div
              className="h-9 w-[58px] shrink-0 rounded-md"
              style={{ background: 'repeating-linear-gradient(135deg,#eeeae2 0 5px,#e4dfd5 5px 10px)' }}
            />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{ex?.name ?? '…'}</div>
            <div className="truncate font-mono text-[11px] text-muted">
              {ex ? es.measurement[ex.measurementType] : ''}
            </div>
          </div>
        </div>
        {cols.showSets && (
          <input
            value={it.sets}
            onChange={(e) => updateItem(bk, it.key, { sets: e.target.value })}
            className={boxCls}
          />
        )}
        {cols.showTarget && (
          <input
            value={it[tf]}
            placeholder={TARGET_UNIT[tf]}
            onChange={(e) => updateItem(bk, it.key, { [tf]: e.target.value })}
            className={boxCls}
          />
        )}
        <input
          value={it.carga}
          onChange={(e) => updateItem(bk, it.key, { carga: e.target.value })}
          className={boxCls}
        />
        {cols.showRest && (
          <input
            value={it.rest}
            placeholder="seg"
            onChange={(e) => updateItem(bk, it.key, { rest: e.target.value })}
            className={boxCls}
          />
        )}
        <button
          type="button"
          onClick={() =>
            setBlocks((bs) =>
              bs.map((b) => (b.key === bk ? { ...b, items: b.items.filter((x) => x.key !== it.key) } : b)),
            )
          }
          className="text-center text-faint-2 hover:text-accent-dark"
        >
          ✕
        </button>
      </div>
    );
  };

  const addExerciseButton = (onClick: () => void) => (
    <div className="p-3">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-[30px] items-center rounded-[7px] border border-dashed border-line-2 bg-surface-3 px-3 text-[13px] font-semibold text-ink-3 hover:bg-surface-2"
      >
        {es.workouts.addExercise}
      </button>
    </div>
  );

  const save = useMutation({
    mutationFn: () => {
      const structured = type === 'structured';
      const cols = itemColumns(format);
      const toItem = (it: ItemState) => ({
        exerciseId: it.exerciseId,
        sets: cols.showSets ? num(it.sets) : null,
        reps: num(it.reps),
        workSeconds: num(it.workSeconds),
        distanceMeters: num(it.distanceMeters),
        restBetweenSeconds: cols.showRest ? num(it.rest) : null,
        loadPrescription: strToLoad(it.carga),
        perSide: false,
      });
      // Flat formats (AMRAP) collapse to a single block.
      const blocksPayload = flat
        ? [
            {
              type: 'single' as BlockType,
              rounds: null,
              restAfterSeconds: null,
              items: blocks.flatMap((b) => b.items).map(toItem),
            },
          ]
        : blocks.map((b) => ({
            type: b.type,
            rounds: num(b.rounds),
            restAfterSeconds: num(b.restAfterSeconds),
            items: b.items.map(toItem),
          }));
      const payload: CreateWorkoutInput = {
        name,
        description: description || null,
        type,
        format: structured ? format : null,
        difficulty,
        estimatedDurationSeconds: durationMin ? Math.max(1, Number(durationMin)) * 60 : null,
        status,
        thumbnailAssetId,
        videoAssetId: structured ? null : videoAssetId,
        formatConfig: structured ? buildFormatConfig(format, formatCfg) : null,
        blocks: structured ? blocksPayload : [],
      };
      return workout ? api.workouts.update(workout.id, payload) : api.workouts.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts'] });
      router.push('/rutinas');
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });

  const doSave = () => {
    setServerError(null);
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    save.mutate();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-start justify-between gap-6 border-b border-line bg-surface px-7 pb-4 pt-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2 font-mono text-xs font-medium text-muted">
            <button type="button" onClick={() => router.push('/rutinas')} className="hover:text-ink-2">
              {es.workouts.title}
            </button>
            <span>/</span>
            <span className="text-ink-2">{workout ? 'Editar' : 'Nueva'}</span>
          </div>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(false);
            }}
            placeholder={es.workouts.new}
            className={cn(
              'w-full max-w-2xl bg-transparent text-[26px] font-bold tracking-[-0.02em] focus:outline-none',
              nameError ? 'placeholder:text-accent-dark' : 'placeholder:text-faint',
            )}
          />
          {nameError && (
            <span className="text-xs font-medium text-accent-dark">{es.app.nameRequired}</span>
          )}
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ background: '#fdf0d9', color: '#8a5a12' }}
            >
              {es.status[status]}
            </span>
            <span className="font-mono text-xs font-medium text-muted">{metaLine}</span>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/rutinas')}>
            {es.app.cancel}
          </Button>
          <Button onClick={doSave} disabled={save.isPending}>
            {save.isPending ? es.app.saving : es.app.save}
          </Button>
        </div>
      </header>

      {serverError && (
        <p className="mx-7 mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-accent-dark">{serverError}</p>
      )}

      {/* Two columns */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(296px,372px)]">
        {/* Left: exercises / blocks (or video) */}
        <div className="flex min-h-0 min-w-0 flex-col gap-3.5 overflow-y-auto px-7 py-5">
          {type === 'structured' ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-bold">{flat ? 'Ejercicios' : es.workouts.blocks}</h2>
                {!flat && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setBlocks((bs) => [
                        ...bs,
                        { key: uid(), type: 'single', rounds: '', restAfterSeconds: '', items: [] },
                      ])
                    }
                  >
                    {es.workouts.addBlock}
                  </Button>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent-tint/30 px-3 py-2.5">
                <span className="mt-px font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-dark">
                  {FORMAT_LABEL[format]}
                </span>
                <p className="text-[12.5px] leading-snug text-ink-2">{FORMAT_HELP[format]}</p>
              </div>

              {flat ? (
                <div className="overflow-hidden rounded-xl border border-[#e2ded5] bg-surface">
                  {flatItems.length > 0 && itemHeader()}
                  {flatItems.map(({ bk, it }) => itemRow(bk, it))}
                  {flatItems.length === 0 && (
                    <p className="px-3.5 py-5 text-center text-[13px] text-ink-3">
                      Agrega los ejercicios del circuito.
                    </p>
                  )}
                  {addExerciseButton(openFlatPicker)}
                </div>
              ) : (
                <>
                  {blocks.map((b, bi) => (
                    <div key={b.key} className="overflow-hidden rounded-xl border border-[#e2ded5] bg-surface">
                      <div className="flex flex-wrap items-center gap-3 border-b border-[#eeeae2] bg-surface-2 px-3.5 py-2.5">
                        <span className="font-mono text-[13px] text-faint">⠿</span>
                        <span className="text-sm font-bold">Bloque {bi + 1}</span>
                        <div className="ml-auto flex items-center gap-2">
                          <input
                            placeholder={es.workouts.rounds}
                            value={b.rounds}
                            onChange={(e) => updateBlock(b.key, { rounds: e.target.value })}
                            className="h-7 w-16 rounded-md border border-line-2 bg-surface px-2 text-center font-mono text-[12px]"
                          />
                          <input
                            placeholder="descanso"
                            value={b.restAfterSeconds}
                            onChange={(e) => updateBlock(b.key, { restAfterSeconds: e.target.value })}
                            className="h-7 w-20 rounded-md border border-line-2 bg-surface px-2 text-center font-mono text-[12px]"
                          />
                          <button
                            type="button"
                            onClick={() => setBlocks((bs) => bs.filter((x) => x.key !== b.key))}
                            className="text-faint-2 hover:text-accent-dark"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {b.items.length > 0 && itemHeader()}
                      {b.items.map((it) => itemRow(b.key, it))}
                      {addExerciseButton(() => addExerciseTo(b.key))}
                    </div>
                  ))}
                  {blocks.length === 0 && (
                    <div className="rounded-xl border border-dashed border-line-2 bg-surface-3 p-[18px] text-center text-[13px] text-ink-3">
                      {es.workouts.noBlocks}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div>
              <h2 className="mb-3 text-[15px] font-bold">{es.workouts.video}</h2>
              <div className="max-w-xl">
                <MediaField kind="video" label={es.workouts.video} value={videoAssetId} onChange={setVideoAssetId} />
              </div>
            </div>
          )}
        </div>

        {/* Right: config sidebar */}
        <aside className="flex min-h-0 flex-col gap-[22px] overflow-y-auto border-t border-line bg-surface px-[22px] py-[22px] lg:border-l lg:border-t-0">
          <div className="flex flex-col gap-2.5">
            <MonoLabel>{es.workouts.type}</MonoLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {(['structured', 'video'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'rounded-lg border px-1.5 py-2.5 text-center text-xs font-semibold',
                    type === t ? 'border-ink bg-ink text-white' : 'border-line-2 bg-surface text-ink-2',
                  )}
                >
                  {es.workouts.types[t]}
                </button>
              ))}
            </div>
          </div>

          {type === 'structured' && (
            <>
              <div className="flex flex-col gap-2.5">
                <MonoLabel>{es.workouts.format}</MonoLabel>
                <div className="grid grid-cols-3 gap-1.5">
                  {WORKOUT_FORMAT.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      className={cn(
                        'rounded-lg border px-1.5 py-2.5 text-center text-xs font-semibold',
                        format === f
                          ? 'border-accent bg-accent-tint/50 text-accent-dark'
                          : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
                      )}
                    >
                      {FORMAT_LABEL[f]}
                    </button>
                  ))}
                </div>
              </div>

              {FORMAT_FIELDS[format].length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <MonoLabel>{es.workouts.config}</MonoLabel>
                  <div className="grid grid-cols-2 gap-3">
                    {FORMAT_FIELDS[format].map((f) => (
                      <div key={f.key}>
                        <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{f.label}</div>
                        <Input
                          inputMode="numeric"
                          value={formatCfg[f.key] ?? ''}
                          onChange={(e) => setCfg(f.key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-3">
            <MonoLabel>Ajustes</MonoLabel>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.fields.difficulty}</div>
                <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                  {DIFFICULTY.map((d) => (
                    <option key={d} value={d}>
                      {es.difficulty[d]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.workouts.duration}</div>
                <Input inputMode="numeric" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.fields.status}</div>
              <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                {CONTENT_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {es.status[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.fields.description}</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-16 w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <MonoLabel>{es.fields.thumbnail}</MonoLabel>
            <MediaField kind="image" label={es.fields.thumbnail} value={thumbnailAssetId} onChange={setThumbnailAssetId} />
          </div>
        </aside>
      </div>

      <EntityPicker<ExerciseListItem>
        open={pickerBlock !== null}
        onClose={() => setPickerBlock(null)}
        title={es.pick.exercise}
        queryKey="exercise-picker"
        load={(s) => api.exercises.list({ search: s || undefined, pageSize: 50 }).then((r) => r.data)}
        renderTitle={(e) => e.name}
        renderSubtitle={(e) => `${es.difficulty[e.difficulty]} · ${es.measurement[e.measurementType]}`}
        onPick={(e) => {
          if (pickerBlock) {
            setBlocks((bs) =>
              bs.map((b) =>
                b.key === pickerBlock ? { ...b, items: [...b.items, emptyItem(e.id)] } : b,
              ),
            );
          }
        }}
      />
    </div>
  );
}
