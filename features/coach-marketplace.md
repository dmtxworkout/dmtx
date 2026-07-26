# Coach marketplace (creator programs + commissions)

**Status:** idea — not scheduled
**Added:** 2026-07-26

## Summary

Let other coaches — not just DMTX admins — create and publish their own
programs/content on the platform, and earn a **commission** on it. Turns DMTX
from a first-party content library into a creator marketplace.

## Why

Scales content creation beyond the in-house team and gives coaches an incentive
to bring their audience and produce quality programs.

## Open questions

Today it's a single **all-access subscription** (one price, everything unlocked),
so there's no per-item purchase to attribute revenue from. The core question is
how to share subscription revenue with coaches — **discuss before building.**
Likely models:

- **Usage/engagement pro-rata** (Spotify-style): split a revenue pool by each
  coach's share of consumption — plays, completions, watch time, active users.
- **Fixed rev-share** per coach or per program.
- **Separate paid content** on top of the base subscription (à la carte).

## What it would touch

- **Creator attribution** — content (programs/workouts/skills) needs an
  owner/creator FK; today content has no creator. Add a coach/creator concept and
  an `owner_id` on content.
- **Roles** — a `coach` role (Better Auth already supports roles + access
  control) with a scoped creator portal that can only manage its own content.
- **Payouts** — likely **Stripe Connect** (coaches as connected accounts),
  separate from the self-managed subscriber billing in
  [../docs/billing.md](../docs/billing.md).
- **Approval / moderation** — a review workflow before coach content goes live.
- **Per-coach analytics** — consumption metrics that feed the commission model;
  the future `workout_logs` / progress tables ([../docs/data-model.md](../docs/data-model.md))
  would supply this.
- **Discovery** — coach profiles + attribution in the app.

## Prerequisites

Core content models + subscription billing solid first. When building the
workouts/programs models, keep creator attribution possible (don't hard-assume a
single first-party owner).
