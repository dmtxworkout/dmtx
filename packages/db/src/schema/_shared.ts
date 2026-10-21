import { pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import {
  BILLING_INTERVAL_UNIT,
  BLOCK_KIND,
  BLOCK_SECTION,
  BLOCK_TYPE,
  COLLECTION_LAYOUT,
  ITEM_KIND,
  CONTENT_STATUS,
  DIFFICULTY,
  DISCOUNT_DURATION,
  DISCOUNT_TYPE,
  MEASUREMENT_TYPE,
  MEDIA_KIND,
  MEDIA_PROCESSING_STATUS,
  MUSCLE_ROLE,
  PAYMENT_STATUS,
  PROGRAM_TYPE,
  SUBSCRIPTION_STATUS,
  WORKOUT_FORMAT,
  WORKOUT_TYPE,
} from '@dmtx/schemas';

// --- Postgres enums (values sourced from @dmtx/schemas, the single truth) ----
export const contentStatusEnum = pgEnum('content_status', CONTENT_STATUS);
export const difficultyEnum = pgEnum('difficulty', DIFFICULTY);
export const measurementTypeEnum = pgEnum('measurement_type', MEASUREMENT_TYPE);
export const muscleRoleEnum = pgEnum('muscle_role', MUSCLE_ROLE);
export const workoutTypeEnum = pgEnum('workout_type', WORKOUT_TYPE);
export const workoutFormatEnum = pgEnum('workout_format', WORKOUT_FORMAT);
export const blockTypeEnum = pgEnum('block_type', BLOCK_TYPE);
export const blockKindEnum = pgEnum('block_kind', BLOCK_KIND);
export const blockSectionEnum = pgEnum('block_section', BLOCK_SECTION);
export const itemKindEnum = pgEnum('item_kind', ITEM_KIND);
export const programTypeEnum = pgEnum('program_type', PROGRAM_TYPE);
export const collectionLayoutEnum = pgEnum('collection_layout', COLLECTION_LAYOUT);
export const mediaKindEnum = pgEnum('media_kind', MEDIA_KIND);
export const mediaProcessingStatusEnum = pgEnum('media_processing_status', MEDIA_PROCESSING_STATUS);
export const subscriptionStatusEnum = pgEnum('subscription_status', SUBSCRIPTION_STATUS);
export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUS);
export const discountTypeEnum = pgEnum('discount_type', DISCOUNT_TYPE);
export const discountDurationEnum = pgEnum('discount_duration', DISCOUNT_DURATION);
export const billingIntervalUnitEnum = pgEnum('billing_interval_unit', BILLING_INTERVAL_UNIT);

// --- Reusable column helpers -------------------------------------------------

/** UUIDv7 primary key (time-ordered; generated app-side, DB-agnostic). */
export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

export const publishable = {
  publishedAt: timestamp('published_at', { withTimezone: true }),
};
