# Monorepo

Turborepo + pnpm workspaces. Internal packages ship **TypeScript source** (no build step), namespaced `@dmtx/*`, linked with `workspace:*`. Consumers transpile them (Next `transpilePackages`, wrangler/esbuild).

## Layout

```
apps/
  admin/       Next.js 16 portal (Spanish) → Vercel
  api/         Hono + @hono/zod-openapi → Cloudflare Workers
  mobile/      Expo (not yet created)
packages/
  config/      tsconfig bases, eslint flat configs, (tailwind lives in admin for now)
  schemas/     shared Zod DTOs + enums + tempo/goal/load/format-config  (leaf, client-safe)
  core/        rutina text parser/serializer/completion (+ future engines) (pure TS, tested with vitest)
  db/          Drizzle schema + migrations + createDb()  (SERVER-ONLY)
  auth/        Better Auth server (.) + browser client (./client)
  api-client/  typed fetch client for the browser
```

## Dependency direction (must stay acyclic)

```
config  ← everyone
schemas ← db, auth, api-client, apps        (schemas imports nothing internal)
db      → schemas                            (server-only; lint-banned from admin/mobile)
auth    → db, schemas                        (@dmtx/auth server; @dmtx/auth/client is browser-safe)
api-client → schemas
apps/api   → db, schemas, auth
apps/admin → api-client, schemas, core, auth/client, config
core    → schemas                            (client-safe; shared with mobile later)
```

**Enforcement:** `packages/config/eslint/base.js` exports `noServerOnlyImports`, applied in the Next config (`@dmtx/config/eslint/next`). It bans `@dmtx/db`, `@dmtx/db/*`, and the server `@dmtx/auth` entry from client code. `@dmtx/auth/client` and `@dmtx/auth/permissions` are allowed.

## Adding a package

1. `packages/<name>/package.json` — `"name": "@dmtx/<name>"`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }`, scripts `lint`/`typecheck`.
2. `tsconfig.json` extending `@dmtx/config/tsconfig/library.json` (or `nextjs`/`workers`).
3. `eslint.config.js` → `export { default } from '@dmtx/config/eslint/base'` (or re-export it).
4. Depend on it elsewhere with `"@dmtx/<name>": "workspace:*"`, then `pnpm install`.

## Toolchain notes

- **pnpm 11**: overrides + build-script approvals live in `pnpm-workspace.yaml` (`overrides:`, `onlyBuiltDependencies:`, `allowBuilds:`), **not** `package.json`.
- **TypeScript pinned to 5.9** (not 7.x) for ecosystem compatibility (typescript-eslint, drizzle-kit).
- **Turbo** tasks: `typecheck`, `lint`, `build`, `dev`. Run `pnpm typecheck` / `pnpm lint` at the root.
