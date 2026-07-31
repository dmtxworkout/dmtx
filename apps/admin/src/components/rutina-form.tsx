'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BLOCK_TYPE,
  CONTENT_STATUS,
  DIFFICULTY,
  WORKOUT_FORMAT,
} from '@dmtx/schemas';
import type {
  BlockType,
  CreateWorkoutInput,
  FormatConfig,
  Workout,
  WorkoutFormat,
} from '@dmtx/schemas';
import type { ExerciseListItem } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MediaField } from '@/components/media-field';
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
    { key: 'restBetweenRoundsSeconds', label: 'Descanso entre rondas (seg)' },
    { key: 'timeCapSeconds', label: 'Tiempo límite (seg)' },
  ],
};

type ItemState = {
  key: string;
  exerciseId: string;
  sets: string;
  reps: string;
  workSeconds: string;
  restBetweenSeconds: string;
};
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
      return {
        format,
        configVersion: 1,
        ...(t > 0 ? { timeCapSeconds: t } : {}),
        ...(r > 0 ? { rounds: r } : {}),
      };
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
    type: b.type,
    rounds: b.rounds?.toString() ?? '',
    restAfterSeconds: b.restAfterSeconds?.toString() ?? '',
    items: b.items.map((it) => ({
      key: uid(),
      exerciseId: it.exerciseId,
      sets: it.sets?.toString() ?? '',
      reps: it.reps?.toString() ?? '',
      workSeconds: it.workSeconds?.toString() ?? '',
      restBetweenSeconds: it.restBetweenSeconds?.toString() ?? '',
    })),
  }));
}

function initCfg(w?: Workout): Record<string, string> {
  const out: Record<string, string> = {};
  const c = w?.formatConfig;
  if (c) {
    for (const [k, v] of Object.entries(c)) {
      if (k !== 'format' && k !== 'configVersion' && typeof v === 'number') out[k] = String(v);
    }
  }
  return out;
}

