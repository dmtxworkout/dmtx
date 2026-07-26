# Conventions

## Add an entity end-to-end (the golden path)

Follow the **exercises** slice as the template. To add, say, `equipment`:

1. **Schema (`@dmtx/schemas`)** — DTOs in `src/dto/<entity>.ts`: `create<Entity>Schema`, `update<Entity>Schema` (`.partial()`), `<entity>Schema` (full response). Export from `src/index.ts`. Add any enums to `src/enums.ts` (as a `const` tuple + Zod enum) so `@dmtx/db` can build the matching `pgEnum`.
2. **DB (`@dmtx/db`)** — table(s) in `src/schema/<area>.ts`, export from `src/schema/index.ts`. Then `pnpm db:generate` (writes SQL to `packages/db/drizzle/`) and `pnpm db:migrate`.
3. **API (`@dmtx/api`)** — `src/routes/<entity>.ts`: `createApp()`, `.use('*', requireAdmin)`, and `createRoute` + `.openapi(route, handler)` for list/get/create/update/delete. Mount in `src/index.ts` with `app.route('/api/<entity>', ...)`. Validate with the `@dmtx/schemas` DTOs; serialize dates to ISO strings.
4. **Client (`@dmtx/api-client`)** — `src/<entity>.ts`: a resource factory taking `Http`, typed with `@dmtx/schemas`. Wire it into `createApiClient` in `src/index.ts`.
5. **Admin (`@dmtx/admin`)** — list page (TanStack Query + Table), create/edit form (RHF + Zod). Add nav in `src/components/sidebar.tsx` and copy in `src/i18n/es.ts`.

## Code patterns

- **Data fetching:** TanStack Query. `queryKey: ['<entity>', ...deps]`; invalidate on mutation success.
- **Forms:** react-hook-form + `zodResolver`. Use a form-local Zod schema (strings for numeric inputs), then map to the API DTO on submit. Show server errors from `ApiError`.
- **Tables:** TanStack Table with the hand-written `ui/table.tsx` primitives.
- **Styling:** Tailwind 4 default palette + the `cn()` helper. Extend `components/ui/*`; don't run the shadcn CLI.
- **Spanish copy:** only from `src/i18n/es.ts`.
- **API handlers:** read `c.get('db')` (per-request Drizzle). Soft-delete via `deleted_at`; filter `isNull(<table>.deletedAt)` on reads. Return `422` on validation errors (the `createApp()` default hook does this).
- **Server-only boundary:** never import `@dmtx/db` or `@dmtx/auth` (server entry) from admin/mobile — ESLint will fail the build.

## Type-safety without codegen

`@dmtx/api-client` is hand-written but fully typed from `@dmtx/schemas` (the same types the server validates against) — a deliberate choice over Hono `hc` (which loses inference across a Turborepo boundary, honojs/hono#4638). If you later want a generated client, the API already emits an OpenAPI doc at `/doc`; run `openapi-typescript` against it and swap the client internals.

## Git

- Feature-scoped commits: `feat(<pkg>): …`, `fix(<pkg>): …`, `chore: …`.
- **No co-author, "Generated with", or any attribution trailers** in commit messages or PR bodies.
