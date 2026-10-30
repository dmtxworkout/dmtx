'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { DIFFICULTY, difficultySchema } from '@dmtx/schemas';
import type { CreateExerciseInput, Exercise } from '@dmtx/schemas';
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
import { toast } from '@/components/ui/toast';
import { useUnsavedChanges } from '@/components/unsaved-changes';
import { ActionsMenu } from '@/components/ui/actions-menu';
import { BodyFigure } from '@/components/body-figure';
import { EquipmentPicker, MusclePicker, useTaxonomy } from '@/components/tag-pickers';
import { Dialog } from '@/components/ui/dialog';

const formSchema = z.object({
  name: z.string().min(1, es.app.nameRequired),
  description: z.string(),
  difficulty: difficultySchema,
});
type FormValues = z.infer<typeof formSchema>;

const emptyValues: FormValues = {
  name: '',
  description: '',
  difficulty: 'beginner',
};

function toDefaults(exercise: Exercise): FormValues {
  return {
    name: exercise.name,
    description: exercise.description ?? '',
    difficulty: exercise.difficulty,
  };
}

/**
 * A list of short texts that grows as you type: the last row is always an
 * empty one; writing in it turns it into a value and a fresh empty row appears
 * below. Blank values are dropped on save, never while editing (a row you are
 * clearing to rewrite must not vanish under the cursor).
 */
