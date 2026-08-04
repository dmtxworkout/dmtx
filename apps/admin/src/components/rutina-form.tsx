'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useState, type DragEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_STATUS, DIFFICULTY, WORKOUT_FORMAT } from '@dmtx/schemas';
import type {
  BlockSection,
  BlockType,
  CreateWorkoutInput,
  FormatConfig,
  LoadPrescription,
  MeasurementType,
  Tempo,
  TempoPhase,
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

// One-liners shown on the format cards in the create wizard.
const FORMAT_DESC: Record<WorkoutFormat, string> = {
  amrap: 'Rondas máximas en un tiempo límite.',
  emom: 'Un ejercicio por intervalo (cada minuto).',
  tabata: 'Intervalos fijos de trabajo y descanso.',
  strength: 'Series × reps con carga y descanso.',
  chipper: 'Una lista larga, una vez, lo más rápido.',
  for_time: 'Completa el trabajo lo antes posible.',
  circuit: 'Vueltas a un circuito de estaciones.',
};

// Timing config per format. `duration` renders as min:sec, `seconds` as a
// plain seconds box, `count` as an integer. All persist as their raw number in
// formatCfg (seconds for duration/seconds, the integer for count).
type CfgKind = 'duration' | 'seconds' | 'count';
type CfgField = { key: string; label: string; kind: CfgKind };
const FORMAT_FIELDS: Record<WorkoutFormat, CfgField[]> = {
  amrap: [{ key: 'totalSeconds', label: 'Duración total', kind: 'duration' }],
  emom: [
    { key: 'intervalSeconds', label: 'Cada', kind: 'duration' },
    { key: 'rounds', label: 'Rondas', kind: 'count' },
  ],
  tabata: [
    { key: 'rounds', label: 'Rondas', kind: 'count' },
    { key: 'workSeconds', label: 'Trabajo', kind: 'seconds' },
    { key: 'restSeconds', label: 'Descanso', kind: 'seconds' },
  ],
  strength: [],
  chipper: [{ key: 'timeCapSeconds', label: 'Tiempo límite', kind: 'duration' }],
  for_time: [
    { key: 'rounds', label: 'Rondas', kind: 'count' },
    { key: 'timeCapSeconds', label: 'Tiempo límite', kind: 'duration' },
  ],
  circuit: [
    { key: 'rounds', label: 'Rondas', kind: 'count' },
    { key: 'restBetweenRoundsSeconds', label: 'Descanso/ronda', kind: 'seconds' },
    { key: 'timeCapSeconds', label: 'Tiempo límite', kind: 'duration' },
  ],
};

// Plain-language explainer so the per-exercise fields make sense for the format.
const FORMAT_HELP: Record<WorkoutFormat, string> = {
  amrap: 'Repite todos los bloques, en orden, hasta que se acabe el tiempo. Usa "Rondas" del bloque para sub-secciones (p. ej. un bloque de "3 rondas de…").',
  emom: 'Cada intervalo haces un ejercicio y descansas lo que sobre. Los ejercicios rotan por los intervalos; "Rondas" es cuántos intervalos en total.',
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


type TargetField = 'reps' | 'workSeconds' | 'distanceMeters';
/** The prescription field follows the exercise's own measurement type. */
function targetField(m?: MeasurementType): TargetField {
  if (m === 'time') return 'workSeconds';
  if (m === 'distance') return 'distanceMeters';
  return 'reps';
}
// Per-item measurement toggle (overrides the exercise's default type).
const MEASURES: { v: MeasurementType; label: string }[] = [
  { v: 'reps', label: 'reps' },
  { v: 'time', label: 'seg' },
  { v: 'distance', label: 'dist' },
];

// Tempo is set per rutina item (not on the exercise): a push-up is a push-up;
// whether it's tempo depends on the workout. Stored as the item's tempoOverride.
const TEMPO_PHASES = ['holdTop', 'eccentric', 'holdBottom', 'concentric'] as const;
// Short phase labels for the compact tempo popover (arriba·baja·abajo·sube).
const TEMPO_SHORT: Record<(typeof TEMPO_PHASES)[number], string> = {
  holdTop: 'arriba',
  eccentric: 'baja',
  holdBottom: 'abajo',
  concentric: 'sube',
};
type TempoStr = Record<(typeof TEMPO_PHASES)[number], string>;
const emptyTempo = (): TempoStr => ({ holdTop: '', eccentric: '', holdBottom: '', concentric: '' });

function parsePhase(v: string): TempoPhase | null {
  const t = v.trim();
  if (!t) return null;
  if (t.toUpperCase() === 'X') return 'X';
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function buildTempo(t: TempoStr): Tempo | null {
  const phases = TEMPO_PHASES.map((p) => parsePhase(t[p]));
  if (phases.every((p) => p === null)) return null;
  const [holdTop, eccentric, holdBottom, concentric] = phases.map((p) => p ?? 0);
  return { holdTop, eccentric, holdBottom, concentric } as Tempo;
}
const tempoStrFrom = (t?: Tempo | null): TempoStr =>
  t
    ? {
        holdTop: String(t.holdTop),
        eccentric: String(t.eccentric),
        holdBottom: String(t.holdBottom),
        concentric: String(t.concentric),
      }
    : emptyTempo();
/** Compact label like "1·2·0·X"; null when unset. */
const tempoLabel = (t: TempoStr): string | null =>
  TEMPO_PHASES.some((p) => t[p].trim()) ? TEMPO_PHASES.map((p) => t[p].trim() || '0').join('·') : null;

type ItemKind = 'exercise' | 'rest';
type ItemState = {
  key: string;
  kind: ItemKind;
  exerciseId: string;
  measure: MeasurementType | ''; // '' inherits the exercise's default
  sets: string;
  reps: string;
  workSeconds: string; // rest items store their duration here
  distanceMeters: string;
  rest: string;
  carga: string;
  tempo: TempoStr;
};

const emptyItem = (exerciseId: string): ItemState => ({
  key: uid(),
  kind: 'exercise',
  exerciseId,
  measure: '',
  sets: '',
  reps: '',
  workSeconds: '',
  distanceMeters: '',
  rest: '',
  carga: '',
  tempo: emptyTempo(),
});
const restItem = (): ItemState => ({ ...emptyItem(''), kind: 'rest' });

// 'single' is a builder-only kind: a loose exercise done once. It persists as a
// group block with one item and no rounds; on reload we detect it the same way.
type BlockKind = 'single' | 'group' | 'rest';
type BlockState = {
  key: string;
  kind: BlockKind;
  section: BlockSection;
  name: string;
  type: BlockType;
  rounds: string;
  items: ItemState[];
};

const emptyBlock = (): BlockState => ({
  key: uid(),
  kind: 'group',
  section: 'main',
  name: '',
  type: 'single',
  rounds: '',
  items: [],
});

/** A loose exercise: one exercise, done once (no block wrapper). */
const singleBlock = (exerciseId: string, section: BlockSection = 'main'): BlockState => ({
  ...emptyBlock(),
  kind: 'single',
  section,
  items: [emptyItem(exerciseId)],
});

/** A loose rest: a rest-kind block holding a single rest item. */
const restBlock = (): BlockState => ({ ...emptyBlock(), kind: 'rest', items: [restItem()] });

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
  if (!w) return [];
  return w.blocks.map((b) => ({
    key: uid(),
    // A group with a single exercise and no rounds reads back as a loose exercise.
    kind:
      b.kind === 'rest'
        ? 'rest'
        : b.items.length === 1 && b.items[0]?.kind === 'exercise' && (b.rounds ?? 1) <= 1
          ? 'single'
          : 'group',
    section: b.section ?? 'main',
    name: b.label ?? '',
    type: b.type,
    rounds: b.rounds?.toString() ?? '',
    items: b.items.map((it) => ({
      key: uid(),
      kind: it.kind,
      exerciseId: it.exerciseId ?? '',
      measure: it.measure ?? '',
      sets: it.sets?.toString() ?? '',
      reps: it.reps?.toString() ?? '',
      workSeconds: it.workSeconds?.toString() ?? '',
      distanceMeters: it.distanceMeters?.toString() ?? '',
      rest: it.restBetweenSeconds?.toString() ?? '',
      carga: loadToStr(it.loadPrescription),
      tempo: tempoStrFrom(it.tempoOverride),
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
  // New workouts start in a guided wizard (type → format → name); existing ones
  // skip straight to the builder.
  const [wizardStep, setWizardStep] = useState<'type' | 'format' | 'name' | 'done'>(
    workout ? 'done' : 'type',
  );
  const [formatCfg, setFormatCfg] = useState<Record<string, string>>(initCfg(workout));
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(workout?.thumbnailAssetId ?? null);
  const [videoAssetId, setVideoAssetId] = useState<string | null>(workout?.videoAssetId ?? null);
  const [blocks, setBlocks] = useState<BlockState[]>(() => initBlocks(workout));
  const [pickerBlock, setPickerBlock] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Anchored floating tempo editor (key of the open item + viewport position).
  const [tempoMenu, setTempoMenu] = useState<{ key: string; top: number; left: number } | null>(null);
  const [nameEditKey, setNameEditKey] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  // Item drag-and-drop (reorder exercises/rests within a block).
  const [dragItem, setDragItem] = useState<{ bk: string; i: number } | null>(null);
  const [overItem, setOverItem] = useState<{ bk: string; i: number } | null>(null);

  const { data: exList } = useQuery({
    queryKey: ['exercises', 'all'],
    queryFn: () => api.exercises.list({ pageSize: 500 }),
  });
  const exercise = (id: string) => exList?.data.find((e) => e.id === id);

  // Type and format define the data shape, so they're frozen once chosen (in
  // the wizard for new workouts, or always for existing ones).
  const locked = Boolean(workout) || wizardStep === 'done';

  const setCfg = (k: string, v: string) => setFormatCfg((c) => ({ ...c, [k]: v }));
  const updateBlock = (key: string, patch: Partial<BlockState>) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const toggleCollapse = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const duplicateBlock = (index: number) =>
    setBlocks((bs) => {
      const b = bs[index];
      if (!b) return bs;
      const copy: BlockState = {
        ...b,
        key: uid(),
        name: b.name ? `${b.name} (copia)` : '',
        items: b.items.map((it) => ({ ...it, key: uid() })),
      };
      const next = [...bs];
      next.splice(index + 1, 0, copy);
      return next;
    });
  const dropBlock = (target: number) => {
    setBlocks((bs) => {
      if (dragIndex === null || dragIndex === target) return bs;
      const copy = [...bs];
      const [moved] = copy.splice(dragIndex, 1);
      if (moved) copy.splice(target, 0, moved);
      return copy;
    });
    setDragIndex(null);
    setOverIndex(null);
  };
  const updateItem = (bk: string, ik: string, patch: Partial<ItemState>) =>
    setBlocks((bs) =>
      bs.map((b) =>
        b.key === bk ? { ...b, items: b.items.map((it) => (it.key === ik ? { ...it, ...patch } : it)) } : b,
      ),
    );
  // Reorder items within a single block (drops are constrained to the block).
  const moveItem = (bk: string, target: number) => {
    setBlocks((bs) =>
      bs.map((b) => {
        if (b.key !== bk || !dragItem || dragItem.bk !== bk || dragItem.i === target) return b;
        const items = [...b.items];
        const [moved] = items.splice(dragItem.i, 1);
        if (moved) items.splice(target, 0, moved);
        return { ...b, items };
      }),
    );
    setDragItem(null);
    setOverItem(null);
  };

  const metaLine = [
    type === 'video' ? 'Video' : FORMAT_LABEL[format],
    durationMin ? `${durationMin} min` : null,
    es.difficulty[difficulty],
  ]
    .filter(Boolean)
    .join(' · ');

  // Per-exercise columns adapt to the selected format.
  const cols = itemColumns(format);
  const warmupBlocks = blocks.filter((b) => b.section === 'warmup');
  const mainBlocks = blocks.filter((b) => (b.section ?? 'main') === 'main');
  const cooldownBlocks = blocks.filter((b) => b.section === 'cooldown');
  const itemGtc = [
    'minmax(0,1fr)', // name
    cols.showSets && '56px', // series
    cols.showTarget && '66px', // medida
    cols.showTarget && '72px', // objetivo
    '74px', // carga
    cols.showRest && '60px', // descanso
    '72px', // tempo
    '26px', // delete
  ]
    .filter(Boolean)
    .join(' ');

  const addExerciseTo = (blockKey: string) => setPickerBlock(blockKey);
  const removeBlock = (key: string) => setBlocks((bs) => bs.filter((x) => x.key !== key));

  // Drag grip that reorders a top-level entry (loose exercise / rest / block).
  const blockDragHandle = (bi: number) => (
    <span
      draggable
      onDragStart={(e) => {
        setDragIndex(bi);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        setDragIndex(null);
        setOverIndex(null);
      }}
      onClick={(e) => e.stopPropagation()}
      className="cursor-grab select-none px-0.5 font-mono text-[15px] leading-none text-faint hover:text-ink-3 active:cursor-grabbing"
      title="Arrastra para reordenar"
    >
      ⠿
    </span>
  );

  // Item header + row, reused by the flat list and the block editor.
  const itemHeader = () => (
    <div
      className="grid gap-3 border-b border-[#f4f1eb] px-3.5 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-2"
      style={{ gridTemplateColumns: itemGtc }}
    >
      <span>{es.pick.exercise.replace('Elegir ', '')}</span>
      {cols.showSets && <span className="text-center">{es.workouts.sets}</span>}
      {cols.showTarget && <span className="text-center">Medida</span>}
      {cols.showTarget && <span className="text-center">Objetivo</span>}
      <span className="text-center">Carga</span>
      {cols.showRest && <span className="text-center">Descanso</span>}
      <span className="text-center">Tempo</span>
      <span />
    </div>
  );

  const removeItem = (bk: string, key: string) =>
    setBlocks((bs) =>
      bs.map((b) => (b.key === bk ? { ...b, items: b.items.filter((x) => x.key !== key) } : b)),
    );

  // Drag handle used to reorder an item within its block.
  const dragHandle = (bk: string, i: number) => (
    <span
      draggable
      onDragStart={(e) => {
        setDragItem({ bk, i });
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        setDragItem(null);
        setOverItem(null);
      }}
      className="cursor-grab select-none px-0.5 font-mono text-[14px] leading-none text-faint hover:text-ink-3 active:cursor-grabbing"
      title="Arrastra para reordenar"
    >
      ⠿
    </span>
  );

  // The exercise controls (thumb, name, measure, objetivo, carga, rest, tempo),
  // reused by a nested block item and by a loose top-level exercise. `handle`
  // is the drag grip to show; `onDelete` removes the item or the whole entry.
  const exerciseFields = (bk: string, it: ItemState, handle: ReactNode, onDelete: () => void) => {
    const ex = exercise(it.exerciseId);
    const measure: MeasurementType = it.measure || 'reps';
    const tf = targetField(measure);
    const tLabel = tempoLabel(it.tempo);
    const showTempo = measure !== 'distance';
    return (
      <>
        <div className="grid items-center gap-3 px-3.5 py-2" style={{ gridTemplateColumns: itemGtc }}>
          <div className="flex min-w-0 items-center gap-2">
            {handle}
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
              {/* When there's no Medida column (e.g. tabata), keep a read-only hint. */}
              {!cols.showTarget && ex && (
                <div className="truncate font-mono text-[11px] text-muted">{es.measurement[measure]}</div>
              )}
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
            <div className="relative">
              <select
                value={measure}
                onChange={(e) => updateItem(bk, it.key, { measure: e.target.value as MeasurementType })}
                className="h-[30px] w-full cursor-pointer appearance-none rounded-[7px] border border-[#e6e2d9] bg-surface-3 pl-2 pr-4 text-center font-mono text-[12px] font-medium uppercase text-ink-2 focus:border-accent/40 focus:outline-none"
              >
                {MEASURES.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[7px] text-muted">
                ▾
              </span>
            </div>
          )}
          {cols.showTarget && (
            <input
              value={it[tf]}
              placeholder="0"
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
          {showTempo ? (
            <button
              type="button"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setTempoMenu(
                  tempoMenu?.key === it.key ? null : { key: it.key, top: r.bottom + 4, left: r.left },
                );
              }}
              title="Tempo"
              className={cn(
                'flex h-[30px] w-full items-center justify-center gap-1 rounded-[7px] border font-mono text-[12px] font-medium focus:outline-none',
                tLabel
                  ? 'border-accent/40 bg-accent/10 text-accent-dark'
                  : 'border-[#e6e2d9] bg-surface-3 text-muted hover:border-accent/40',
              )}
            >
              <span className="truncate">{tLabel ?? '—'}</span>
              <span className="text-[7px] opacity-60">▾</span>
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onDelete}
            className="text-center text-faint-2 hover:text-accent-dark"
          >
            ✕
          </button>
        </div>
        {showTempo && tempoMenu?.key === it.key && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setTempoMenu(null)} />
            <div
              className="fixed z-40 rounded-xl border border-line-2 bg-surface p-3 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]"
              style={{ top: tempoMenu.top, left: tempoMenu.left }}
            >
              <div className="flex items-end gap-2">
                {TEMPO_PHASES.map((phase) => (
                  <label key={phase} className="flex flex-col items-center gap-1">
                    <span className="font-mono text-[9px] font-medium uppercase tracking-[0.06em] text-muted-2">
                      {TEMPO_SHORT[phase]}
                    </span>
                    <input
                      value={it.tempo[phase]}
                      placeholder="0"
                      onChange={(e) =>
                        updateItem(bk, it.key, { tempo: { ...it.tempo, [phase]: e.target.value } })
                      }
                      className="h-7 w-12 rounded-md border border-line-2 bg-surface px-2 text-center font-mono text-[12px]"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-2.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => updateItem(bk, it.key, { tempo: emptyTempo() })}
                  className="font-mono text-[10px] font-medium text-accent-dark hover:underline"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </>
        )}
      </>
    );
  };

  const itemRow = (bk: string, it: ItemState, i: number) => {
    const isDragging = dragItem?.bk === bk && dragItem?.i === i;
    const isDropTarget =
      dragItem?.bk === bk && dragItem.i !== i && overItem?.bk === bk && overItem?.i === i;
    const dnd = {
      onDragOver: (e: DragEvent) => {
        if (!dragItem || dragItem.bk !== bk) return;
        e.preventDefault();
        e.stopPropagation();
        if (!(overItem?.bk === bk && overItem?.i === i)) setOverItem({ bk, i });
      },
      onDrop: (e: DragEvent) => {
        if (!dragItem || dragItem.bk !== bk) return;
        e.preventDefault();
        e.stopPropagation();
        moveItem(bk, i);
      },
    };
    if (it.kind === 'rest') {
      return (
        <div
          key={it.key}
          {...dnd}
          className={cn(
            'flex items-center gap-2 border-b border-[#f4f1eb] px-3.5 py-2',
            isDragging && 'opacity-40',
            isDropTarget && 'border-t-2 border-t-accent',
          )}
        >
          {dragHandle(bk, i)}
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-dark">
            Descanso
          </span>
          <input
            value={it.workSeconds}
            placeholder="0"
            onChange={(e) => updateItem(bk, it.key, { workSeconds: e.target.value })}
            className="h-7 w-16 rounded-md border border-line-2 bg-surface px-2 text-center font-mono text-[12px]"
          />
          <span className="font-mono text-[11px] text-muted">seg</span>
          <button
            type="button"
            onClick={() => removeItem(bk, it.key)}
            className="ml-auto inline-flex items-center rounded p-1 text-faint-2 hover:bg-surface-3 hover:text-accent-dark"
          >
            ✕
          </button>
        </div>
      );
    }
    return (
      <div
        key={it.key}
        {...dnd}
        className={cn(
          'border-b border-[#f4f1eb]',
          isDragging && 'opacity-40',
          isDropTarget && 'border-t-2 border-t-accent',
        )}
      >
        {exerciseFields(bk, it, dragHandle(bk, i), () => removeItem(bk, it.key))}
      </div>
    );
  };

  const addButton = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[30px] items-center rounded-[7px] border border-dashed border-line-2 bg-surface-3 px-3 text-[13px] font-semibold text-ink-3 hover:bg-surface-2"
    >
      {label}
    </button>
  );
  const addRestItem = (bk: string) =>
    setBlocks((bs) => bs.map((b) => (b.key === bk ? { ...b, items: [...b.items, restItem()] } : b)));

  // Warmup / cooldown: a simple list of exercises (optional, skippable, untracked).
  const looseSection = (secBlocks: BlockState[], section: 'warmup' | 'cooldown', title: string) => (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line-2 bg-surface-2/40 p-2.5">
      <div className="flex items-center gap-2 px-1 pt-0.5">
        <MonoLabel>{title}</MonoLabel>
        <span className="font-mono text-[10px] text-muted">· opcional · no cuenta para resultados</span>
      </div>
      {secBlocks.map((b) =>
        b.items[0] ? (
          <div key={b.key} className="rounded-lg bg-surface">
            {exerciseFields(b.key, b.items[0], null, () => removeBlock(b.key))}
          </div>
        ) : null,
      )}
      <button
        type="button"
        onClick={() => setPickerBlock(section === 'warmup' ? '__warmup__' : '__cooldown__')}
        className="inline-flex h-[30px] items-center self-start rounded-[7px] border border-dashed border-line-2 bg-surface-3 px-3 text-[13px] font-semibold text-ink-3 hover:bg-surface-2"
      >
        {es.workouts.addExercise}
      </button>
    </div>
  );

  // A warmup/cooldown slot: an empty placeholder area, or the built content.
  const sectionSlot = (secBlocks: BlockState[], section: 'warmup' | 'cooldown', title: string) =>
    secBlocks.length > 0 ? (
      looseSection(secBlocks, section, title)
    ) : (
      <button
        type="button"
        onClick={() => setPickerBlock(section === 'warmup' ? '__warmup__' : '__cooldown__')}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 bg-surface-2/30 py-3 text-ink-3 hover:bg-surface-2 hover:text-ink-2"
      >
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-2">
          {title}
        </span>
        <span className="text-[13px] font-semibold">+ Añadir</span>
      </button>
    );

  const save = useMutation({
    mutationFn: () => {
      const structured = type === 'structured';
      const cols = itemColumns(format);
      const toItem = (it: ItemState) => {
        const rest = it.kind === 'rest';
        return {
          kind: it.kind,
          exerciseId: rest ? null : it.exerciseId,
          measure: rest ? null : it.measure || 'reps',
          sets: rest ? null : cols.showSets ? num(it.sets) : null,
          reps: rest ? null : num(it.reps),
          workSeconds: num(it.workSeconds),
          distanceMeters: rest ? null : num(it.distanceMeters),
          restBetweenSeconds: rest ? null : cols.showRest ? num(it.rest) : null,
          loadPrescription: rest ? null : strToLoad(it.carga),
          tempoOverride: rest ? null : buildTempo(it.tempo),
          perSide: false,
        };
      };
      const blocksPayload = blocks.map((b) => ({
        // A loose exercise ('single') persists as a group with one item, no rounds.
        kind: b.kind === 'single' ? 'group' : b.kind,
        section: b.section,
        type: b.type,
        label: b.kind === 'single' ? null : b.name.trim() || null,
        rounds: b.kind === 'single' ? null : num(b.rounds),
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

  // Renders one timing-config field (duration min:sec, plain seconds, or count).
  // Compact, inline "Cada [5] min [0] seg · Rondas [5]" config bar.
  const cfgBox =
    'h-[30px] w-12 rounded-[7px] border border-[#e6e2d9] bg-surface-3 text-center font-mono text-[13px] font-medium focus:border-accent/40 focus:outline-none';
  const cfgLabel = 'font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3';
  const cfgUnit = 'font-mono text-[11px] text-muted';
  const configField = (f: CfgField) => {
    if (f.kind === 'duration') {
      const total = Math.max(0, Math.round(Number(formatCfg[f.key]) || 0));
      const min = Math.floor(total / 60);
      const sec = total % 60;
      const setDur = (m: number, s: number) =>
        setCfg(f.key, String(Math.max(0, m) * 60 + Math.max(0, s)));
      return (
        <div key={f.key} className="flex items-center gap-2">
          <span className={cfgLabel}>{f.label}</span>
          <input
            inputMode="numeric"
            value={min ? String(min) : ''}
            placeholder="0"
            onChange={(e) => setDur(Math.round(Number(e.target.value) || 0), sec)}
            className={cfgBox}
          />
          <span className={cfgUnit}>min</span>
          <input
            inputMode="numeric"
            value={sec ? String(sec) : ''}
            placeholder="0"
            onChange={(e) => setDur(min, Math.round(Number(e.target.value) || 0))}
            className={cfgBox}
          />
          <span className={cfgUnit}>seg</span>
        </div>
      );
    }
    return (
      <div key={f.key} className="flex items-center gap-2">
        <span className={cfgLabel}>{f.label}</span>
        <input
          inputMode="numeric"
          value={formatCfg[f.key] ?? ''}
          placeholder="0"
          onChange={(e) => setCfg(f.key, e.target.value)}
          className={cfgBox}
        />
        {f.kind === 'seconds' && <span className={cfgUnit}>seg</span>}
      </div>
    );
  };

  const doSave = () => {
    setServerError(null);
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    save.mutate();
  };

  // ---- Create wizard (new workouts only): type → format → name -------------
  const selectType = (t: 'structured' | 'video') => {
    setType(t);
    setWizardStep(t === 'video' ? 'name' : 'format');
  };
  const selectFormat = (f: WorkoutFormat) => {
    setFormat(f);
    setWizardStep('name');
  };
  const finishWizard = () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setWizardStep('done');
  };

  if (wizardStep !== 'done') {
    const stepNum = wizardStep === 'type' ? 1 : wizardStep === 'format' ? 2 : type === 'video' ? 2 : 3;
    const stepTotal = type === 'video' ? 2 : 3;
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-6 border-b border-line bg-surface px-7 py-4">
          <div className="flex items-center gap-2 font-mono text-xs font-medium text-muted">
            <button type="button" onClick={() => router.push('/rutinas')} className="hover:text-ink-2">
              {es.workouts.title}
            </button>
            <span>/</span>
            <span className="text-ink-2">Nueva</span>
          </div>
          <Button type="button" variant="outline" onClick={() => router.push('/rutinas')}>
            {es.app.cancel}
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-6 py-10">
            <div className="mb-6 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
              Paso {stepNum} de {stepTotal}
            </div>

            {wizardStep === 'type' && (
              <>
                <h1 className="mb-1 text-2xl font-bold tracking-tight">¿Qué tipo de rutina?</h1>
                <p className="mb-6 text-sm text-ink-3">Esto no se puede cambiar después.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        v: 'structured',
                        desc: 'Bloques de ejercicios con series, reps, tiempo o distancia.',
                      },
                      { v: 'video', desc: 'Una sola clase en video, sin pasos.' },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => selectType(o.v)}
                      className="flex flex-col gap-1.5 rounded-xl border border-line-2 bg-surface p-4 text-left hover:border-ink hover:bg-surface-2"
                    >
                      <span className="text-base font-bold">{es.workouts.types[o.v]}</span>
                      <span className="text-[13px] leading-snug text-ink-3">{o.desc}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {wizardStep === 'format' && (
              <>
                <button
                  type="button"
                  onClick={() => setWizardStep('type')}
                  className="mb-4 font-mono text-xs text-muted hover:text-ink-2"
                >
                  ← Atrás
                </button>
                <h1 className="mb-1 text-2xl font-bold tracking-tight">Elige el formato</h1>
                <p className="mb-6 text-sm text-ink-3">Define cómo se estructura y cronometra la rutina.</p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {WORKOUT_FORMAT.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => selectFormat(f)}
                      className="flex flex-col gap-1 rounded-xl border border-line-2 bg-surface p-3.5 text-left hover:border-accent hover:bg-accent-tint/30"
                    >
                      <span className="text-sm font-bold text-accent-dark">{FORMAT_LABEL[f]}</span>
                      <span className="text-[12.5px] leading-snug text-ink-3">{FORMAT_DESC[f]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {wizardStep === 'name' && (
              <>
                <button
                  type="button"
                  onClick={() => setWizardStep(type === 'video' ? 'type' : 'format')}
                  className="mb-4 font-mono text-xs text-muted hover:text-ink-2"
                >
                  ← Atrás
                </button>
                <h1 className="mb-1 text-2xl font-bold tracking-tight">Nombra tu rutina</h1>
                <p className="mb-5 text-sm text-ink-3">
                  {es.workouts.types[type]}
                  {type === 'structured' ? ` · ${FORMAT_LABEL[format]}` : ''}
                </p>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishWizard();
                  }}
                  placeholder={es.workouts.new}
                />
                {nameError && (
                  <span className="mt-1.5 block text-xs font-medium text-accent-dark">
                    {es.app.nameRequired}
                  </span>
                )}
                <div className="mt-6">
                  <Button onClick={finishWizard}>Continuar</Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

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

      {/* Single scrollable two-column area */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col lg:flex-row lg:items-start">
          {/* Left: exercises / blocks (or video) */}
          <div className="flex min-w-0 flex-1 flex-col gap-3.5 px-7 py-5">
          {type === 'structured' ? (
            <>
              <h2 className="text-[15px] font-bold">Contenido</h2>

              <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent-tint/30 px-3 py-2.5">
                <span className="mt-px font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-dark">
                  {FORMAT_LABEL[format]}
                </span>
                <p className="text-[12.5px] leading-snug text-ink-2">{FORMAT_HELP[format]}</p>
              </div>

              {FORMAT_FIELDS[format].length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-line-2 bg-surface px-4 py-2.5">
                  {FORMAT_FIELDS[format].map((f, i) => (
                    <Fragment key={f.key}>
                      {i > 0 && <span className="h-5 w-px bg-line-2" />}
                      {configField(f)}
                    </Fragment>
                  ))}
                </div>
              )}

              {sectionSlot(warmupBlocks, 'warmup', 'Calentamiento')}

              {mainBlocks.map((b) => {
                const bi = blocks.indexOf(b);
                const isCollapsed = collapsed[b.key];
                const r = num(b.rounds);
                const isDropTarget = dragIndex !== null && dragIndex !== bi && overIndex === bi;
                return (
                  <div
                    key={b.key}
                    onDragOver={(e) => {
                      if (dragIndex === null) return;
                      e.preventDefault();
                      if (overIndex !== bi) setOverIndex(bi);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropBlock(bi);
                    }}
                    className={cn(
                      'overflow-hidden rounded-xl border bg-surface',
                      dragIndex === bi ? 'opacity-40' : '',
                      isDropTarget ? 'border-accent ring-1 ring-accent/40' : 'border-[#e2ded5]',
                    )}
                  >
                    {b.kind === 'rest' ? (
                      <div className="flex items-center gap-2 bg-surface-2 px-3 py-2">
                        <span
                          draggable
                          onDragStart={(e) => {
                            setDragIndex(bi);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => {
                            setDragIndex(null);
                            setOverIndex(null);
                          }}
                          className="cursor-grab select-none px-0.5 font-mono text-[15px] text-faint hover:text-ink-3 active:cursor-grabbing"
                          title="Arrastra para reordenar"
                        >
                          ⠿
                        </span>
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-dark">
                          Descanso
                        </span>
                        <input
                          value={b.items[0]?.workSeconds ?? ''}
                          placeholder="0"
                          onChange={(e) =>
                            b.items[0] && updateItem(b.key, b.items[0].key, { workSeconds: e.target.value })
                          }
                          className="h-7 w-16 rounded-md border border-line-2 bg-surface px-2 text-center font-mono text-[12px]"
                        />
                        <span className="font-mono text-[11px] text-muted">seg</span>
                        <span className="flex-1" />
                        <button
                          type="button"
                          onClick={() => duplicateBlock(bi)}
                          className="inline-flex shrink-0 items-center rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink"
                          title="Duplicar"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setBlocks((bs) => bs.filter((x) => x.key !== b.key))}
                          className="inline-flex shrink-0 items-center rounded p-1 text-faint-2 hover:bg-surface-3 hover:text-accent-dark"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>
                    ) : b.kind === 'single' ? (
                      b.items[0] ? (
                        exerciseFields(b.key, b.items[0], blockDragHandle(bi), () => removeBlock(b.key))
                      ) : null
                    ) : (
                      <>
                    <div
                      onClick={() => toggleCollapse(b.key)}
                      className="flex cursor-pointer items-center gap-2 border-b border-[#eeeae2] bg-surface-2 px-3 py-2"
                    >
                      <span
                        draggable
                        onDragStart={(e) => {
                          setDragIndex(bi);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDragIndex(null);
                          setOverIndex(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-grab select-none px-0.5 font-mono text-[15px] text-faint hover:text-ink-3 active:cursor-grabbing"
                        title="Arrastra para reordenar"
                      >
                        ⠿
                      </span>
                      {nameEditKey === b.key ? (
                        <input
                          autoFocus
                          value={b.name}
                          onChange={(e) => updateBlock(b.key, { name: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => setNameEditKey(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') setNameEditKey(null);
                          }}
                          placeholder={`Bloque ${bi + 1}`}
                          className="min-w-0 flex-1 rounded-md border border-line-2 bg-surface px-2 py-1 text-sm font-bold focus:border-accent/50 focus:outline-none"
                        />
                      ) : (
                        <>
                          <span className="truncate text-sm font-bold">
                            {b.name || `Bloque ${bi + 1}`}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNameEditKey(b.key);
                            }}
                            className="inline-flex shrink-0 items-center rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-accent"
                            title="Renombrar"
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                            </svg>
                          </button>
                          <span className="flex-1" />
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateBlock(bi);
                        }}
                        className="inline-flex shrink-0 items-center rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink"
                        title="Duplicar bloque"
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBlocks((bs) => bs.filter((x) => x.key !== b.key));
                        }}
                        className="inline-flex shrink-0 items-center rounded p-1 text-faint-2 hover:bg-surface-3 hover:text-accent-dark"
                        title="Eliminar bloque"
                      >
                        ✕
                      </button>
                    </div>
                    {isCollapsed ? (
                      <div className="px-4 py-2.5 font-mono text-[11px] text-muted">
                        {b.items.length} elemento{b.items.length === 1 ? '' : 's'}
                        {r && r > 1 ? ` · ${r} rondas` : ''}
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-[#f4f1eb] px-3.5 py-2">
                          <label className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-2">
                            {es.workouts.rounds}
                            <input
                              placeholder="1"
                              value={b.rounds}
                              onChange={(e) => updateBlock(b.key, { rounds: e.target.value })}
                              className="h-7 w-12 rounded-md border border-line-2 bg-surface px-2 text-center font-mono text-[12px]"
                            />
                          </label>
                        </div>
                        {b.items.length > 0 && itemHeader()}
                        {b.items.map((it, i) => itemRow(b.key, it, i))}
                        <div className="flex gap-2 p-3">
                          {addButton(es.workouts.addExercise, () => addExerciseTo(b.key))}
                          {addButton('+ Descanso', () => addRestItem(b.key))}
                        </div>
                      </>
                    )}
                      </>
                    )}
                  </div>
                );
              })}
              {blocks.length === 0 && (
                <div className="rounded-xl border border-dashed border-line-2 bg-surface-3 p-[18px] text-center text-[13px] text-ink-3">
                  Añade un ejercicio, un descanso o un bloque para empezar.
                </div>
              )}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAddMenuOpen((v) => !v)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 bg-surface-3 py-3 text-[13px] font-semibold text-ink-2 hover:bg-surface-2"
                >
                  + Añadir
                  <span className="text-[9px] opacity-60">▾</span>
                </button>
                {addMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setAddMenuOpen(false)} />
                    <div className="absolute left-1/2 top-full z-40 mt-1.5 w-60 -translate-x-1/2 overflow-hidden rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
                      {[
                        {
                          label: 'Ejercicio',
                          desc: 'Un ejercicio suelto',
                          on: () => setPickerBlock('__new__'),
                        },
                        {
                          label: 'Descanso',
                          desc: 'Una pausa entre ejercicios',
                          on: () => setBlocks((bs) => [...bs, restBlock()]),
                        },
                        {
                          label: 'Bloque',
                          desc: 'Varias rondas de ejercicios',
                          on: () =>
                            setBlocks((bs) => [
                              ...bs,
                              { ...emptyBlock(), name: `Bloque ${bs.length + 1}` },
                            ]),
                        },
                      ].map((o) => (
                        <button
                          key={o.label}
                          type="button"
                          onClick={() => {
                            o.on();
                            setAddMenuOpen(false);
                          }}
                          className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-surface-2"
                        >
                          <span className="text-[13px] font-semibold text-ink">+ {o.label}</span>
                          <span className="font-mono text-[10px] text-muted">{o.desc}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {sectionSlot(cooldownBlocks, 'cooldown', 'Enfriamiento')}

              <p className="font-mono text-[11px] leading-relaxed text-muted">
                Un bloque son varias rondas de lo que tenga dentro. Calentamiento y enfriamiento son
                opcionales y no cuentan para los resultados.
              </p>
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
          <aside className="flex w-full flex-col gap-[22px] border-t border-line bg-surface px-[22px] py-[22px] lg:sticky lg:top-0 lg:w-[360px] lg:border-l lg:border-t-0">
          <div className="flex flex-col gap-3">
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
            <MonoLabel>{es.workouts.type}</MonoLabel>
            {locked ? (
              <div className="rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-xs font-semibold text-ink-2">
                {es.workouts.types[type]}
              </div>
            ) : (
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
            )}
          </div>

          {type === 'structured' && (
            <>
              <div className="flex flex-col gap-2.5">
                <MonoLabel>{es.workouts.format}</MonoLabel>
                {locked ? (
                  <div className="rounded-lg border border-accent/30 bg-accent-tint/40 px-3 py-2.5 text-xs font-semibold text-accent-dark">
                    {FORMAT_LABEL[format]}
                  </div>
                ) : (
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
                )}
              </div>
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
          </div>

          <div className="flex flex-col gap-2.5">
            <MonoLabel>{es.fields.thumbnail}</MonoLabel>
            <MediaField kind="image" label={es.fields.thumbnail} value={thumbnailAssetId} onChange={setThumbnailAssetId} />
          </div>
          </aside>
        </div>
      </div>

      <EntityPicker<ExerciseListItem>
        open={pickerBlock !== null}
        onClose={() => setPickerBlock(null)}
        title={es.pick.exercise}
        queryKey="exercise-picker"
        load={(s) => api.exercises.list({ search: s || undefined, pageSize: 50 }).then((r) => r.data)}
        renderTitle={(e) => e.name}
        renderSubtitle={(e) => es.difficulty[e.difficulty]}
        onPick={(e) => {
          if (pickerBlock === '__new__') {
            // Top-level "+ Ejercicio" → a loose exercise done once.
            setBlocks((bs) => [...bs, singleBlock(e.id)]);
          } else if (pickerBlock === '__warmup__') {
            setBlocks((bs) => [...bs, singleBlock(e.id, 'warmup')]);
          } else if (pickerBlock === '__cooldown__') {
            setBlocks((bs) => [...bs, singleBlock(e.id, 'cooldown')]);
          } else if (pickerBlock) {
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
