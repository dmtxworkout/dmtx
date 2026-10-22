import { z } from 'zod';

/**
 * Canonical enum values for the whole platform. Values are English/code
 * identifiers; Spanish display labels live in the admin i18n dictionary.
 *
 * Each enum is exported both as a `const` tuple (so `@dmtx/db` can build the
 * matching Postgres `pgEnum`) and as a Zod schema + inferred type.
 */

const enumOf = <const T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

// --- Content lifecycle -------------------------------------------------------
export const CONTENT_STATUS = ['draft', 'published', 'archived'] as const;
export const contentStatusSchema = enumOf(CONTENT_STATUS);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const DIFFICULTY = ['beginner', 'intermediate', 'advanced'] as const;
export const difficultySchema = enumOf(DIFFICULTY);
export type Difficulty = z.infer<typeof difficultySchema>;

// --- Exercises ---------------------------------------------------------------
export const MEASUREMENT_TYPE = ['reps', 'time', 'distance'] as const;
export const measurementTypeSchema = enumOf(MEASUREMENT_TYPE);
export type MeasurementType = z.infer<typeof measurementTypeSchema>;


// --- Workouts (rutinas) ------------------------------------------------------
export const WORKOUT_TYPE = ['structured', 'video'] as const;
export const workoutTypeSchema = enumOf(WORKOUT_TYPE);
export type WorkoutType = z.infer<typeof workoutTypeSchema>;

// A rutina is trackable content; a segment is a reusable warmup/cooldown piece
// (untracked, no nested warmup/cooldown, kept out of the main catalog).
export const WORKOUT_FORMAT = [
  'amrap',
  'emom',
  'tabata',
  'strength',
  'chipper',
  'for_time',
  'circuit',
] as const;
export const workoutFormatSchema = enumOf(WORKOUT_FORMAT);
export type WorkoutFormat = z.infer<typeof workoutFormatSchema>;

export const BLOCK_TYPE = ['single', 'superset', 'circuit', 'emom', 'tabata'] as const;
export const blockTypeSchema = enumOf(BLOCK_TYPE);
export type BlockType = z.infer<typeof blockTypeSchema>;

// An item is an exercise or a rest; a block is a group of items or a rest.
export const ITEM_KIND = ['exercise', 'rest'] as const;
export const itemKindSchema = enumOf(ITEM_KIND);
export type ItemKind = z.infer<typeof itemKindSchema>;

// A block is a group of items, a rest, or a PART: a format (AMRAP/EMOM/…) holding
// the blocks under it.
export const BLOCK_KIND = ['group', 'rest', 'part'] as const;
export const blockKindSchema = enumOf(BLOCK_KIND);
export type BlockKind = z.infer<typeof blockKindSchema>;

// Which part of the workout a block belongs to. Warmup/cooldown are optional
// and skippable in the app, and don't count toward results/progress.
export const BLOCK_SECTION = ['warmup', 'main', 'cooldown', 'goal'] as const;
export const blockSectionSchema = enumOf(BLOCK_SECTION);
export type BlockSection = z.infer<typeof blockSectionSchema>;

// --- Collections (Netflix-style rows) ---------------------------------------
export const COLLECTION_LAYOUT = ['row', 'grid', 'hero', 'featured'] as const;
export const collectionLayoutSchema = enumOf(COLLECTION_LAYOUT);
export type CollectionLayout = z.infer<typeof collectionLayoutSchema>;

// --- Media -------------------------------------------------------------------
export const MEDIA_KIND = ['video', 'image'] as const;
export const mediaKindSchema = enumOf(MEDIA_KIND);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const MEDIA_PROCESSING_STATUS = ['uploaded', 'processing', 'ready', 'failed'] as const;
export const mediaProcessingStatusSchema = enumOf(MEDIA_PROCESSING_STATUS);
export type MediaProcessingStatus = z.infer<typeof mediaProcessingStatusSchema>;

// --- Users & billing ---------------------------------------------------------
export const USER_ROLE = ['admin', 'user'] as const;
export const userRoleSchema = enumOf(USER_ROLE);
export type UserRole = z.infer<typeof userRoleSchema>;

export const SUBSCRIPTION_STATUS = [
  'active',
  'trialing',
  'past_due',
  'paused',
  'canceled',
  'expired',
] as const;
// Non-terminal statuses: a user may have at most one subscription in one of
// these at a time (the "live" episode). The rest are history.
export const LIVE_SUBSCRIPTION_STATUS = ['active', 'trialing', 'past_due', 'paused'] as const;
export const subscriptionStatusSchema = enumOf(SUBSCRIPTION_STATUS);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const PAYMENT_STATUS = [
  'pending',
  'succeeded',
  'failed',
  'requires_action',
  'refunded',
] as const;
export const paymentStatusSchema = enumOf(PAYMENT_STATUS);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const DISCOUNT_TYPE = ['percent', 'fixed'] as const;
export const discountTypeSchema = enumOf(DISCOUNT_TYPE);
export type DiscountType = z.infer<typeof discountTypeSchema>;

export const DISCOUNT_DURATION = ['once', 'repeating', 'forever'] as const;
export const discountDurationSchema = enumOf(DISCOUNT_DURATION);
export type DiscountDuration = z.infer<typeof discountDurationSchema>;

export const BILLING_INTERVAL_UNIT = ['day', 'week', 'month', 'year'] as const;
export const billingIntervalUnitSchema = enumOf(BILLING_INTERVAL_UNIT);
export type BillingIntervalUnit = z.infer<typeof billingIntervalUnitSchema>;

export const CURRENCY = ['usd', 'eur', 'mxn', 'gbp'] as const;
export const currencySchema = enumOf(CURRENCY);
export type Currency = z.infer<typeof currencySchema>;
