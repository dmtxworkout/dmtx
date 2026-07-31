'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_STATUS, DIFFICULTY, GOAL_COMPARATOR, GOAL_METRIC } from '@dmtx/schemas';
import type { CreateSkillInput, GoalComparator, GoalMetric, Skill } from '@dmtx/schemas';
import type { WorkoutListItem } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MediaField } from '@/components/media-field';
import { EntityPicker } from '@/components/entity-picker';

type LevelState = {
  key: string;
  name: string;
  workoutId: string;
  goalMetric: GoalMetric;
  goalComparator: GoalComparator;
  goalValue: string;
};

const uid = () => crypto.randomUUID();

export function HabilidadForm({ skill }: { skill?: Skill }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const [name, setName] = useState(skill?.name ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [difficulty, setDifficulty] = useState(skill?.difficulty ?? 'beginner');
  const [status, setStatus] = useState(skill?.status ?? 'draft');
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(
    skill?.thumbnailAssetId ?? null,
  );
  const [levels, setLevels] = useState<LevelState[]>(
    () =>
      skill?.levels.map((l) => {
        const g = l.unlockGoal && 'metric' in l.unlockGoal ? l.unlockGoal : null;
        return {
          key: uid(),
          name: l.name,
          workoutId: l.workoutId,
          goalMetric: g?.metric ?? 'reps',
          goalComparator: g?.comparator ?? 'gte',
          goalValue: g ? String(g.value) : '',
        };
      }) ?? [],
  );
  const [pickerLevel, setPickerLevel] = useState<string | null>(null);

  const { data: woList } = useQuery({
    queryKey: ['workouts', 'all'],
    queryFn: () => api.workouts.list({ pageSize: 500 }),
  });
  const workoutName = (id: string) =>
    id ? (woList?.data.find((w) => w.id === id)?.name ?? '…') : es.pick.workout;

  const updateLevel = (key: string, patch: Partial<LevelState>) =>
    setLevels((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = useMutation({
    mutationFn: () => {
      const payload: CreateSkillInput = {
        name,
        description: description || null,
        difficulty,
        status,
        thumbnailAssetId,
        levels: levels
          .filter((l) => l.name.trim() && l.workoutId)
          .map((l) => {
            const v = Number(l.goalValue);
            const unlockGoal =
              l.goalValue.trim() && Number.isFinite(v)
                ? { metric: l.goalMetric, comparator: l.goalComparator, value: v }
                : null;
            return { name: l.name, workoutId: l.workoutId, unlockGoal };
          }),
      };
      return skill ? api.skills.update(skill.id, payload) : api.skills.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      router.push('/habilidades');
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-line bg-surface px-8 py-4">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">
          {skill ? es.skills.edit : es.skills.new}
        </h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/habilidades')}>
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
            <div className="grid gap-4 sm:grid-cols-2">
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

        <Card>
          <CardHeader>
            <CardTitle>{es.skills.levels}</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLevels((ls) => [
                  ...ls,
                  {
                    key: uid(),
                    name: '',
                    workoutId: '',
                    goalMetric: 'reps',
                    goalComparator: 'gte',
                    goalValue: '',
                  },
                ])
              }
            >
              {es.skills.addLevel}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 py-4">
            {levels.length === 0 && (
              <p className="py-4 text-center text-sm text-muted">{es.skills.noLevels}</p>
            )}
            {levels.map((l, i) => (
              <div key={l.key} className="rounded-lg border border-line-2 bg-surface-3 p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <Input
                    placeholder={es.skills.levelName}
                    value={l.name}
                    onChange={(e) => updateLevel(l.key, { name: e.target.value })}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLevels((ls) => ls.filter((x) => x.key !== l.key))}
                  >
                    ✕
                  </Button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{es.pick.workout}</Label>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setPickerLevel(l.key)}
                    >
                      <span className="truncate">{workoutName(l.workoutId)}</span>
                    </Button>
                  </div>
                  <div>
                    <Label>{es.skills.unlockGoal}</Label>
                    <div className="flex gap-1.5">
                      <Select
                        value={l.goalMetric}
                        onChange={(e) => updateLevel(l.key, { goalMetric: e.target.value as GoalMetric })}
                      >
                        {GOAL_METRIC.map((m) => (
                          <option key={m} value={m}>
                            {es.goal.metrics[m]}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={l.goalComparator}
                        onChange={(e) =>
                          updateLevel(l.key, { goalComparator: e.target.value as GoalComparator })
                        }
                        className="w-16"
                      >
                        {GOAL_COMPARATOR.map((c) => (
                          <option key={c} value={c}>
                            {es.goal.comparators[c]}
                          </option>
                        ))}
                      </Select>
                      <Input
                        inputMode="numeric"
                        placeholder={es.goal.value}
                        value={l.goalValue}
                        onChange={(e) => updateLevel(l.key, { goalValue: e.target.value })}
                        className="w-20"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <EntityPicker<WorkoutListItem>
        open={pickerLevel !== null}
        onClose={() => setPickerLevel(null)}
        title={es.pick.workout}
        queryKey="workout-picker"
        load={(s) => api.workouts.list({ search: s || undefined, pageSize: 50 }).then((r) => r.data)}
        renderTitle={(w) => w.name}
        renderSubtitle={(w) => es.difficulty[w.difficulty]}
        onPick={(w) => {
          if (pickerLevel) updateLevel(pickerLevel, { workoutId: w.id });
        }}
      />
    </div>
  );
}
