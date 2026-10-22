# Architecture

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | Turborepo + pnpm, TypeScript | Zod 4 & TS 5.9 pinned via `overrides` |
| Admin portal | Next.js 16 (App Router) + Tailwind 4 + TanStack Query/Table + react-hook-form + Zod | Spanish UI → Vercel |
| Backend API | Hono + `@hono/zod-openapi` | → Cloudflare Workers (portable to Node/Lambda) |
| Database | PostgreSQL on Neon + Drizzle ORM | `neon-http` driver (pure `fetch`) |
| Auth | Better Auth (admin roles plugin) + Resend | mounted inside the API |
| Media | Cloudflare Images (images, resized on request) + Cloudflare Stream (video: HLS + MP4) | the browser uploads straight to Cloudflare; one account token |
| Payments | Stripe (payment rail) + **self-managed billing** | see [billing.md](billing.md) |
| Mobile | Expo / React Native | later |

## Request / data flow

```
Admin (Next.js, Vercel) ──fetch(credentials)──▶ API (Hono, Workers) ──▶ Neon Postgres (Drizzle)
        │                                            │
        └── @dmtx/auth/client ──/api/auth/*──▶ Better Auth (in the API) ──▶ Neon
                                                     └── opens an upload at Cloudflare ──▶ browser POSTs (Images) / tus PATCHes (Stream)
```

- The browser **never** touches the DB. It calls the API via `@dmtx/api-client` (cookies included) and Better Auth via `@dmtx/auth/client`.
- The API resolves the Better Auth session on every `/api/*` request and enforces the **admin gate** (`requireAdmin`) in `apps/api/src/middleware/auth.ts`. Defense in depth: the admin app also guards client-side in `apps/admin/src/app/(app)/layout.tsx`.

## Why this stack (and portability)

Every load-bearing piece is portable: **Postgres, Drizzle, Hono, and standard HTTP**. At scale, individual components can move as isolated, cheap migrations:

- **API** → the same Hono code redeploys to AWS Lambda / ECS if Workers' limits pinch.
- **DB** → Neon → Aurora is a standard Postgres cutover.
- **Media** → Cloudflare Images and Stream are the one deliberate lock-in (they do the resizing and the encoding for us); originals can be pulled out through their APIs if we ever leave.
- **Admin** → only admins use it, so Vercel cost is negligible.

A wholesale AWS move is an org-level decision (compliance / committed spend), not an engineering necessity.

## Cross-origin cookies (important)

In production, host the admin and API under a **shared parent domain** (`admin.dmtx.app` + `api.dmtx.app`) and configure Better Auth `crossSubDomainCookies` (domain `.dmtx.app`), `SameSite=None; Secure`, and CORS `credentials: true` with an explicit origin. In **local dev** the two run on different ports (`:3001` / `:8787`), so the session cookie lives on the API origin and the admin's route guard is **client-side** (via `useSession`) rather than in Next middleware.
