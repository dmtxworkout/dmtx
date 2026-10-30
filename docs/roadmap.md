# Roadmap

## Built (foundation — milestone 1)

- Turborepo + pnpm monorepo; `@dmtx/config` (tsconfig/eslint); Zod 4 & TS 5.9 pinned.
- **`@dmtx/schemas`** — shared Zod (enums, tempo, goal, load, format-config, exercise DTOs).
- **`@dmtx/db`** — full Drizzle schema (31 tables) + Better Auth tables + init migration (`packages/db/drizzle/0000_init.sql`).
- **`@dmtx/auth`** — Better Auth server (admin roles + Resend hooks) + browser client.
- **`@dmtx/api`** — Hono/OpenAPI Worker: auth mount, admin gate, **exercises CRUD**, media uploads, `/doc`.
- **`@dmtx/api-client`** — typed client.
- **`@dmtx/admin`** — Next.js portal: login, auth-guarded chrome, **exercises list + create/edit** (the reference slice), Spanish UI.
- All packages typecheck + lint green; admin builds; API bundles for Workers.

## Next (build order)

1. **Apply the migration** — provision a Neon branch, set `DATABASE_URL`, `pnpm db:migrate`; create the first admin user. (Blocks running anything end-to-end.)
2. ~~**Taxonomy**~~ — built (2026-10-21): `/api/taxonomy` CRUD, the **Músculos y equipo** screen, muscle/equipment pickers in the exercise form, and the app derives each rutina's tags ("Trabaja" / "Equipo") from its exercises and filters Explorar by them (`/app/filters`, `/app/browse?muscle=&equipment=`). Muscle zones came back on 2026-10-26: each muscle sits in a body zone, a rutina's muscles are stored on save (`workout_muscles`, primary/secondary, «Cuerpo completo»), set by hand on video-only rutinas, and Explorar browses rutinas, programs and skills by zones and muscles, ranked by how many they work. Programs' goal tags and the program/skill muscle tables were dropped (never used). On 2026-10-30 muscles gained other names for search and `body_parts`: the rutina screen in the app draws what it works on a body, man or woman, chosen and remembered on the device.
3. **Add DB indexes** — FKs, `subscriptions.next_charge_date`, `status`, `deleted_at` on hot paths (none defined yet).
4. **Workouts (rutinas)** — format picker + per-format config forms + block/item builder. Add `@dmtx/core` for the format/goal engines (`meetsGoal`, timer configs) shared with mobile.
5. ~~Collections~~ dropped (2026-10-26): the app's rows will be built from the muscle zones instead. ~~Skills~~ built (2026-10-21): levels written in the rutina editor with an **Objetivo** section; the app unlocks levels from logged sessions (see data-model.md). ~~Programs~~ rebuilt (2026-10-22): weeks of days, each day its own rutina written in the editor (video playlists dropped); `program_progress` still pending.
6. ~~**Media library**~~ — built; moved to Cloudflare Images + Stream (2026-10-22): uploads go straight from the browser (background queue), Images resizes on request, Stream encodes to HLS (streamed by the app, and saved offline by the OS at 480/720/1080p). Pending: register the Stream webhook once the API has a public URL (`cf:setup --webhook`).
7. **Billing** — the self-managed engine (SetupIntent, Cron + Queue charge run, dunning, webhooks) + subscription-management & reporting screens. See [billing.md](billing.md).
8. **Production hardening** — CI (GitHub Actions + Turbo remote cache + Neon PR-branch migration check), subdomain cookie config, Stream webhook, deploys (Vercel + `wrangler deploy`).
9. **Mobile app** — Expo consumer app (Netflix-style catalog, workout player), sharing `@dmtx/schemas` + `@dmtx/core` + `@dmtx/api-client`. ~~Offline downloads~~ built (2026-10-22): video rutinas download through `modules/hls-downloads` (iOS `AVAssetDownloadTask`, Android a local copy of one HLS variant) at the quality chosen in Perfil (480p/720p/1080p, default 720p), one at a time from a persisted queue; the Descargas screen lists and deletes them; the rutina page and the video player open from the saved copy without network. Android keeps going in the background through a foreground service with a progress notification. Rutinas are three sections, each written, video or both (2026-10-24): with both, the user picks «Ver la clase» or «Guiada» when starting (remembered as their preference) and every session logs its `mode`; Explorar filters by «Con video» / «Guiada». Every video section downloads with the rutina. Pending: exercise demo clips are not stored offline.

## Future ideas (not scheduled)

Bigger directions we want but haven't scheduled live in [../features/](../features/) — e.g. a **coach marketplace** where other coaches publish programs and earn commissions (needs a revenue-share model since today it's one all-access subscription).

## Rutina editor (built)

The block/item builder was replaced (2026-10-20) by the **text editor**: `/core` parses the [rutina text notation](rutina-text.md) and the admin form saves the parsed structure. Exercises carry `aliases` (matched by the parser and `GET /api/exercises?search=`), and absolute loads carry an optional `womenValue` (`/95 lb`).

## Rutina editor — next

- ~~Partes con formato propio dentro de una sección~~ — built (2026-10-20): part blocks (`kind='part'`, own format, children via `parent_block_id`), the parser/serializer nest them, and the mobile player chains parts (one combined log for multi-part sessions).

## Known shortcuts to revisit

- No DB indexes yet.
- `neon-http` has no interactive transactions — multi-step writes (e.g. exercise + joins) are sequential; use Neon WebSocket pool if a path needs atomicity.
- Admin route guard is client-side (fine for dev; add Next middleware once prod subdomain cookies are set up).
