'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { CONTENT_STATUS, contentStatusSchema, DIFFICULTY, difficultySchema } from '@dmtx/schemas';
import type { CreateExerciseInput, Exercise } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
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
  cues: z.array(z.object({ value: z.string() })),
  aliases: z.array(z.object({ value: z.string() })),
  difficulty: difficultySchema,
  isUnilateral: z.boolean(),
  status: contentStatusSchema,
});
type FormValues = z.infer<typeof formSchema>;

const emptyValues: FormValues = {
  name: '',
  description: '',
  cues: [],
  aliases: [],
  difficulty: 'beginner',
  isUnilateral: false,
  status: 'draft',
};

function toDefaults(exercise: Exercise): FormValues {
  return {
    name: exercise.name,
    description: exercise.description ?? '',
    cues: exercise.cues.map((value) => ({ value })),
    aliases: exercise.aliases.map((value) => ({ value })),
    difficulty: exercise.difficulty,
    isUnilateral: exercise.isUnilateral,
    status: exercise.status,
  };
}

export function ExerciseForm({ exercise }: { exercise?: Exercise }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(
    exercise?.thumbnailAssetId ?? null,
  );
  const [demoVideoAssetId, setDemoVideoAssetId] = useState<string | null>(
    exercise?.demoVideoAssetId ?? null,
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: exercise ? toDefaults(exercise) : emptyValues,
  });
  const cues = useFieldArray({ control: form.control, name: 'cues' });
  const aliases = useFieldArray({ control: form.control, name: 'aliases' });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const base = {
        name: values.name,
        description: values.description || null,
        cues: values.cues.map((c) => c.value).filter((v) => v.trim().length > 0),
        aliases: values.aliases.map((a) => a.value.trim()).filter((v) => v.length > 0),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises'] });
      router.push('/ejercicios');
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

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-line bg-surface px-8 py-4">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">
          {exercise ? es.exercises.edit : es.exercises.new}
        </h1>
        <div className="flex gap-2">
          {exercise && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => confirm(es.app.confirmDelete) && removeExercise.mutate()}
            >
              {es.app.delete}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => router.push('/ejercicios')}>
            {es.app.cancel}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? es.app.saving : es.app.save}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {serverError && (
          <p className="mx-8 mt-5 rounded-md bg-red-50 px-3 py-2 text-sm text-accent-dark">
            {serverError}
          </p>
        )}

        <div className="grid gap-5 px-8 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Left: details, cues */}
          <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardContent className="space-y-4 py-5">
                <div>
                  <Label htmlFor="name">{es.exercises.fields.name}</Label>
                  <Input id="name" {...form.register('name')} />
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
              <CardContent className="space-y-2 py-4">
                {cues.fields.map((field, i) => (
                  <div key={field.id} className="flex gap-2">
                    <Input {...form.register(`cues.${i}.value` as const)} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => cues.remove(i)}>
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => cues.append({ value: '' })}
                >
                  {es.exercises.fields.addCue}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{es.exercises.fields.aliases}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 py-4">
                <p className="text-xs text-zinc-500">{es.exercises.fields.aliasesHelp}</p>
                {aliases.fields.map((field, i) => (
                  <div key={field.id} className="flex gap-2">
                    <Input {...form.register(`aliases.${i}.value` as const)} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => aliases.remove(i)}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => aliases.append({ value: '' })}
                >
                  {es.exercises.fields.addAlias}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: media */}
          <div>
            <Card className="lg:sticky lg:top-6">
              <CardHeader>
                <CardTitle>{es.exercises.fields.media}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6 py-5">
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
    </form>
  );
}