function GrowingList({
  values,
  onChange,
  placeholder,
  addPlaceholder,
  removeLabel,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addPlaceholder: string;
  removeLabel: string;
}) {
  const rows = [...values, ''];
  const list = useRef<HTMLDivElement>(null);
  // Enter moves to the next row (the empty one at the end, once this row has a
  // value) instead of submitting the whole form. The next row may have just
  // been rendered, so it is looked up in the DOM after the commit.
  const next = (k: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.currentTarget.value.trim()) return;
    window.setTimeout(() => {
      const inputs = list.current?.querySelectorAll<HTMLInputElement>('input') ?? [];
      inputs[k + 1]?.focus();
    }, 0);
  };
  const write = (k: number, value: string) => {
    if (k === values.length) {
      if (value === '') return;
      onChange([...values, value]);
      return;
    }
    onChange(values.map((v, j) => (j === k ? value : v)));
  };
  return (
    <div ref={list} className="flex flex-col gap-2">
      {rows.map((v, k) => {
        const last = k === rows.length - 1;
        return (
          <div key={k} className="flex items-center gap-1.5">
            <Input
              value={v}
              onChange={(e) => write(k, e.target.value)}
              onKeyDown={(e) => next(k, e)}
              placeholder={last ? (values.length ? addPlaceholder : (placeholder ?? addPlaceholder)) : undefined}
            />
            {/* The empty last row has nothing to remove; a spacer keeps the inputs from jumping. */}
            {last ? (
              <span className="h-9 w-9 flex-none" />
            ) : (
              <button
                type="button"
                aria-label={`${removeLabel} ${v}`}
                onClick={() => onChange(values.filter((_, j) => j !== k))}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-md text-faint-2 hover:bg-surface-2 hover:text-accent-dark"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ExerciseForm({
  exercise,
  initialName,
  embedded = false,
  onSaved,
  onCancel,
}: {
  exercise?: Exercise;
  /** Name to start with (a new exercise created from the rutina editor). */
  initialName?: string;
  /** Inside a dialog: one column, actions at the bottom, no page header. */
  embedded?: boolean;
  /** Called with the saved exercise instead of navigating to the list. */
  onSaved?: (exercise: Exercise) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(
    exercise?.thumbnailAssetId ?? null,
  );
  const [demoVideoAssetId, setDemoVideoAssetId] = useState<string | null>(
    exercise?.demoVideoAssetId ?? null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cues, setCues] = useState<string[]>(exercise?.cues ?? []);
  const [aliases, setAliases] = useState<string[]>(exercise?.aliases ?? []);
  const [muscleIds, setMuscleIds] = useState<string[]>(exercise?.muscleIds ?? []);
  const { data: taxonomy } = useTaxonomy();
  // What the chosen muscles light up on the body, as the app will show it.
  const bodyParts = [...new Set((taxonomy?.muscles ?? []).filter((m) => muscleIds.includes(m.id)).flatMap((m) => (m.bodyPart ? [m.bodyPart] : [])))];
  const [equipmentIds, setEquipmentIds] = useState<string[]>(exercise?.equipmentIds ?? []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: exercise ? toDefaults(exercise) : { ...emptyValues, name: initialName ?? '' },
  });

  const leave = () => (onCancel ? onCancel() : router.push('/ejercicios'));

  // Page mode: everything the form sends, as one comparable snapshot; the
  // baseline is the loaded exercise (or the empty form) and the last save.
  type Snapshot = {
    values: FormValues;
    cues: string[];
    aliases: string[];
    muscleIds: string[];
    equipmentIds: string[];
    thumbnailAssetId: string | null;
    demoVideoAssetId: string | null;
  };
  const watched = form.watch();
  const current: Snapshot = { values: watched, cues, aliases, muscleIds, equipmentIds, thumbnailAssetId, demoVideoAssetId };
  const [baseline, setBaseline] = useState<Snapshot>(() => ({
    values: exercise ? toDefaults(exercise) : { ...emptyValues, name: initialName ?? '' },
    cues: exercise?.cues ?? [],
    aliases: exercise?.aliases ?? [],
    muscleIds: exercise?.muscleIds ?? [],
    equipmentIds: exercise?.equipmentIds ?? [],
    thumbnailAssetId: exercise?.thumbnailAssetId ?? null,
    demoVideoAssetId: exercise?.demoVideoAssetId ?? null,
  }));
  const dirty = JSON.stringify(current) !== JSON.stringify(baseline);
  const discard = () => {
    if (!exercise) {
      router.push('/ejercicios');
      return;
    }
    form.reset(baseline.values);
    setCues(baseline.cues);
    setAliases(baseline.aliases);
    setMuscleIds(baseline.muscleIds);
    setEquipmentIds(baseline.equipmentIds);
    setThumbnailAssetId(baseline.thumbnailAssetId);
    setDemoVideoAssetId(baseline.demoVideoAssetId);
    setServerError(null);
  };

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const base = {
        name: values.name,
        description: values.description || null,
        cues: cues.map((c) => c.trim()).filter((v) => v.length > 0),
        aliases: aliases.map((a) => a.trim()).filter((v) => v.length > 0),
        difficulty: values.difficulty,
        thumbnailAssetId,
        demoVideoAssetId,
        muscleIds,
        equipmentIds,
      };
      if (exercise) return api.exercises.update(exercise.id, base);
      const payload: CreateExerciseInput = base;
      return api.exercises.create(payload);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['exercises'] });
      qc.setQueryData(['exercise', saved.id], saved);
      if (onSaved) {
        onSaved(saved);
        return;
      }
      // Stay on the page, like the rutina editor: the saved state is the new baseline.
      setBaseline({
        values: toDefaults(saved),
        cues: saved.cues,
        aliases: saved.aliases,
        muscleIds: saved.muscleIds,
        equipmentIds: saved.equipmentIds,
        thumbnailAssetId: saved.thumbnailAssetId,
        demoVideoAssetId: saved.demoVideoAssetId,
      });
      toast('Ejercicio guardado');
      if (!exercise) router.replace(`/ejercicios/${saved.id}`);
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });

  const removeExercise = useMutation({
    mutationFn: () => api.exercises.remove(exercise!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises'] });
      router.push('/ejercicios');
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });
  // Archiving hides the exercise from suggestions and the list; rutinas keep it.
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.exercises.update(exercise!.id, { archived }),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['exercises'] });
      qc.setQueryData(['exercise', saved.id], saved);
      toast(saved.archivedAt ? 'Ejercicio archivado' : 'Ejercicio restaurado');
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    save.mutate(values);
  });
  const { bar: unsavedBar, guardNav } = useUnsavedChanges({
    dirty: !embedded && dirty,
    saving: save.isPending,
    onSave: () => void onSubmit(),
    onDiscard: discard,
  });
  // A page opened from the rutina editor's "create" link starts dirty only if typed into.
  useEffect(() => {
    if (!exercise && initialName) setBaseline((b) => ({ ...b, values: { ...b.values, name: initialName } }));
  }, [exercise, initialName]);

  // In a dialog the actions sit at the bottom; on the page the floating bar
  // (save / discard) takes over and the header keeps only Eliminar.
  const dialogActions = (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={leave}>
        {es.app.cancel}
      </Button>
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? es.app.saving : exercise ? es.app.save : 'Crear'}
      </Button>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {unsavedBar}
      {!embedded && (
        <div className="flex items-center justify-between gap-4 border-b border-line bg-surface px-8 py-4">
          <div className="flex items-center gap-2 font-mono text-xs font-medium text-muted">
            <button type="button" onClick={() => guardNav(() => router.push('/ejercicios'))} className="hover:text-ink-2">
              {es.exercises.title}
            </button>
            <span>/</span>
            <span className="text-ink-2">{exercise ? 'Editar' : 'Nuevo'}</span>
          </div>
          {exercise && (
            <div className="flex items-center gap-3">
              {exercise.archivedAt && (
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Archivado</span>
              )}
              <ActionsMenu
                items={[
                  {
                    label: exercise.archivedAt ? 'Restaurar' : 'Archivar',
                    disabled: archive.isPending,
                    onSelect: () => archive.mutate(!exercise.archivedAt),
                  },
                  { label: es.app.delete, danger: true, onSelect: () => setConfirmDelete(true) },
                ]}
              />
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {serverError && (
          <p className={cn('mt-5 rounded-md bg-red-50 px-3 py-2 text-sm text-accent-dark', embedded ? 'mx-5' : 'mx-8')}>
            {serverError}
          </p>
        )}

        <div className={cn('grid gap-5', embedded ? 'px-5 py-5' : 'px-8 py-6 lg:grid-cols-[minmax(0,1fr)_360px]')}>
          {/* Left: details, cues, aliases */}
          <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardContent className="space-y-4 py-5">
                <div>
                  <Label htmlFor="name">{es.exercises.fields.name}</Label>
                  <Input id="name" autoFocus={!exercise} {...form.register('name')} />
                  {form.formState.errors.name && (
                    <p className="mt-1 text-xs text-accent-dark">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="description">{es.exercises.fields.description}</Label>
                  <Textarea id="description" {...form.register('description')} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{es.exercises.fields.media}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6 py-5 sm:grid sm:grid-cols-2">
                <MediaField
                  kind="image"
                  label={es.exercises.fields.thumbnail}
                  value={thumbnailAssetId}
                  onChange={setThumbnailAssetId}
                />
                <MediaField
                  kind="video"
                  label={es.exercises.fields.demoVideo}
                  value={demoVideoAssetId}
                  onChange={setDemoVideoAssetId}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{es.exercises.fields.cues}</CardTitle>
              </CardHeader>
              <CardContent className="py-4">
                <GrowingList
                  values={cues}
                  onChange={setCues}
                  placeholder="p. ej. Espalda recta, mirada al frente"
                  addPlaceholder={es.exercises.fields.addCue}
                  removeLabel="Quitar indicación"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{es.exercises.fields.aliases}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 py-4">
                <p className="text-xs text-zinc-500">{es.exercises.fields.aliasesHelp}</p>
                <GrowingList
                  values={aliases}
                  onChange={setAliases}
                  placeholder="p. ej. push up"
                  addPlaceholder={es.exercises.fields.addAlias}
                  removeLabel="Quitar alias"
                />
              </CardContent>
            </Card>
          </div>

          {/* Right: difficulty, media */}
          <div className={cn('flex flex-col gap-5', !embedded && 'lg:sticky lg:top-6')}>
            <Card>
              <CardContent className="py-5">
                <Label htmlFor="difficulty">{es.exercises.fields.difficulty}</Label>
                <Select id="difficulty" {...form.register('difficulty')}>
                  {DIFFICULTY.map((d) => (
                    <option key={d} value={d}>
                      {es.difficulty[d]}
                    </option>
                  ))}
                </Select>
              </CardContent>
            </Card>
            {/* overflow-visible: the muscle dropdown hangs below the card. */}
            <Card className="overflow-visible">
              <CardHeader className="rounded-t-[11px]">
                <CardTitle>Músculos</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 py-4">
                <MusclePicker value={muscleIds} onChange={setMuscleIds} />
                {bodyParts.length > 0 && <BodyFigure size="sm" lit={bodyParts} hint="Lo que trabaja" />}
              </CardContent>
            </Card>
            <Card className="overflow-visible">
              <CardHeader className="rounded-t-[11px]">
                <CardTitle>Equipo</CardTitle>
              </CardHeader>
              <CardContent className="py-4">
                <EquipmentPicker value={equipmentIds} onChange={setEquipmentIds} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {embedded && (
        <div className="flex justify-end border-t border-line-3 bg-surface px-5 py-3">{dialogActions}</div>
      )}

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Eliminar ejercicio" className="max-w-sm">
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[14px] leading-relaxed text-ink-2">
            ¿Eliminar <strong className="font-semibold text-ink">{exercise?.name}</strong>? Solo se puede eliminar un ejercicio que ninguna rutina ni ningún resultado de
            usuario use. Si está en uso, archívalo.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              {es.app.cancel}
            </Button>
            <Button
              type="button"
              disabled={removeExercise.isPending}
              onClick={() => {
                setConfirmDelete(false);
                removeExercise.mutate();
              }}
            >
              {removeExercise.isPending ? es.app.saving : es.app.delete}
            </Button>
          </div>
        </div>
      </Dialog>
    </form>
  );
}
