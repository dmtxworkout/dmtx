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
| **Cloudflare Images + Stream** | media (images resized on request, video encoded to HLS) | Images & Stream → Plans → both storage blocks; then an API token with `Account · Cloudflare Images · Edit` and `Account · Stream · Edit`; then `pnpm --filter @dmtx/api cf:setup` |
| **Resend** | auth + transactional email | resend.com — **verify the sending domain early** (DNS can take up to 48h) |
| **Stripe** | payments (billing phase) | stripe.com |
| **Vercel** + **Cloudflare** | hosting (admin / API) | deploy targets |

## Variables

**`apps/api/.dev.vars`** (secrets; production via `wrangler secret put`):
`DATABASE_URL`, `BETTER_AUTH_SECRET` (≥32 chars), `RESEND_API_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`, and the media delivery codes the setup script fills in: `CF_IMAGES_ACCOUNT_HASH`, `CF_STREAM_CUSTOMER_CODE`, `CF_STREAM_SIGNING_KEY_ID`, `CF_STREAM_SIGNING_KEY_JWK` (videos require signed URLs when the key is set), `CF_STREAM_WEBHOOK_SECRET` (production only).

**Media setup**: with `CF_ACCOUNT_ID` and `CF_API_TOKEN` in `.dev.vars`, run `pnpm --filter @dmtx/api cf:setup`. It turns on Images' flexible variants, discovers the Images account hash and the Stream customer code, creates a Stream signing key and appends the four `CF_*` values to `.dev.vars`. In production, run it again with `--webhook https://api.dmtxworkout.com/api/webhooks/stream` to register Stream's "video ready" webhook (locally the API polls Stream instead), and `wrangler secret put` each `CF_*` name.

**`apps/api/wrangler.toml` `[vars]`** (non-secret): `BETTER_AUTH_URL`, `ADMIN_ORIGIN`, `EMAIL_FROM`.

**`packages/db/.env`**: `DATABASE_URL` (for `drizzle-kit`).

**`apps/admin/.env.local`**: `NEXT_PUBLIC_API_URL` (default `http://localhost:8787`).

## Production notes

- Host admin + API under a **shared parent domain** (`admin.dmtxworkout.com` / `api.dmtxworkout.com`) for cross-subdomain auth cookies; set `ADMIN_ORIGIN` + `BETTER_AUTH_URL` accordingly and enable Better Auth `crossSubDomainCookies`.
- Media needs no CORS or bucket configuration: Images' direct-upload URLs and Stream's tus endpoint accept browser uploads as they are. Register the Stream webhook (above) so videos become `ready` without an admin tab open; the Images and Stream storage blocks do not grow on their own — when a block is full, uploads fail with Cloudflare's message in the tray, and the fix is one more block in Images & Stream → Plans.
- Every environment uses the same Cloudflare Images and Stream account, and Cloudflare has no staging of its own. Only the API at `https://api.dmtxworkout.com` deletes files there; elsewhere a delete removes the database row and leaves the file, so a branch can't break production's media.
- CI: Turbo remote cache (`TURBO_TOKEN`/`TURBO_TEAM`), and a migration check against an ephemeral Neon branch.