export function RutinaForm({ workout }: { workout?: Workout }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

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
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(
    workout?.thumbnailAssetId ?? null,
  );
  const [videoAssetId, setVideoAssetId] = useState<string | null>(workout?.videoAssetId ?? null);
  const [blocks, setBlocks] = useState<BlockState[]>(() => initBlocks(workout));
  const [pickerBlock, setPickerBlock] = useState<string | null>(null);

  const { data: exList } = useQuery({
    queryKey: ['exercises', 'all'],
    queryFn: () => api.exercises.list({ pageSize: 500 }),
  });
  const exerciseName = (id: string) => exList?.data.find((e) => e.id === id)?.name ?? '…';

  const setCfg = (k: string, v: string) => setFormatCfg((c) => ({ ...c, [k]: v }));
  const updateBlock = (key: string, patch: Partial<BlockState>) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const updateItem = (bk: string, ik: string, patch: Partial<ItemState>) =>
    setBlocks((bs) =>
      bs.map((b) =>
        b.key === bk
          ? { ...b, items: b.items.map((it) => (it.key === ik ? { ...it, ...patch } : it)) }
          : b,
      ),
    );

  const save = useMutation({
    mutationFn: () => {
      const structured = type === 'structured';
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
        blocks: structured
          ? blocks.map((b) => ({
              type: b.type,
              rounds: num(b.rounds),
              restAfterSeconds: num(b.restAfterSeconds),
              items: b.items.map((it) => ({
                exerciseId: it.exerciseId,
                sets: num(it.sets),
                reps: num(it.reps),
                workSeconds: num(it.workSeconds),
                restBetweenSeconds: num(it.restBetweenSeconds),
                perSide: false,
              })),
            }))
          : [],
      };
      return workout ? api.workouts.update(workout.id, payload) : api.workouts.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts'] });
      router.push('/rutinas');
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-line bg-surface px-8 py-4">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">
          {workout ? es.workouts.edit : es.workouts.new}
        </h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/rutinas')}>
            {es.app.cancel}
          </Button>
          <Button
            onClick={() => {
              setServerError(null);
              if (!name.trim()) {
                setServerError(es.app.required);
                return;
              }
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? es.app.saving : es.app.save}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-8 py-6">
        {serverError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-accent-dark">{serverError}</p>
        )}

        <Card>
          <CardContent className="space-y-4 py-5">
            <div>
              <Label>{es.fields.name}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>{es.fields.description}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>{es.fields.difficulty}</Label>
                <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                  {DIFFICULTY.map((d) => (
                    <option key={d} value={d}>
                      {es.difficulty[d]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{es.workouts.duration}</Label>
                <Input
                  inputMode="numeric"
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                />
              </div>
              <div>
                <Label>{es.fields.status}</Label>
                <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                  {CONTENT_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {es.status[s]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{es.workouts.type}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 py-5">
            <div className="flex gap-2">
              {(['structured', 'video'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'h-9 rounded-lg border px-4 text-sm font-semibold transition-colors',
                    type === t
                      ? 'border-accent bg-accent-tint/40 text-accent-dark'
                      : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
                  )}
                >
                  {es.workouts.types[t]}
                </button>
              ))}
            </div>

            {type === 'structured' ? (
              <div className="space-y-4">
                <div className="max-w-xs">
                  <Label>{es.workouts.format}</Label>
                  <Select value={format} onChange={(e) => setFormat(e.target.value as WorkoutFormat)}>
                    {WORKOUT_FORMAT.map((f) => (
                      <option key={f} value={f}>
                        {FORMAT_LABEL[f]}
                      </option>
                    ))}
                  </Select>
                </div>
                {FORMAT_FIELDS[format].length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    {FORMAT_FIELDS[format].map((f) => (
                      <div key={f.key}>
                        <Label>{f.label}</Label>
                        <Input
                          inputMode="numeric"
                          value={formatCfg[f.key] ?? ''}
                          onChange={(e) => setCfg(f.key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <MediaField
                kind="video"
                label={es.workouts.video}
                value={videoAssetId}
                onChange={setVideoAssetId}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{es.fields.thumbnail}</CardTitle>
          </CardHeader>
          <CardContent className="py-5">
            <div className="max-w-xs">
              <MediaField
                kind="image"
                label={es.fields.thumbnail}
                value={thumbnailAssetId}
                onChange={setThumbnailAssetId}
              />
            </div>
          </CardContent>
        </Card>

        {type === 'structured' && (
          <Card>
            <CardHeader>
              <CardTitle>{es.workouts.blocks}</CardTitle>
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
            </CardHeader>
            <CardContent className="space-y-4 py-4">
              {blocks.length === 0 && (
                <p className="py-4 text-center text-sm text-muted">{es.workouts.noBlocks}</p>
              )}
              {blocks.map((b, bi) => (
                <div key={b.key} className="rounded-lg border border-line-2 bg-surface-3">
                  <div className="flex flex-wrap items-end gap-3 border-b border-line-3 p-3">
                    <span className="font-mono text-xs font-medium text-muted">#{bi + 1}</span>
                    <div className="w-40">
                      <Label>{es.workouts.blockType}</Label>
                      <Select
                        value={b.type}
                        onChange={(e) => updateBlock(b.key, { type: e.target.value as BlockType })}
                      >
                        {BLOCK_TYPE.map((t) => (
                          <option key={t} value={t}>
                            {es.workouts.blockLabels[t]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-24">
                      <Label>{es.workouts.rounds}</Label>
                      <Input
                        inputMode="numeric"
                        value={b.rounds}
                        onChange={(e) => updateBlock(b.key, { rounds: e.target.value })}
                      />
                    </div>
                    <div className="w-40">
                      <Label>{es.workouts.restAfter}</Label>
                      <Input
                        inputMode="numeric"
                        value={b.restAfterSeconds}
                        onChange={(e) => updateBlock(b.key, { restAfterSeconds: e.target.value })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setBlocks((bs) => bs.filter((x) => x.key !== b.key))}
                    >
                      ✕
                    </Button>
                  </div>

                  <div className="space-y-2 p-3">
                    {b.items.map((it) => (
                      <div key={it.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2">
                        <span className="min-w-[120px] flex-1 truncate px-1 text-sm font-medium">
                          {exerciseName(it.exerciseId)}
                        </span>
                        <input
                          placeholder={es.workouts.sets}
                          value={it.sets}
                          onChange={(e) => updateItem(b.key, it.key, { sets: e.target.value })}
                          className="h-8 w-16 rounded-md border border-line-2 bg-surface px-2 text-center text-sm"
                        />
                        <input
                          placeholder={es.workouts.reps}
                          value={it.reps}
                          onChange={(e) => updateItem(b.key, it.key, { reps: e.target.value })}
                          className="h-8 w-16 rounded-md border border-line-2 bg-surface px-2 text-center text-sm"
                        />
                        <input
                          placeholder={es.workouts.work}
                          value={it.workSeconds}
                          onChange={(e) => updateItem(b.key, it.key, { workSeconds: e.target.value })}
                          className="h-8 w-20 rounded-md border border-line-2 bg-surface px-2 text-center text-sm"
                        />
                        <input
                          placeholder={es.workouts.rest}
                          value={it.restBetweenSeconds}
                          onChange={(e) =>
                            updateItem(b.key, it.key, { restBetweenSeconds: e.target.value })
                          }
                          className="h-8 w-20 rounded-md border border-line-2 bg-surface px-2 text-center text-sm"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateBlock(b.key, { items: b.items.filter((x) => x.key !== it.key) })
                          }
                          className="px-1 text-faint hover:text-accent-dark"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPickerBlock(b.key)}
                    >
                      {es.workouts.addExercise}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
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
                b.key === pickerBlock
                  ? {
                      ...b,
                      items: [
                        ...b.items,
                        {
                          key: uid(),
                          exerciseId: e.id,
                          sets: '',
                          reps: '',
                          workSeconds: '',
                          restBetweenSeconds: '',
                        },
                      ],
                    }
                  : b,
              ),
            );
          }
        }}
      />
    </div>
  );
}
