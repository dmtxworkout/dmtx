# Data model

PostgreSQL via Drizzle. Schema lives in `packages/db/src/schema/` (one file per area), enums sourced from `@dmtx/schemas`. Migrations in `packages/db/drizzle/`. 31 tables.

## Conventions (every content table)

- **UUIDv7** primary keys (`primaryId()` helper — time-ordered, app-generated).
- `created_at` / `updated_at` (`timestamptz`, auto-`$onUpdate`); `deleted_at` for **soft delete**.
- Editorial `status` enum `draft | published | archived` + `published_at` (not a bare boolean).
- Stable, unique `slug` (freeze after publish).
- `position: integer` for ordering (upgrade path: fractional/LexoRank keys if reorders get heavy).
- Column names are **snake_case** (Drizzle `casing: 'snake_case'`); enums store **English** identifiers, Spanish display lives in the admin dictionary.

## Content building blocks

- **`exercises`** (the atom): name, description, `cues` (jsonb string[]), `difficulty`, `measurement_type` (reps|time|distance), `default_tempo` (jsonb — the 4 phases), `demo_video_asset_id`, `thumbnail_asset_id`, `archived_at` (archived exercises leave the suggestions and the default list; rutinas using them keep working). Joins: `exercise_muscles` (m2m + `role` primary|secondary), `exercise_equipment` (m2m).
- **`workouts`** (rutina): polymorphic via `type` (`structured`|`video`). Structured has `format` (derived: the main section's first part's format, for lists/filters) + `scoring_goal` (jsonb); timing lives on the parts. `source_text` holds the rutina exactly as the admin wrote it in the text editor (comments, spacing); the blocks are derived from it on save and the editor reopens the text, not the blocks. `estimated_duration_seconds` is **derived on save** (`estimateDurationSeconds` in `@dmtx/core`: timers for AMRAP/EMOM/Tabata, a pace heuristic capped by time caps otherwise; the video's duration for video rutinas) — never typed by the admin. Video has `video_asset_id`. Structure: `workout_blocks` (type single|superset|circuit|emom|tabata, rounds, rest) → `workout_items` (exercise prescription: sets/reps/`work_seconds`/rest, `tempo_override`, `load_prescription`, `interval_index` for EMOM/Tabata, `per_side`, `goal`).
  - **Parts:** a block of kind `part` carries its own `format` + `format_config` and holds child blocks (`parent_block_id` → the part). A section is a sequence of parts and loose blocks, so "AMRAP 12 min … then 40 burpees … then EMOM 10" is one rutina. The workout-level `format` is the main section's first part's, for lists only.
  - **Principle:** a part's `format_config` = its global timing; blocks/items = the prescription. One structure expresses all formats.
  - **Variants:** a rutina may have variants (RX / Escalada / …) — full `workouts` rows with `variant_of_id` → base and a `variant_label`. Lists and the consumer catalog hide variants; the base's detail returns `variants: [{id, label}]` and the app offers them as a level before starting.
- **`programs`**: polymorphic via `type` (`structured`|`video_playlist`). Structured: `program_days` (absolute `position` + optional week/day) → `program_items` (→ workout). Playlist: `program_video_items`. Tags via `program_goal_tags` → `goal_tags`; `program_muscles` (m2m).
- **`skills`** → `skill_levels` (ordered; each → a workout + `unlock_goal` to unlock the next level). `skill_muscles` (m2m).

## Shared JSONB value objects (typed by `@dmtx/schemas`)

- **`tempoSchema`** — `{ holdTop, eccentric, holdBottom, concentric }`, each `number | 'X'`.
- **`goalSchema`** — `{ metric, comparator, value, unit? }` (+ `compoundGoalSchema` for AND/OR). Used by `scoring_goal`, item `goal`, and `unlock_goal`. One reusable `meetsGoal()` (in `@dmtx/core`, later).
- **`loadPrescriptionSchema`** — discriminated on `type` (percent_1rm | rpe | absolute | bodyweight).
- **`formatConfigSchema`** — discriminated union on `format`; carries `configVersion` for engine migration.

> **JSONB has no DB-level shape enforcement.** Always validate on write at the API boundary. Add CHECK/trigger for the `type`/`format` discriminant consistency when you build the workouts API.

## Supporting

- **`media_assets`** — single source of truth for every R2 object (`r2_key`, `kind`, `processing_status`, `variants` jsonb, dims). Content references it by FK.
- **`muscle_groups` → `muscles`** (two levels; a group has a `body_region`), **`equipment`**. Managed in **Músculos y equipo**; an exercise tags its muscles (one `primary`, the rest `secondary`) and equipment. A rutina's tags are **derived**, never stored: the groups of its exercises' primary muscles and the union of their equipment (`/app/workouts/:id` → `muscleGroups`/`equipment`; `/app/browse` filters by slug). Deleting a tag is refused while an exercise uses it.
- **`collections`** (Netflix rows) → **`collection_items`** — polymorphic via **exactly-one-nullable-FK + CHECK** (`workout_id`/`program_id`/`skill_id`), preserving real FK integrity.

## Users & billing

- Better Auth owns `user` / `session` / `account` / `verification` (`packages/db/src/schema/auth.ts`; `user.role` for the admin gate).
- **`profiles`** (1:1), **`subscriptions`** (our own billing record), **`discounts`**, **`payments`** (ledger), **`webhook_events`**. See [billing.md](billing.md).

## Cascade rules

Cascade **down** ownership (workout→blocks→items, program→days→items, skill→levels, collection→items). **Never** cascade across content references (program_item→workout, skill_level→workout use `restrict`; collection_item uses `cascade` from the collection only). Media FKs are `set null`.

## Future (stubbed, not built)

`workout_logs`, `set_results`, `program_progress`, `skill_progress` — will compare against the `goalSchema` fields already in place. No schema rework needed.
