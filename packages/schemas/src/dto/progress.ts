import { z } from 'zod';
import { measurementTypeSchema, trainingModeSchema, workoutFormatSchema } from '../enums';

/** One logged mark within a session (per exercise instance/round/set). */
export const setResultInputSchema = z.object({
  exerciseId: z.uuid(),
  exerciseName: z.string(),
  position: z.number().int().nonnegative().default(0),
  round: z.number().int().positive().nullish(),
  setNumber: z.number().int().positive().nullish(),
  measure: measurementTypeSchema.nullish(),
  reps: z.number().int().nonnegative().nullish(),
  seconds: z.number().int().nonnegative().nullish(),
  distanceMeters: z.number().int().nonnegative().nullish(),
  loadKg: z.number().nonnegative().nullish(),
});
export type SetResultInput = z.infer<typeof setResultInputSchema>;

/** A member opened a piece of content, or started training; searches are recorded by the API. */
export const trackActivitySchema = z.object({
  kind: z.enum(['view_workout', 'view_program', 'view_skill', 'start_workout']),
  contentId: z.uuid(),
});
export type TrackActivityInput = z.infer<typeof trackActivitySchema>;

/** Payload the mobile player sends after a workout. */
export const createWorkoutLogSchema = z.object({
  workoutId: z.uuid(),
  workoutName: z.string(),
  format: workoutFormatSchema.nullish(),
  /** Followed the video class or guided exercise by exercise. */
  mode: trainingModeSchema.nullish(),
  startedAt: z.iso.datetime().nullish(),
  completedAt: z.iso.datetime().nullish(),
  durationSeconds: z.number().int().nonnegative().nullish(),
  roundsCompleted: z.number().int().nonnegative().nullish(),
  totalVolume: z.number().nonnegative().nullish(),
  notes: z.string().nullish(),
  results: z.array(setResultInputSchema),
});
export type CreateWorkoutLogInput = z.infer<typeof createWorkoutLogSchema>;
