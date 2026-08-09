# Billing (self-managed)

Stripe is only the **payment rail** (Customers, saved cards, PaymentIntents). Our DB owns the pricing and schedule so admins can set **custom per-user prices**, discounts/comps, and report on everything with SQL. **Not yet implemented** — this is the design + the tables that already exist.

## Tables (in `packages/db/src/schema/billing.ts`)

- **`subscriptions`** — one row per subscription **episode** (a continuous relationship): trial → converts to paid in place → recurring charges advance it. A user accumulates episodes over time (resubscribe, comp); **at most one is "live"** (`status IN active|trialing|past_due|paused`), enforced by a partial unique index `subscriptions_one_live_per_user` on `user_id`. Terminal rows (`canceled`, `expired`) are kept as history. Fields: `unit_amount` / `currency` / `interval_unit` + `interval_count` (the custom price), `discount_id` / inline `discount_*`, `status` (active|trialing|past_due|paused|canceled|expired), `current_period_start/end`, `ended_at`, `trial_end`, **`next_charge_date`** (what the cron scans), `default_payment_method_id`, `failed_attempts`, `stripe_customer_id`.
- **`discounts`** — reusable coupons (percent|fixed, duration, validity, max redemptions).
- **`payments`** — ledger, one row per charge attempt: `amount`, `status` (pending|succeeded|failed|requires_action|refunded), `stripe_payment_intent_id`, `period_start/end`, `attempt`, `idempotency_key` (unique per `subscription+period`), failure info. **Basis for all revenue reporting.**
- **`webhook_events`** — processed Stripe `event.id` for idempotent handling.

## The charge loop (to build)

1. **Signup (web):** create a Stripe Customer, save the card via a **SetupIntent** (`usage: 'off_session'`, with mandate text), store `default_payment_method_id`.
2. **Daily cron** — a Cloudflare **Cron Trigger** on the API Worker (`scheduled()` handler) selects `subscriptions WHERE status IN ('active','past_due') AND next_charge_date <= today` and **enqueues each to a Cloudflare Queue** (don't charge inline — Worker CPU + Stripe rate limits). Queue consumers charge in parallel with backoff.
3. **Charge** = Stripe **PaymentIntent** `off_session: true, confirm: true`, amount = price − discount, **idempotency key `{subscription_id}:{period_start}`**. Check no succeeded/pending `payments` row exists for the period first.
4. **Success** → append `payments` (succeeded), advance `current_period_*` + `next_charge_date`, reset `failed_attempts`.
5. **Decline** → append `payments` (failed), `failed_attempts++`, set `past_due`, schedule dunning retries (+1/+3/+5 days), Resend email; after N → `canceled` + revoke access.
6. **`requires_action` (SCA/3DS)** → email the user a confirmation link; resolve via webhook.
7. **Webhooks** (`payment_intent.*`, `charge.refunded`, `charge.dispute.created`, `payment_method.*`) reconcile final state — standard Workers rules (async `constructEventAsync`, raw body once, public route, `event.id` idempotency).

## Reporting (all local SQL — never live Stripe API)

- Next billing date → `subscriptions.next_charge_date`.
- Revenue in a period → `SUM(amount) FROM payments WHERE status='succeeded' AND charged_at BETWEEN …`.
- Revenue by segment → join `payments → user/profile`, group by cohort/plan/discount/geo.
- MRR / churn / ARPU → derived from `subscriptions` + `payments`.
- Scale path: indexed queries → nightly rollup tables → Neon read replica / warehouse only if needed.

## Responsibilities we own (cost of control)

Idempotency / double-charge prevention, dunning schedule, off-session SCA handling, refunds + proration on mid-cycle price changes, and reconciliation.

## App-store note

Stripe web subscriptions only. Charging for digital subscriptions **inside** the iOS/Android app requires Apple/Google IAP — plan the mobile monetization around web signup (or add RevenueCat) before shipping the app.
