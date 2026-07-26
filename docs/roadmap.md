# Roadmap

## Built (foundation — milestone 1)

- Turborepo + pnpm monorepo; `@dmtx/config` (tsconfig/eslint); Zod 4 & TS 5.9 pinned.
- **`@dmtx/schemas`** — shared Zod (enums, tempo, goal, load, format-config, exercise DTOs).
- **`@dmtx/db`** — full Drizzle schema (31 tables) + Better Auth tables + init migration (`packages/db/drizzle/0000_init.sql`).
- **`@dmtx/auth`** — Better Auth server (admin roles + Resend hooks) + browser client.
- **`@dmtx/api`** — Hono/OpenAPI Worker: auth mount, admin gate, **exercises CRUD**, R2 presign, `/doc`.
- **`@dmtx/api-client`** — typed client.
- **`@dmtx/admin`** — Next.js portal: login, auth-guarded chrome, **exercises list + create/edit** (the reference slice), Spanish UI.
- All packages typecheck + lint green; admin builds; API bundles for Workers.

## Next (build order)

1. **Apply the migration** — provision a Neon branch, set `DATABASE_URL`, `pnpm db:migrate`; create the first admin user. (Blocks running anything end-to-end.)
2. **Taxonomy** — muscles / equipment CRUD (API + admin), then wire muscle/equipment pickers into the exercise form (schema + API already support them).
3. **Add DB indexes** — FKs, `subscriptions.next_charge_date`, `status`, `deleted_at` on hot paths (none defined yet).
4. **Workouts (rutinas)** — format picker + per-format config forms + block/item builder. Add `@dmtx/core` for the format/goal engines (`meetsGoal`, timer configs) shared with mobile.
5. **Programs, Skills, Collections** — same golden-path pattern.
6. **Media library** — R2 upload UI + a transcoding pipeline (source → HLS variants in R2 → `media_assets.variants`).
7. **Billing** — the self-managed engine (SetupIntent, Cron + Queue charge run, dunning, webhooks) + subscription-management & reporting screens. See [billing.md](billing.md).
8. **Production hardening** — CI (GitHub Actions + Turbo remote cache + Neon PR-branch migration check), subdomain cookie config, R2 CORS, deploys (Vercel + `wrangler deploy`).
9. **Mobile app** — Expo consumer app (Netflix-style catalog, workout player, offline downloads), sharing `@dmtx/schemas` + `@dmtx/core` + `@dmtx/api-client`.

## Future ideas (not scheduled)

Bigger directions we want but haven't scheduled live in [../features/](../features/) — e.g. a **coach marketplace** where other coaches publish programs and earn commissions (needs a revenue-share model since today it's one all-access subscription).

## Known shortcuts to revisit

- Exercise form omits muscle/equipment pickers (needs the taxonomy screens first).
- No DB indexes yet.
- `neon-http` has no interactive transactions — multi-step writes (e.g. exercise + joins) are sequential; use Neon WebSocket pool if a path needs atomicity.
- Admin route guard is client-side (fine for dev; add Next middleware once prod subdomain cookies are set up).
