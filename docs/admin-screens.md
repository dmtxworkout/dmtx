# Admin screens

The portal is a left **sidebar** + content area (`apps/admin/src/app/(app)/layout.tsx`). Nav lives in `apps/admin/src/components/sidebar.tsx`. Every screen is Spanish (copy from `src/i18n/es.ts`). Data goes through `@dmtx/api-client` + TanStack Query; forms use react-hook-form + Zod.

## Built

- **Login** (`/login`) — email/password via `@dmtx/auth/client`.
- **Ejercicios** (`/ejercicios`) — TanStack Table list (search, status badge), create (`/nuevo`) and edit (`/[id]`) via a shared `ExerciseForm` (name, description, cues array, difficulty/measurement/status selects, unilateral, **tempo** 4-field group). This is the **reference implementation** — copy its shape for the other entities.

## To build (roadmap order)

Each follows the same pattern: list (TanStack Table) + create/edit (RHF + Zod against `@dmtx/schemas`) + a resource on the API + a method on `@dmtx/api-client`.

- **Músculos y equipo** (`/taxonomia`) — three columns: muscle groups, the muscles of the selected group, and equipment. Inline add row (Enter adds and keeps the focus for the next name), double-click renames, ✕ deletes after an in-app confirm (refused while an exercise uses it). Each row shows how many exercises use it. The exercise form tags like Shopify's product tags: the field shows the chosen chips and an "⊕ Agregar" button opens a popover to search and tick existing ones; a name that doesn't exist is created from there ("Agregar «…»"; a new muscle then asks for its group, or a new group). The first muscle added is the principal; click its badge to toggle principal/secundario.
- **Rutinas** (`/rutinas`) — the big one. Type toggle (structured/video). For structured: a full-height **text editor** styled like VS Code (dark theme, tab bar, line numbers, gutter error markers, token colours, a "Problemas" panel underneath; `rutina-text-editor.tsx`) where the whole rutina is written in the [rutina text notation](rutina-text.md) — format on the first line, `N rondas:` groups, `41 burpees  kg tempo 0-3-1-1` items, `Calentamiento:`/`Enfriamiento:` sections — with autocomplete (formats, exercises by name/alias with typo tolerance, modifiers), inline diagnostics shown as a Grammarly-style card on hover or when the word is selected (suggestions apply on click; unknown exercise → "Crear ejercicio"), the athlete-facing preview always visible in the right column (it follows the active variant tab), and the complete, searchable notation guide in a drawer behind the "Guía" button. A tab bar holds the **variants** (RX / Escalada / …): "+" copies the active tab into a new variant, double-click renames, ✕ removes; every tab is validated and saved with the base. Undo/redo buttons sit on the right (⌘Z / ⇧⌘Z, Ctrl+Z / Ctrl+Y). Select two or more lines → "Guardar como bloque" saves them as a reusable block; saved blocks and other rutinas are suggested by name and inserted whole. For video: a single media picker.
- **Bloques reutilizables** (`/bloques`) — reusable rutina text blocks (`reusable_blocks`): rename, edit text, delete. Created from the rutina editor.
- **Programas** (`/programas`) — schedule builder (days → workouts) or a video playlist, by `type`.
- **Habilidades** (`/habilidades`) — skill with ordered levels; each level → a workout + an `unlock_goal` editor (reuse the goal value-object form).
- **Colecciones** (`/colecciones`) — Netflix rows; add mixed items (workout/program/skill) with ordering.
- **Biblioteca** (`/biblioteca`) — R2 media library; upload via `api.media.upload(file, kind)` (presign → direct PUT).
- **Suscripciones** (`/suscripciones`) — see [billing.md](billing.md): set custom price/discount, comp, adjust next charge date, manual charge/retry, payment history, pause/cancel.
- **Reportes** (`/reportes`) — revenue over a period, by segment, MRR/churn (SQL over `subscriptions` + `payments`).
- **Panel** (`/`) — dashboard summary (currently redirects to `/ejercicios`).

## UI kit

Hand-written shadcn-style primitives in `apps/admin/src/components/ui/` (Button, Input, Textarea, Select, Label, Card, Badge, Table). Extend these rather than pulling the shadcn CLI. Tailwind 4 (default palette; zinc-based neutral chrome).
