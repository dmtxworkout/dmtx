# Future ideas (not scheduled)

Parking lot for features we want eventually but are **not** building now. Each is
a sketch to preserve intent + the questions to resolve when we pick it up.

## Coach marketplace (creator programs + commissions)

**Idea:** let other coaches — not just DMTX admins — create and publish their own
programs/content on the platform, and earn a **commission** on it.

**The open question:** today it's a single **all-access subscription** (one price,
everything unlocked), so there's no per-item purchase to attribute revenue from.
We need a model for sharing subscription revenue with coaches — **to be discussed
when we get there.** Likely options:

- **Usage/engagement pro-rata** (Spotify-style): split a revenue pool by each
  coach's share of consumption — plays, completions, watch time, active users.
- **Fixed rev-share** per coach or per program.
- **Separate paid content** on top of the base subscription (à la carte).

**What it would touch (so we keep it possible):**

- **Creator attribution** — content (programs/workouts/skills) would need an
  owner/creator FK; today content has no creator. Add a coach/creator concept and
  an `owner_id` on content.
- **Roles** — a `coach` role (Better Auth already supports roles + access control)
  with a scoped creator portal that can only manage its own content.
- **Payouts** — likely **Stripe Connect** (coaches as connected accounts),
  separate from the self-managed subscriber billing in [billing.md](billing.md).
- **Approval / moderation** — a review workflow before coach content goes live.
- **Per-coach analytics** — consumption metrics that feed the commission model;
  the future `workout_logs` / progress tables ([data-model.md](data-model.md))
  would supply this.
- **Discovery** — coach profiles + attribution in the app.

**Status:** idea only. Revisit after the core content + subscription billing are
solid. Discuss the commission model before building.
