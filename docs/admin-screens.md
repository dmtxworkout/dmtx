# Admin screens

The portal is a left **sidebar** + content area (`apps/admin/src/app/(app)/layout.tsx`). Nav lives in `apps/admin/src/components/sidebar.tsx`. Every screen is Spanish (copy from `src/i18n/es.ts`). Data goes through `@dmtx/api-client` + TanStack Query; forms use react-hook-form + Zod.

## Built

- **Login** (`/login`) — email/password via `@dmtx/auth/client`.
- **Ejercicios** (`/ejercicios`) — TanStack Table list (search, status badge), create (`/nuevo`) and edit (`/[id]`) via a shared `ExerciseForm` (name, description, cues array, difficulty/measurement/status selects, unilateral, **tempo** 4-field group). This is the **reference implementation** — copy its shape for the other entities.

## To build (roadmap order)

Each follows the same pattern: list (TanStack Table) + create/edit (RHF + Zod against `@dmtx/schemas`) + a resource on the API + a method on `@dmtx/api-client`.

- **Taxonomía** (`/taxonomia`) — muscle groups, muscles, equipment (needed to wire muscle/equipment pickers into the exercise form — currently omitted there).
- **Rutinas** (`/rutinas`) — the big one. Type toggle (structured/video). For structured: a **format picker** (AMRAP/EMOM/Tabata/Strength/Chipper/…) with a per-format config form (driven by `formatConfigSchema`), plus a **block/item builder** (drag-drop ordering, per-item exercise picker, sets/reps/work-time, rest, tempo override, load, goal). For video: a single media picker.
- **Programas** (`/programas`) — schedule builder (days → workouts) or a video playlist, by `type`.
- **Habilidades** (`/habilidades`) — skill with ordered levels; each level → a workout + an `unlock_goal` editor (reuse the goal value-object form).
- **Colecciones** (`/colecciones`) — Netflix rows; add mixed items (workout/program/skill) with ordering.
- **Biblioteca** (`/biblioteca`) — R2 media library; upload via `api.media.upload(file, kind)` (presign → direct PUT).
- **Suscripciones** (`/suscripciones`) — see [billing.md](billing.md): set custom price/discount, comp, adjust next charge date, manual charge/retry, payment history, pause/cancel.
- **Reportes** (`/reportes`) — revenue over a period, by segment, MRR/churn (SQL over `subscriptions` + `payments`).
- **Panel** (`/`) — dashboard summary (currently redirects to `/ejercicios`).

## UI kit

Hand-written shadcn-style primitives in `apps/admin/src/components/ui/` (Button, Input, Textarea, Select, Label, Card, Badge, Table). Extend these rather than pulling the shadcn CLI. Tailwind 4 (default palette; zinc-based neutral chrome).
