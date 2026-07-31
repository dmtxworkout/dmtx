'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_STATUS, DIFFICULTY } from '@dmtx/schemas';
import type { CreateProgramInput, Program } from '@dmtx/schemas';
import type { WorkoutListItem } from '@dmtx/schemas';
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
import { MediaThumb } from '@/components/media-thumb';
import { EntityPicker } from '@/components/entity-picker';
import { MediaPicker } from '@/components/media-picker';

type DayState = { key: string; title: string; isRestDay: boolean; workoutIds: string[] };
type VideoState = { key: string; mediaAssetId: string; title: string };

const uid = () => crypto.randomUUID();

export function ProgramaForm({ program }: { program?: Program }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const [name, setName] = useState(program?.name ?? '');
  const [description, setDescription] = useState(program?.description ?? '');
  const [difficulty, setDifficulty] = useState(program?.difficulty ?? 'beginner');
  const [status, setStatus] = useState(program?.status ?? 'draft');
  const [durationDays, setDurationDays] = useState(program?.durationDays?.toString() ?? '');
  const [type, setType] = useState<'structured' | 'video_playlist'>(program?.type ?? 'structured');
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(
    program?.thumbnailAssetId ?? null,
  );
  const [days, setDays] = useState<DayState[]>(
    () =>
      program?.days.map((d) => ({
        key: uid(),
        title: d.title ?? '',
        isRestDay: d.isRestDay,
        workoutIds: d.workoutIds,
      })) ?? [],
  );
  const [videos, setVideos] = useState<VideoState[]>(
    () =>
      program?.videoItems.map((v) => ({ key: uid(), mediaAssetId: v.mediaAssetId, title: v.title ?? '' })) ??
      [],
  );
  const [pickerDay, setPickerDay] = useState<string | null>(null);
  const [videoPicker, setVideoPicker] = useState(false);

  const { data: woList } = useQuery({
    queryKey: ['workouts', 'all'],
    queryFn: () => api.workouts.list({ pageSize: 500 }),
  });
  const workoutName = (id: string) => woList?.data.find((w) => w.id === id)?.name ?? '…';

  const save = useMutation({
    mutationFn: () => {
      const payload: CreateProgramInput = {
        name,
        description: description || null,
        type,
        difficulty,
        durationDays: durationDays ? Math.max(1, Number(durationDays)) : null,
        status,
        thumbnailAssetId,
        days:
          type === 'structured'
            ? days.map((d) => ({
                title: d.title || null,
                isRestDay: d.isRestDay,
                workoutIds: d.workoutIds,
              }))
            : [],
        videoItems:
          type === 'video_playlist'
            ? videos.map((v) => ({ mediaAssetId: v.mediaAssetId, title: v.title || null }))
            : [],
      };
      return program ? api.programs.update(program.id, payload) : api.programs.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programs'] });
      router.push('/programas');
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-line bg-surface px-8 py-4">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">
          {program ? es.programs.edit : es.programs.new}
        </h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/programas')}>
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
                <Label>{es.programs.durationDays}</Label>
                <Input
                  inputMode="numeric"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
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
            <CardTitle>{es.programs.type}</CardTitle>
          </CardHeader>
          <CardContent className="py-5">
            <div className="flex gap-2">
              {(['structured', 'video_playlist'] as const).map((t) => (
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
                  {es.programs.types[t]}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {type === 'structured' ? (
          <Card>
            <CardHeader>
              <CardTitle>{es.programs.days}</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDays((ds) => [...ds, { key: uid(), title: '', isRestDay: false, workoutIds: [] }])
                }
              >
                {es.programs.addDay}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 py-4">
              {days.length === 0 && (
                <p className="py-4 text-center text-sm text-muted">{es.programs.noDays}</p>
              )}
              {days.map((d, i) => (
                <div key={d.key} className="rounded-lg border border-line-2 bg-surface-3 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs font-medium text-muted">Día {i + 1}</span>
                    <Input
                      placeholder={es.programs.dayTitle}
                      value={d.title}
                      onChange={(e) =>
                        setDays((ds) => ds.map((x) => (x.key === d.key ? { ...x, title: e.target.value } : x)))
                      }
                      className="max-w-xs"
                    />
                    <label className="flex items-center gap-2 text-sm text-ink-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={d.isRestDay}
                        onChange={(e) =>
                          setDays((ds) =>
                            ds.map((x) => (x.key === d.key ? { ...x, isRestDay: e.target.checked } : x)),
                          )
                        }
                      />
                      {es.programs.restDay}
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setDays((ds) => ds.filter((x) => x.key !== d.key))}
                    >
                      ✕
                    </Button>
                  </div>
                  {!d.isRestDay && (
                    <div className="mt-3 space-y-2">
                      {d.workoutIds.map((wid, wi) => (
                        <div
                          key={`${wid}-${wi}`}
                          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium"
                        >
                          <span className="flex-1 truncate">{workoutName(wid)}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setDays((ds) =>
                                ds.map((x) =>
                                  x.key === d.key
                                    ? { ...x, workoutIds: x.workoutIds.filter((_, j) => j !== wi) }
                                    : x,
                                ),
                              )
                            }
                            className="text-faint hover:text-accent-dark"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPickerDay(d.key)}
                      >
                        {es.programs.addWorkout}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{es.programs.videos}</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => setVideoPicker(true)}>
                {es.programs.addVideo}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 py-4">
              {videos.length === 0 && (
                <p className="py-4 text-center text-sm text-muted">{es.media.empty}</p>
              )}
              {videos.map((v) => (
                <div key={v.key} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2">
                  <MediaThumb assetId={v.mediaAssetId} className="h-10 w-16 rounded-md" />
                  <Input
                    placeholder="Título (opcional)"
                    value={v.title}
                    onChange={(e) =>
                      setVideos((vs) => vs.map((x) => (x.key === v.key ? { ...x, title: e.target.value } : x)))
                    }
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setVideos((vs) => vs.filter((x) => x.key !== v.key))}
                    className="px-1 text-faint hover:text-accent-dark"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <EntityPicker<WorkoutListItem>
        open={pickerDay !== null}
        onClose={() => setPickerDay(null)}
        title={es.pick.workout}
        queryKey="workout-picker"
        load={(s) => api.workouts.list({ search: s || undefined, pageSize: 50 }).then((r) => r.data)}
        renderTitle={(w) => w.name}
        renderSubtitle={(w) => es.difficulty[w.difficulty]}
        onPick={(w) => {
          if (pickerDay) {
            setDays((ds) =>
              ds.map((x) => (x.key === pickerDay ? { ...x, workoutIds: [...x.workoutIds, w.id] } : x)),
            );
          }
        }}
      />
      <MediaPicker
        kind="video"
        open={videoPicker}
        onClose={() => setVideoPicker(false)}
        onPick={(assetId) => setVideos((vs) => [...vs, { key: uid(), mediaAssetId: assetId, title: '' }])}
      />
    </div>
  );
}
