'use client';

import { useRouter } from 'next/navigation';
import { useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_STATUS, DIFFICULTY, WORKOUT_FORMAT } from '@dmtx/schemas';
import type {
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
  amrap: 'Repite todos los bloques, en orden, hasta que se acabe el tiempo. Usa "Rondas" del bloque para sub-secciones (p. ej. un bloque de "3 rondas de…").',
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

type BlockKind = 'group' | 'rest';
type BlockState = {
  key: string;
  kind: BlockKind;
  name: string;
  type: BlockType;
  rounds: string;
  items: ItemState[];
};

const emptyBlock = (): BlockState => ({
  key: uid(),
  kind: 'group',
  name: '',
  type: 'single',
  rounds: '',
  items: [],
});

/** A rest between blocks: a rest-kind block holding a single rest item. */
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
  if (!w) return [emptyBlock()];
  return w.blocks.map((b) => ({
    key: uid(),
    kind: b.kind,
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
  const [formatCfg, setFormatCfg] = useState<Record<string, string>>(initCfg(workout));
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(workout?.thumbnailAssetId ?? null);
  const [videoAssetId, setVideoAssetId] = useState<string | null>(workout?.videoAssetId ?? null);
  const [blocks, setBlocks] = useState<BlockState[]>(() => initBlocks(workout));
  const [pickerBlock, setPickerBlock] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [tempoOpen, setTempoOpen] = useState<Record<string, boolean>>({});
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

  // Type and format define the data shape, so they're frozen once the workout
  // exists — only editable while creating a new one.
  const locked = Boolean(workout);

  const setCfg = (k: string, v: string) => setFormatCfg((c) => ({ ...c, [k]: v }));
  const updateBlock = (key: string, patch: Partial<BlockState>) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const toggleCollapse = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const toggleTempo = (key: string) => setTempoOpen((c) => ({ ...c, [key]: !c[key] }));
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

  const addExerciseTo = (blockKey: string) => setPickerBlock(blockKey);

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
    const ex = exercise(it.exerciseId);
    // Effective measurement: item override, else the exercise's default.
    const measure: MeasurementType = it.measure || ex?.measurementType || 'reps';
    const tf = targetField(measure);
    const tLabel = tempoLabel(it.tempo);
    // Tempo describes the phases of a rep — meaningless for distance work.
    const showTempo = measure !== 'distance';
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
        <div
          className="grid items-center gap-3 px-3.5 py-2"
          style={{ gridTemplateColumns: itemGtc }}
        >
          <div className="flex min-w-0 items-center gap-2">
            {dragHandle(bk, i)}
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
              <div className="flex items-center gap-2">
                {cols.showTarget ? (
                  <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-line-2">
                    {MEASURES.map((m) => (
                      <button
                        key={m.v}
                        type="button"
                        onClick={() => updateItem(bk, it.key, { measure: m.v })}
                        className={cn(
                          'px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em]',
                          measure === m.v ? 'bg-accent text-white' : 'text-muted hover:bg-surface-3',
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                ) : ex ? (
                  <span className="truncate font-mono text-[11px] text-muted">
                    {es.measurement[measure]}
                  </span>
                ) : null}
                {showTempo && (
                  <button
                    type="button"
                    onClick={() => toggleTempo(it.key)}
                    title="Tempo"
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]',
                      tLabel
                        ? 'border-accent/30 bg-accent/10 text-accent-dark'
                        : 'border-line-2 text-muted hover:bg-surface-3',
                    )}
                  >
                    {tLabel ?? 'Tempo'}
                  </button>
                )}
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
          <button
            type="button"
            onClick={() => removeItem(bk, it.key)}
            className="text-center text-faint-2 hover:text-accent-dark"
          >
            ✕
          </button>
        </div>
        {showTempo && tempoOpen[it.key] && (
          <div className="flex flex-wrap items-end gap-3 px-3.5 pb-2.5 pl-[84px]">
            {TEMPO_PHASES.map((phase) => (
              <label key={phase} className="flex flex-col gap-1">
                <span className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-muted-2">
                  {es.exercises.tempo[phase]}
                </span>
                <input
                  value={it.tempo[phase]}
                  placeholder="0"
                  onChange={(e) =>
                    updateItem(bk, it.key, { tempo: { ...it.tempo, [phase]: e.target.value } })
                  }
                  className="h-7 w-14 rounded-md border border-line-2 bg-surface px-2 text-center font-mono text-[12px]"
                />
              </label>
            ))}
            <span className="pb-1.5 font-mono text-[10px] text-muted">
              seg por fase · &quot;X&quot; = explosivo
            </span>
          </div>
        )}
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

  const save = useMutation({
    mutationFn: () => {
      const structured = type === 'structured';
      const cols = itemColumns(format);
      const toItem = (it: ItemState) => {
        const rest = it.kind === 'rest';
        return {
          kind: it.kind,
          exerciseId: rest ? null : it.exerciseId,
          measure: rest ? null : it.measure || null,
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
        kind: b.kind,
        type: b.type,
        label: b.name.trim() || null,
        rounds: num(b.rounds),
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

      {/* Single scrollable two-column area */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col lg:flex-row lg:items-start">
          {/* Left: exercises / blocks (or video) */}
          <div className="flex min-w-0 flex-1 flex-col gap-3.5 px-7 py-5">
          {type === 'structured' ? (
            <>
              <h2 className="text-[15px] font-bold">{es.workouts.blocks}</h2>

              <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent-tint/30 px-3 py-2.5">
                <span className="mt-px font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-dark">
                  {FORMAT_LABEL[format]}
                </span>
                <p className="text-[12.5px] leading-snug text-ink-2">{FORMAT_HELP[format]}</p>
              </div>

              {blocks.map((b, bi) => {
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
                          Descanso entre bloques
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
                  {es.workouts.noBlocks}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setBlocks((bs) => [...bs, { ...emptyBlock(), name: `Bloque ${bs.length + 1}` }])
                  }
                  className="flex-1 rounded-xl border border-dashed border-line-2 bg-surface-3 py-3 text-[13px] font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink-2"
                >
                  {es.workouts.addBlock}
                </button>
                <button
                  type="button"
                  onClick={() => setBlocks((bs) => [...bs, restBlock()])}
                  className="flex-1 rounded-xl border border-dashed border-line-2 bg-surface-3 py-3 text-[13px] font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink-2"
                >
                  + Descanso entre bloques
                </button>
              </div>
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
