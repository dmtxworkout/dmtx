'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { CONTENT_STATUS, contentStatusSchema, DIFFICULTY, difficultySchema } from '@dmtx/schemas';
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

const formSchema = z.object({
  name: z.string().min(1, es.app.nameRequired),
  description: z.string(),
  difficulty: difficultySchema,
  isUnilateral: z.boolean(),
  status: contentStatusSchema,
});
type FormValues = z.infer<typeof formSchema>;

const emptyValues: FormValues = {
  name: '',
  description: '',
  difficulty: 'beginner',
  isUnilateral: false,
  status: 'draft',
};

function toDefaults(exercise: Exercise): FormValues {
  return {
    name: exercise.name,
    description: exercise.description ?? '',
    difficulty: exercise.difficulty,
    isUnilateral: exercise.isUnilateral,
    status: exercise.status,
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
  const write = (k: number, value: string) => {
    if (k === values.length) {
      if (value === '') return;
      onChange([...values, value]);
      return;
    }
    onChange(values.map((v, j) => (j === k ? value : v)));
  };
  return (
    <div className="flex flex-col gap-2">
      {rows.map((v, k) => {
        const last = k === rows.length - 1;
        return (
          <div key={k} className="flex items-center gap-1.5">
            <Input
              value={v}
              onChange={(e) => write(k, e.target.value)}
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
  const [cues, setCues] = useState<string[]>(exercise?.cues ?? []);
  const [aliases, setAliases] = useState<string[]>(exercise?.aliases ?? []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: exercise ? toDefaults(exercise) : { ...emptyValues, name: initialName ?? '' },
  });

  const leave = () => (onCancel ? onCancel() : router.push('/ejercicios'));

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const base = {
        name: values.name,
        description: values.description || null,
        cues: cues.map((c) => c.trim()).filter((v) => v.length > 0),
        aliases: aliases.map((a) => a.trim()).filter((v) => v.length > 0),
        difficulty: values.difficulty,
        isUnilateral: values.isUnilateral,
        status: values.status,
        thumbnailAssetId,
        demoVideoAssetId,
      };
      if (exercise) return api.exercises.update(exercise.id, base);
      const payload: CreateExerciseInput = { ...base, muscles: [], equipmentIds: [] };
      return api.exercises.create(payload);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['exercises'] });
      if (onSaved) onSaved(saved);
      else router.push('/ejercicios');
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });

  const removeExercise = useMutation({
    mutationFn: () => api.exercises.remove(exercise!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises'] });
      router.push('/ejercicios');
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    save.mutate(values);
  });

  const actions = (
    <div className="flex gap-2">
      {exercise && !embedded && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => confirm(es.app.confirmDelete) && removeExercise.mutate()}
        >
          {es.app.delete}
        </Button>
      )}
      <Button type="button" variant="outline" onClick={leave}>
        {es.app.cancel}
      </Button>
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? es.app.saving : exercise ? es.app.save : 'Crear'}
      </Button>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!embedded && (
        <div className="flex items-center justify-between gap-4 border-b border-line bg-surface px-8 py-4">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">
            {exercise ? es.exercises.edit : es.exercises.new}
          </h1>
          {actions}
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="difficulty">{es.exercises.fields.difficulty}</Label>
                    <Select id="difficulty" {...form.register('difficulty')}>
                      {DIFFICULTY.map((d) => (
                        <option key={d} value={d}>
                          {es.difficulty[d]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="status">{es.exercises.fields.status}</Label>
                    <Select id="status" {...form.register('status')}>
                      {CONTENT_STATUS.map((s) => (
                        <option key={s} value={s}>
                          {es.status[s]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 text-sm text-ink-2">
                      <input type="checkbox" className="h-4 w-4" {...form.register('isUnilateral')} />
                      {es.exercises.fields.isUnilateral}
                    </label>
                  </div>
                </div>
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

          {/* Right: media */}
          <div>
            <Card className={cn(!embedded && 'lg:sticky lg:top-6')}>
              <CardHeader>
                <CardTitle>{es.exercises.fields.media}</CardTitle>
              </CardHeader>
              <CardContent className={cn('flex flex-col gap-6 py-5', embedded && 'sm:grid sm:grid-cols-2')}>
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
          </div>
        </div>
      </div>

      {embedded && (
        <div className="flex justify-end border-t border-line-3 bg-surface px-5 py-3">{actions}</div>
      )}
    </form>
  );
}
