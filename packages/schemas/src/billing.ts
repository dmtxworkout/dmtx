import { z } from 'zod';

/**
 * Billing interval for a self-managed subscription. Supports custom cadences
 * (e.g. every 30 days) in addition to month/year.
 */
export const billingIntervalSchema = z.object({
  unit: z.enum(['day', 'week', 'month', 'year']),
  count: z.number().int().positive(),
});
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

/** A discount applied to a subscription (inline or from a reusable coupon). */
export const discountSchema = z.object({
  type: z.enum(['percent', 'fixed']),
  /** percent: 0-100; fixed: minor units (cents) subtracted per charge */
  value: z.number().nonnegative(),
  duration: z.enum(['once', 'repeating', 'forever']).default('forever'),
});
export type Discount = z.infer<typeof discountSchema>;
