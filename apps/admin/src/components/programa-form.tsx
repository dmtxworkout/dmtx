'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_STATUS, DIFFICULTY } from '@dmtx/schemas';
import type { CreateProgramInput, Program, WorkoutListItem } from '@dmtx/schemas';
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
import { MediaPicker } from '@/components/media-picker';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HATCH = 'repeating-linear-gradient(135deg,#f0ece4 0 5px,#e6e1d7 5px 10px)';

type DayState = { key: string; isRestDay: boolean; workoutIds: string[] };
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
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(program?.thumbnailAssetId ?? null);
  const [days, setDays] = useState<DayState[]>(
    () => program?.days.map((d) => ({ key: uid(), isRestDay: d.isRestDay, workoutIds: d.workoutIds })) ?? [],
  );
  const [videos, setVideos] = useState<VideoState[]>(
    () => program?.videoItems.map((v) => ({ key: uid(), mediaAssetId: v.mediaAssetId, title: v.title ?? '' })) ?? [],
  );
  const [pickerDay, setPickerDay] = useState<string | null>(null);
  const [videoPicker, setVideoPicker] = useState(false);

  const { data: woList } = useQuery({
    queryKey: ['workouts', 'all'],
    queryFn: () => api.workouts.list({ pageSize: 500 }),
  });
  const workout = (id: string) => woList?.data.find((w) => w.id === id);

  const setDay = (key: string, patch: Partial<DayState>) =>
    setDays((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const usage = new Map<string, number>();
  days.forEach((d) => d.workoutIds.forEach((w) => usage.set(w, (usage.get(w) ?? 0) + 1)));

  const save = useMutation({
    mutationFn: () => {
      const payload: CreateProgramInput = {
        name,
        description: description || null,
        type,
        difficulty,
        durationDays: durationDays ? Math.max(1, Number(durationDays)) : type === 'structured' ? days.length || null : null,
        status,
        thumbnailAssetId,
        days: type === 'structured' ? days.map((d) => ({ isRestDay: d.isRestDay, workoutIds: d.workoutIds })) : [],
        videoItems:
          type === 'video_playlist' ? videos.map((v) => ({ mediaAssetId: v.mediaAssetId, title: v.title || null })) : [],
      };
      return program ? api.programs.update(program.id, payload) : api.programs.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programs'] });
      router.push('/programas');
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });

  const doSave = () => {
    setServerError(null);
    if (!name.trim()) return setServerError(es.app.required);
    save.mutate();
  };

  const metaLine = [es.programs.types[type], `${days.length} días`, es.difficulty[difficulty]].join(' · ');
  const weekCount = Math.max(1, Math.ceil((days.length + 1) / 7));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-start justify-between gap-6 border-b border-line bg-surface px-7 pb-4 pt-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2 font-mono text-xs font-medium text-muted">
            <button type="button" onClick={() => router.push('/programas')} className="hover:text-ink-2">
              {es.programs.title}
            </button>
            <span>/</span>
            <span className="text-ink-2">{program ? 'Editar' : 'Nuevo'}</span>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={es.programs.new}
            className="w-full max-w-2xl bg-transparent text-[26px] font-bold tracking-[-0.02em] placeholder:text-faint focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ background: '#fdf0d9', color: '#8a5a12' }}
            >
              {es.status[status]}
            </span>
            <span className="font-mono text-xs font-medium text-muted">{metaLine}</span>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/programas')}>
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

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        {/* Left: calendar or playlist */}
        <div className="flex min-w-0 flex-col gap-3.5 overflow-auto px-7 py-5">
          {type === 'structured' ? (
            <div className="flex min-w-[820px] flex-col gap-3.5">
              <div className="grid grid-cols-[76px_repeat(7,minmax(0,1fr))] gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2">
                <span />
                {WEEKDAYS.map((d) => (
                  <span key={d} className="pl-0.5">
                    {d}
                  </span>
                ))}
              </div>
              {Array.from({ length: weekCount }).map((_, w) => (
                <div key={w} className="grid grid-cols-[76px_repeat(7,minmax(0,1fr))] items-stretch gap-2">
                  <div className="flex flex-col justify-center gap-0.5 pr-1.5">
                    <span className="text-sm font-bold">Semana {w + 1}</span>
                  </div>
                  {Array.from({ length: 7 }).map((__, j) => {
                    const idx = w * 7 + j;
                    const d = days[idx];
                    if (!d && idx === days.length) {
                      return (
                        <button
                          key={j}
                          type="button"
                          onClick={() => setDays((ds) => [...ds, { key: uid(), isRestDay: false, workoutIds: [] }])}
                          className="flex min-h-[92px] items-center justify-center rounded-[10px] border border-dashed border-line-2 bg-surface-3 text-lg text-faint-2 hover:bg-surface-2"
                        >
                          +
                        </button>
                      );
                    }
                    if (!d) return <div key={j} className="min-h-[92px]" />;
                    const wid = d.workoutIds[0];
                    const wo = wid ? workout(wid) : undefined;
                    return (
                      <div
                        key={d.key}
                        className="group relative flex min-h-[92px] flex-col gap-1.5 rounded-[10px] border border-line bg-surface p-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-faint">{idx + 1}</span>
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              title={es.programs.restDay}
                              onClick={() => setDay(d.key, { isRestDay: !d.isRestDay, workoutIds: [] })}
                              className="text-[10px] text-faint hover:text-ink-2"
                            >
                              💤
                            </button>
                            <button
                              type="button"
                              onClick={() => setDays((ds) => ds.filter((x) => x.key !== d.key))}
                              className="text-[10px] text-faint hover:text-accent-dark"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {d.isRestDay ? (
                          <span className="m-auto text-[11px] font-semibold text-muted-2">Descanso</span>
                        ) : wo ? (
                          <button
                            type="button"
                            onClick={() => setPickerDay(d.key)}
                            className="flex flex-col gap-1 text-left"
                          >
                            {wo.thumbnailAssetId ? (
                              <MediaThumb assetId={wo.thumbnailAssetId} className="h-[26px] w-full rounded-[5px]" />
                            ) : (
                              <div className="h-[26px] rounded-[5px]" style={{ background: HATCH }} />
                            )}
                            <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{wo.name}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPickerDay(d.key)}
                            className="m-auto text-base text-faint-2 hover:text-accent"
                          >
                            +
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="max-w-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-bold">{es.programs.videos}</h2>
                <Button type="button" variant="outline" size="sm" onClick={() => setVideoPicker(true)}>
                  {es.programs.addVideo}
                </Button>
              </div>
              <div className="space-y-2">
                {videos.length === 0 && <p className="py-4 text-center text-sm text-muted">{es.media.empty}</p>}
                {videos.map((v) => (
                  <div key={v.key} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2">
                    <MediaThumb assetId={v.mediaAssetId} className="h-10 w-16 rounded-md" />
                    <Input
                      placeholder="Título (opcional)"
                      value={v.title}
                      onChange={(e) => setVideos((vs) => vs.map((x) => (x.key === v.key ? { ...x, title: e.target.value } : x)))}
                      className="flex-1"
                    />
                    <button type="button" onClick={() => setVideos((vs) => vs.filter((x) => x.key !== v.key))} className="px-1 text-faint hover:text-accent-dark">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="flex flex-col gap-[22px] overflow-y-auto border-t border-line bg-surface px-[22px] py-[22px] lg:border-l lg:border-t-0">
          <div className="flex flex-col gap-2.5">
            <MonoLabel>{es.programs.type}</MonoLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {(['structured', 'video_playlist'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'rounded-lg border px-1.5 py-2.5 text-center text-xs font-semibold',
                    type === t ? 'border-ink bg-ink text-white' : 'border-line-2 bg-surface text-ink-2',
                  )}
                >
                  {es.programs.types[t]}
                </button>
              ))}
            </div>
          </div>

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
                <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.programs.durationDays}</div>
                <Input inputMode="numeric" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} />
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

          {type === 'structured' && usage.size > 0 && (
            <div className="flex flex-col gap-2.5">
              <MonoLabel>Rutinas usadas</MonoLabel>
              {Array.from(usage.entries()).map(([wid, n]) => {
                const wo = workout(wid);
                return (
                  <div key={wid} className="flex items-center gap-2.5 border-b border-line-4 py-1.5">
                    {wo?.thumbnailAssetId ? (
                      <MediaThumb assetId={wo.thumbnailAssetId} className="h-[26px] w-[42px] shrink-0 rounded-[5px]" />
                    ) : (
                      <div className="h-[26px] w-[42px] shrink-0 rounded-[5px]" style={{ background: HATCH }} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{wo?.name ?? '…'}</span>
                    <span className="font-mono text-[11px] text-muted">×{n}</span>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
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
          if (pickerDay) setDay(pickerDay, { workoutIds: [w.id], isRestDay: false });
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
