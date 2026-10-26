import { z } from 'zod';
import {
  blockKindSchema,
  blockSectionSchema,
  blockTypeSchema,
  contentStatusSchema,
  difficultySchema,
  itemKindSchema,
  measurementTypeSchema,
  muscleRoleSchema,
  workoutFormatSchema,
} from '../enums';
import { formatConfigSchema } from '../format-config';
import { goalSchema } from '../goal';
import { loadPrescriptionSchema } from '../load';
import { tempoSchema } from '../tempo';
import { slugSchema, updateSchemaOf, uuidSchema } from '../common';

export const workoutItemInputSchema = z.object({
  kind: itemKindSchema.default('exercise'),
  // null for rest items; workSeconds holds the rest duration then
  exerciseId: uuidSchema.nullish(),
  // Per-item measurement; null falls back to the exercise's measurementType.
  measure: measurementTypeSchema.nullish(),
  sets: z.number().int().positive().nullish(),
  reps: z.number().int().positive().nullish(),
  workSeconds: z.number().int().positive().nullish(),
  distanceMeters: z.number().int().positive().nullish(),
  restBetweenSeconds: z.number().int().nonnegative().nullish(),
  tempoOverride: tempoSchema.nullish(),
  loadPrescription: loadPrescriptionSchema.nullish(),
  perSide: z.boolean().default(false),
  intervalIndex: z.number().int().nonnegative().nullish(),
  notes: z.string().max(2000).nullish(),
});
export type WorkoutItemInput = z.infer<typeof workoutItemInputSchema>;

const workoutBlockInputBase = z.object({
  kind: blockKindSchema.default('group'),
  section: blockSectionSchema.default('main'),
  type: blockTypeSchema.default('single'),
  rounds: z.number().int().positive().nullish(),
  label: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
  // A part (kind 'part') carries its own format + timing and holds `blocks`.
  format: workoutFormatSchema.nullish(),
  formatConfig: formatConfigSchema.nullish(),
  items: z.array(workoutItemInputSchema).default([]),
});
export type WorkoutBlockInput = z.infer<typeof workoutBlockInputBase> & { blocks: WorkoutBlockInput[] };
type WorkoutBlockInputIn = z.input<typeof workoutBlockInputBase> & { blocks?: WorkoutBlockInputIn[] };
export const workoutBlockInputSchema: z.ZodType<WorkoutBlockInput, WorkoutBlockInputIn> =
  workoutBlockInputBase.extend({
    blocks: z.lazy(() => z.array(workoutBlockInputSchema)).default([]),
  }) as unknown as z.ZodType<WorkoutBlockInput, WorkoutBlockInputIn>;

export const createWorkoutSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(5000).nullish(),
  format: workoutFormatSchema.nullish(),
  difficulty: difficultySchema,
  status: contentStatusSchema.default('draft'),
  thumbnailAssetId: uuidSchema.nullish(),
  // Each section is written (its blocks), a video, or both: the main
  // section's video, and the warm-up's and the stretch's. Durations come from
  // the media assets.
  videoAssetId: uuidSchema.nullish(),
  warmupVideoAssetId: uuidSchema.nullish(),
  cooldownVideoAssetId: uuidSchema.nullish(),
  scoringGoal: goalSchema.nullish(),
  // The rutina as the admin wrote it (comments and spacing included); the
  // editor reopens this text instead of regenerating it from the blocks.
  sourceText: z.string().max(50000).nullish(),
  // Variants ("RX" / "Escalada" / "Principiante"): a variant is a full rutina
  // row linked to its base. Lists hide variants; the base's detail lists them.
  variantOfId: uuidSchema.nullish(),
  variantLabel: z.string().max(60).nullish(),
  // Muscles the admin adds by hand, on top of those worked out from the
  // exercises (a rutina that is only a video has no exercises to read).
  extraMuscleIds: z.array(uuidSchema).optional(),
  blocks: z.array(workoutBlockInputSchema).default([]),
});
export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;

export const updateWorkoutSchema = updateSchemaOf(createWorkoutSchema);
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;

// --- Responses ---------------------------------------------------------------
export const workoutItemSchema = workoutItemInputSchema.extend({ id: uuidSchema });
const workoutBlockBase = z.object({
  id: uuidSchema,
  kind: blockKindSchema,
  section: blockSectionSchema,
  type: blockTypeSchema,
  rounds: z.number().nullable(),
  label: z.string().nullable(),
  notes: z.string().nullable(),
  format: workoutFormatSchema.nullable(),
  formatConfig: formatConfigSchema.nullable(),
  items: z.array(workoutItemSchema),
});
export type WorkoutBlock = z.infer<typeof workoutBlockBase> & { blocks: WorkoutBlock[] };
export const workoutBlockSchema: z.ZodType<WorkoutBlock> = workoutBlockBase.extend({
  blocks: z.lazy(() => z.array(workoutBlockSchema)),
}) as unknown as z.ZodType<WorkoutBlock>;

export const workoutSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Derived on save from the main section: it has a video class / it has a written (guided) rutina. Both can be true. */
  hasVideo: z.boolean(),
  isGuided: z.boolean(),
  format: workoutFormatSchema.nullable(),
  difficulty: difficultySchema,
  estimatedDurationSeconds: z.number().nullable(),
  status: contentStatusSchema,
  thumbnailAssetId: uuidSchema.nullable(),
  videoAssetId: uuidSchema.nullable(),
  warmupVideoAssetId: uuidSchema.nullable(),
  cooldownVideoAssetId: uuidSchema.nullable(),
  scoringGoal: goalSchema.nullable(),
  sourceText: z.string().nullable(),
  variantOfId: uuidSchema.nullable(),
  variantLabel: z.string().nullable(),
  /** What it works: from the main section's exercises (primary when most use it), plus the ones added by hand. */
  muscles: z.array(z.object({ muscleId: uuidSchema, role: muscleRoleSchema, manual: z.boolean() })),
  /** Works at least four zones as primary. */
  fullBody: z.boolean(),
  /** For a base rutina: its variants in creation order. Empty for a variant. */
  variants: z.array(z.object({ id: uuidSchema, label: z.string() })),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  blocks: z.array(workoutBlockSchema),
});
export type Workout = z.infer<typeof workoutSchema>;

export const workoutListItemSchema = workoutSchema.omit({
  blocks: true,
  scoringGoal: true,
  sourceText: true,
  variants: true,
  muscles: true,
});
export type WorkoutListItem = z.infer<typeof workoutListItemSchema>;
