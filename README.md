# DMTX

The "Netflix of workouts." A two-sided fitness platform:

- **Admin portal** (`apps/admin`) — where admins build exercises → workouts (rutinas) → programs → skills, plus taxonomy and collections. UI in **Spanish**. _(built first)_
- **Mobile app** (`apps/mobile`) — Expo consumer app: browse and play content, timers/counters, goals, progress, offline downloads. _(later)_

## Stack

Turborepo + pnpm · TypeScript · Next.js (admin) · Hono API on Cloudflare Workers · PostgreSQL on Neon + Drizzle · Better Auth · Cloudflare R2 · Stripe (self-managed billing) · Resend.

See **`CLAUDE.md`** and **`docs/`** for architecture, data model, conventions, and the admin screen specs.

## Getting started

```bash
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill in secrets
pnpm db:migrate                                    # apply schema to your Neon branch
pnpm dev                                            # admin :3000 + api :8787
```

## Workspace

```
apps/       admin (Next.js), api (Hono/Workers), mobile (later)
packages/   config, schemas, core, db, auth, api-client
```
