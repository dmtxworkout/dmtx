# Environment & setup

## First run

```bash
pnpm install
# API secrets
cp apps/api/.dev.vars.example apps/api/.dev.vars      # fill in (see below)
# DB migrations (needs a Neon URL)
cp packages/db/.env.example packages/db/.env          # set DATABASE_URL
pnpm db:migrate
# Admin
cp apps/admin/.env.example apps/admin/.env.local      # NEXT_PUBLIC_API_URL (default is fine)
pnpm dev                                               # admin :3001 + api :8787
```

Create the first admin: sign up via the app, then set that user's `role` to `admin` in the DB (`pnpm db:studio` → `user` table), or promote via Better Auth's admin API.

## Services to provision

| Service | Why | Get it |
|---|---|---|
| **Neon** (Postgres) | database | neon.tech — use a per-dev **branch** (the Neon HTTP driver can't hit a bare local Postgres) |
| **Cloudflare R2** | media storage | R2 → create bucket `dmtx-media` + an S3 API token (access key/secret) |
| **Resend** | auth + transactional email | resend.com — **verify the sending domain early** (DNS can take up to 48h) |
| **Stripe** | payments (billing phase) | stripe.com |
| **Vercel** + **Cloudflare** | hosting (admin / API) | deploy targets |

## Variables

**`apps/api/.dev.vars`** (secrets; production via `wrangler secret put`):
`DATABASE_URL`, `BETTER_AUTH_SECRET` (≥32 chars), `RESEND_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`.

**`apps/api/wrangler.toml` `[vars]`** (non-secret): `BETTER_AUTH_URL`, `ADMIN_ORIGIN`, `EMAIL_FROM`, `R2_BUCKET`.

**`packages/db/.env`**: `DATABASE_URL` (for `drizzle-kit`).

**`apps/admin/.env.local`**: `NEXT_PUBLIC_API_URL` (default `http://localhost:8787`).

## Production notes

- Host admin + API under a **shared parent domain** (`admin.dmtx.app` / `api.dmtx.app`) for cross-subdomain auth cookies; set `ADMIN_ORIGIN` + `BETTER_AUTH_URL` accordingly and enable Better Auth `crossSubDomainCookies`.
- Set R2 bucket **CORS** to allow the admin origin + `PUT` for direct uploads.
- CI: Turbo remote cache (`TURBO_TOKEN`/`TURBO_TEAM`), and a migration check against an ephemeral Neon branch.
