import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  activityLevelEnum,
  billingIntervalUnitEnum,
  bodyFigureEnum,
  discountDurationEnum,
  discountTypeEnum,
  genderEnum,
  paymentStatusEnum,
  primaryId,
  subscriptionStatusEnum,
  timestamps,
} from './_shared';
import { mediaAssets } from './media';
import { user } from './auth';

/** App-owned profile (1:1 with the Better Auth user). */
export const profiles = pgTable('profiles', {
  id: primaryId(),
  userId: text()
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  displayName: text(),
  avatarAssetId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
  locale: text().notNull().default('es'),
  dateOfBirth: date(),
  gender: genderEnum(),
  heightCm: integer(),
  weightKg: real(),
  activityLevel: activityLevelEnum(),
  bodyFigure: bodyFigureEnum(),
  stripeCustomerId: text().unique(),
  onboardingCompletedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

/** Reusable coupon that can be applied to a subscription or a segment. */
export const discounts = pgTable('discounts', {
  id: primaryId(),
  code: text().notNull().unique(),
  type: discountTypeEnum().notNull(),
  // percent: 0-100; fixed: minor units (cents)
  value: integer().notNull(),
  duration: discountDurationEnum().notNull().default('forever'),
  validUntil: timestamp({ withTimezone: true }),
  maxRedemptions: integer(),
  redemptions: integer().notNull().default(0),
  ...timestamps,
});

/**
 * Our own billing record (self-managed billing; Stripe is only the payment
 * rail). The daily cron scans `nextChargeDate`.
 *
 * A row is one subscription "episode". A user accumulates episodes over time
 * (trial → paid → resubscribe/comp…); only one may be "live" (non-terminal) at
 * a time — enforced by the partial unique index below. Terminal rows are kept
 * as history. Per-charge history lives in `payments`.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
  id: primaryId(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  stripeCustomerId: text().notNull(),
  defaultPaymentMethodId: text(),
  // custom per-user price
  unitAmount: integer().notNull(), // minor units (cents)
  currency: text().notNull().default('usd'),
  intervalUnit: billingIntervalUnitEnum().notNull().default('month'),
  intervalCount: integer().notNull().default(1),
  // inline discount snapshot (or reference a reusable coupon)
  discountId: uuid().references(() => discounts.id, { onDelete: 'set null' }),
  discountType: discountTypeEnum(),
  discountValue: integer(),
  status: subscriptionStatusEnum().notNull().default('active'),
  currentPeriodStart: timestamp({ withTimezone: true }),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  nextChargeDate: date(),
  failedAttempts: integer().notNull().default(0),
  cancelAtPeriodEnd: boolean().notNull().default(false),
  canceledAt: timestamp({ withTimezone: true }),
  // When the episode became terminal (canceled or expired).
  endedAt: timestamp({ withTimezone: true }),
  startedAt: timestamp({ withTimezone: true }),
  trialEnd: timestamp({ withTimezone: true }),
  ...timestamps,
  },
  (t) => [
    index('subscriptions_user_idx').on(t.userId),
    // At most one live (non-terminal) subscription per user; history rows are
    // free to accumulate.
    uniqueIndex('subscriptions_one_live_per_user')
      .on(t.userId)
      .where(sql`${t.status} in ('active', 'trialing', 'past_due', 'paused')`),
  ],
);

/** Ledger: one row per charge attempt. Basis for all revenue reporting. */
export const payments = pgTable('payments', {
  id: primaryId(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  subscriptionId: uuid().references(() => subscriptions.id, { onDelete: 'set null' }),
  stripePaymentIntentId: text(),
  amount: integer().notNull(), // minor units, after discount
  currency: text().notNull().default('usd'),
  status: paymentStatusEnum().notNull().default('pending'),
  discountAmount: integer().notNull().default(0),
  periodStart: timestamp({ withTimezone: true }),
  periodEnd: timestamp({ withTimezone: true }),
  attempt: integer().notNull().default(1),
  // unique per subscription+period: `${subscriptionId}:${periodStart}`
  idempotencyKey: text().notNull().unique(),
  failureCode: text(),
  failureReason: text(),
  chargedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

/** Processed Stripe webhook events, for idempotent handling. */
export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(), // Stripe event.id
  type: text(),
  processedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
