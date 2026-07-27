# CLAUDE.md — DMTX

DMTX is the **"Netflix of workouts"**: a Spanish-language fitness platform with an **admin portal** (`apps/admin`, built first) where admins build content — exercises → workouts/rutinas → programs → skills, plus taxonomy and Netflix-style collections — and a **mobile app** (`apps/mobile`, Expo, later) where subscribers browse, play, and download workouts. UI copy is in **Spanish**; code identifiers are English.

## Read next (docs/)

| Doc | What's in it |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Stack, hosting, portability, request/data flow |
| [docs/monorepo.md](docs/monorepo.md) | Packages/apps, dependency rules, adding a package |
| [docs/data-model.md](docs/data-model.md) | Every entity, discriminators, shared JSONB schemas |
| [docs/domain-glossary-es.md](docs/domain-glossary-es.md) | Spanish ⇄ English terms (source of UI copy) |
| [docs/admin-screens.md](docs/admin-screens.md) | Screen-by-screen spec for the portal |
| [docs/billing.md](docs/billing.md) | Self-managed billing engine + reporting |
| [docs/conventions.md](docs/conventions.md) | How to add an entity end-to-end; code patterns |
| [docs/env.md](docs/env.md) | Required env vars and where they live |
| [docs/roadmap.md](docs/roadmap.md) | What's built vs. next |
| [features/](features/) | Backlog of planned-but-not-scheduled features (e.g. coach marketplace) |

## Monorepo at a glance

```
apps/admin   Next.js 16 portal (Spanish) → Vercel        apps/api   Hono/OpenAPI → Cloudflare Workers
apps/mobile  Expo (later)
packages/schemas  shared Zod (source of truth)   packages/db  Drizzle + Postgres (SERVER-ONLY)
packages/auth     Better Auth                    packages/api-client  typed client for the browser
packages/core     workout engines (later)        packages/config      tsconfig/eslint/tailwind
```

## Hard rules

- **`@dmtx/db` and `@dmtx/auth` (server entry) are server-only** — never import them in `apps/admin`/`apps/mobile`. The browser talks to the API via **`@dmtx/api-client`** and uses **`@dmtx/auth/client`**. Enforced by ESLint.
- **One Zod, version-pinned** (`overrides` in `pnpm-workspace.yaml`). Two copies cause `ZodType` incompatibilities.
- **Types flow from `@dmtx/schemas`** → API validation, DB column types, and the client all reference it. Add a field there first.
- **No co-author / "generated with" / attribution trailers** in commits or PR bodies. Ever.
- On Workers, instantiate `createDb`/`createAuth` **per request** — no module-scope singletons.

## Commands

```bash
pnpm install                 # install everything
pnpm dev                     # admin (:3001) + api (:8787) via turbo
pnpm --filter @dmtx/api dev  # just the API (wrangler dev)
pnpm --filter @dmtx/admin dev
pnpm db:generate             # generate a Drizzle migration from schema changes
pnpm db:migrate              # apply migrations to $DATABASE_URL (a Neon branch)
pnpm db:studio               # browse the DB
pnpm typecheck               # tsc across the workspace
pnpm lint                    # eslint across the workspace
pnpm --filter @dmtx/admin build
```

**First-run setup** and the services you must provision (Neon, R2, Resend, Stripe) are in [docs/env.md](docs/env.md).
