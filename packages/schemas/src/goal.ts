import { z } from 'zod';

/**
 * Generic GOAL value object — used by workout scoring, per-item targets, and
 * skill-level unlock criteria. One shape → one reusable `meetsGoal()` evaluator
 * (see @dmtx/core).
 */
export const GOAL_METRIC = [
  'reps',
  'time_seconds',
  'distance_meters',
  'rounds',
  'load_kg',
  'hold_seconds',
] as const;
export const goalMetricSchema = z.enum(GOAL_METRIC);
export type GoalMetric = z.infer<typeof goalMetricSchema>;

export const GOAL_COMPARATOR = ['gte', 'lte', 'eq', 'gt', 'lt'] as const;
export const goalComparatorSchema = z.enum(GOAL_COMPARATOR);
export type GoalComparator = z.infer<typeof goalComparatorSchema>;

export const simpleGoalSchema = z.object({
  metric: goalMetricSchema,
  comparator: goalComparatorSchema,
  value: z.number(),
  unit: z.string().optional(),
});
export type SimpleGoal = z.infer<typeof simpleGoalSchema>;

/** Compound criteria, e.g. "reps >= 5 AND hold >= 30s". */
export const compoundGoalSchema = z.object({
  op: z.enum(['and', 'or']),
  goals: z.array(simpleGoalSchema).min(1),
});
export type CompoundGoal = z.infer<typeof compoundGoalSchema>;

export const goalSchema = z.union([simpleGoalSchema, compoundGoalSchema]);
export type Goal = z.infer<typeof goalSchema>;
