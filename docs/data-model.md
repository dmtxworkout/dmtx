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

- **`exercises`** (the atom): name, description, `cues` (jsonb string[]), `difficulty`, `measurement_type` (reps|time|distance), `default_tempo` (jsonb — the 4 phases), `demo_video_asset_id`, `thumbnail_asset_id`, `archived_at` (archived exercises leave the suggestions and the default list; rutinas using them keep working). Joins: `exercise_muscles` (m2m), `exercise_equipment` (m2m).
- **`workouts`** (rutina): three sections — warm-up, main, stretch (`cooldown`) — each **text** (blocks with that `section`) or a **video** (`warmup_video_asset_id`, `video_asset_id`, `cooldown_video_asset_id`; a section with a video keeps no blocks). `type` (`structured`|`video`) says what the main section is, derived on save, for lists/filters. `format` is derived too (the main section's first part's) + `scoring_goal` (jsonb); timing lives on the parts. Video lengths are read from `media_assets`, never stored here. `source_text` holds the rutina exactly as the admin wrote it in the text editor (comments, spacing); the blocks are derived from it on save and the editor reopens the text, not the blocks. `estimated_duration_seconds` is **derived on save** (`sectionValues` in the API: `estimateDurationSeconds` from `@dmtx/core` for the text sections — timers for AMRAP/EMOM/Tabata, a pace heuristic capped by time caps otherwise — plus the videos' lengths) — never typed by the admin. Structure: `workout_blocks` (type single|superset|circuit|emom|tabata, rounds, rest) → `workout_items` (exercise prescription: sets/reps/`work_seconds`/rest, `tempo_override`, `load_prescription`, `interval_index` for EMOM/Tabata, `per_side`, `goal`).
  - **Parts:** a block of kind `part` carries its own `format` + `format_config` and holds child blocks (`parent_block_id` → the part). A section is a sequence of parts and loose blocks, so "AMRAP 12 min … then 40 burpees … then EMOM 10" is one rutina. The workout-level `format` is the main section's first part's, for lists only.
  - **Principle:** a part's `format_config` = its global timing; blocks/items = the prescription. One structure expresses all formats.
  - **Variants:** a rutina may have variants (RX / Escalada / …) — full `workouts` rows with `variant_of_id` → base and a `variant_label`. Lists and the consumer catalog hide variants; the base's detail returns `variants: [{id, label}]` and the app offers them as a level before starting.
- **`programs`** → `program_days` (ordered; a program is whole weeks, seven days each, week = `position / 7`). Each day is a rest day or **owns** a workout (`program_days.workout_id`; `workouts.owner_program_id` → the program; hidden from every catalog list, deleted with the program) written in the rutina editor — structured text or a single video, like any workout (the app shows it as "Día N"). Tags via `program_goal_tags` → `goal_tags`; `program_muscles` (m2m).
- **`skill_progress`** (user × skill, unique): `unlocked_levels` (1 = only the first). Advanced by `POST /api/app/logs`: after a session, every published skill with a goal on a logged exercise is re-checked against the user's best marks over all their `set_results` (max reps in a set, max seconds, max distance, max load lifted for at least the goal's reps); while the current level's goals are all met, the next level unlocks. `GET /api/app/skills/:id` returns `unlockedLevels` and, per level, `locked` / `completed` and each goal's `best` and `met`; skill cards carry `progressPct` from it.
- **`skills`** → `skill_levels` (ordered). Each level **owns** a workout (`workouts.owner_skill_id` → the skill; hidden from every catalog list, deleted with the skill) written in the rutina editor, and `unlock_goals` (jsonb `SkillGoal[]`: exercise + metric reps|time_seconds|distance_meters|load_kg + value, derived on save from the level text's **Objetivo** section, one goal per line; the last level has none). `skill_muscles` (m2m).

## Shared JSONB value objects (typed by `@dmtx/schemas`)

- **`tempoSchema`** — `{ holdTop, eccentric, holdBottom, concentric }`, each `number | 'X'`.
- **`goalSchema`** — `{ metric, comparator, value, unit? }` (+ `compoundGoalSchema` for AND/OR). Used by `scoring_goal`, item `goal`, and `unlock_goal`. One reusable `meetsGoal()` (in `@dmtx/core`, later).
- **`loadPrescriptionSchema`** — discriminated on `type` (percent_1rm | rpe | absolute | bodyweight).
- **`formatConfigSchema`** — discriminated union on `format`; carries `configVersion` for engine migration.

> **JSONB has no DB-level shape enforcement.** Always validate on write at the API boundary. Add CHECK/trigger for the `type`/`format` discriminant consistency when you build the workouts API.

## Supporting

- **`media_assets`** — single source of truth for every file hosted on Cloudflare: `external_id` is the Cloudflare Images id (kind `image`) or the Stream uid (kind `video`); `name`, `mime_type`, `size_bytes`, `duration_seconds`, `width`/`height`. No URLs are stored: they are built from the id and the account's delivery codes (`apps/api/src/lib/cloudflare.ts`) — images as `imagedelivery.net/<hash>/<id>/w=…` (flexible variants, so each screen asks for its own size), videos as a signed HLS manifest (the app streams it and the downloads module saves it offline at the quality the user picks; there is no MP4). Content references it by FK. `processing_status` is `uploading` from the moment an upload starts (the record exists before the bytes, so content can reference it right away); an image becomes `ready` when its POST lands; a video goes `processing` while Stream encodes it and `ready` (or `failed`) when Stream says so — polled on `GET /api/media/:id` and the library list, or pushed by the Stream webhook. Only `ready` assets resolve to URLs for the app (`resolveMediaUrls`); `/app/workouts/:id` flags an attached-but-unready video as `videoPending`. Deleting an asset deletes the file at Cloudflare too (storage is billed); cancelling an upload (`uploading` or `processing`) deletes the row and the file outright.
- **`muscles`**, **`equipment`** — two flat lists of tags (one level on purpose: the admin picks the granularity with the names, e.g. Pierna, Pecho, Core). Managed in **Músculos y equipo** or created inline from the exercise form; an exercise tags its muscles and equipment. A rutina's tags are **derived**, never stored: the union of its exercises' muscles and equipment (`/app/workouts/:id` → `muscles`/`equipment`; `/app/filters` lists the ones in use; `/app/browse?muscle=&equipment=` filters by slug). Deleting a tag is refused while an exercise uses it.
- **`collections`** (Netflix rows) → **`collection_items`** — polymorphic via **exactly-one-nullable-FK + CHECK** (`workout_id`/`program_id`/`skill_id`), preserving real FK integrity.

## Users & billing

- Better Auth owns `user` / `session` / `account` / `verification` (`packages/db/src/schema/auth.ts`; `user.role` for the admin gate).
- **`profiles`** (1:1), **`subscriptions`** (our own billing record), **`discounts`**, **`payments`** (ledger), **`webhook_events`**. See [billing.md](billing.md).

## Cascade rules

Cascade **down** ownership (workout→blocks→items, program→days, skill→levels, collection→items; owned workouts cascade from their skill/program). **Never** cascade across content references (skill_level→workout uses `restrict`, program_day→workout `set null`; collection_item uses `cascade` from the collection only). Media FKs are `set null`.

## Future (stubbed, not built)

`workout_logs`, `set_results`, `skill_progress` exist (see above); `program_progress` will follow the same pattern.
