# Rutina text notation

Rutinas are written as plain text in the admin editor and parsed by `@dmtx/core`
(`packages/core/src/rutina-text/`). The grammar is line based, Spanish/English,
case- and accent-insensitive. `serializeRutina` is the exact inverse, so saved
rutinas reopen as text.

## Example

```
Calentamiento
  AMRAP 5 min
    10 burpees
    plancha 20s

For time cap 20 min
  41 burpees

  3 rondas, descanso 1 min
    19 Power Clean @135/95 lb
    10 Bar Muscle Up
    41 Single Cross Over

  41 burpees

Estiramiento
  plancha 1 min
```

**Indentation scopes, like Python.** Whatever is indented under a line belongs
to it: items under `3 rondas` form that block; lines under a format header
(`AMRAP 5 min`) are that format's content; lines under `Calentamiento` form the
warmup. Dedenting back to the column of the header returns to the main
rutina. Colons after section and group headers are optional. There is no flat
mode: a header with nothing indented under it is simply empty (and warned
about), and blank lines never close anything.

The admin edits each section in its own tab (Rutina · Calentamiento ·
Estiramiento), so the headers are never typed there: `splitSections` /
`joinSections` in `@dmtx/core` turn the stored document into three unindented
texts and back. Variants (RX / Escalada) are whole versions of the rutina,
switched from the same bar.

## Lines

| Line | Meaning |
|---|---|
| `Calentamiento` / `Estiramiento` (/ `Rutina`) | Section header (`warmup` / `cooldown` / `main`). Content indented under it belongs to it; dedent returns to `main`. Also `Warmup`, `Stretch`, `Cooldown`, `Enfriamiento`, `Vuelta a la calma` (the serializer writes `Estiramiento`). |
| `AMRAP 12 min` | **Part**: a format header; the blocks indented under it play on that format. A section can hold several parts in sequence, plus loose blocks outside any part (played once, in order). Parts and groups nest freely by indentation: `EMOM … › 3 rondas › AMRAP 3 min › exercises`. A container holds either exercise lines or child blocks; lines after a nested block become loose runs among the children, order kept. Main without any part defaults to `For time`. |
| `3 rondas, descanso 1 min - Pierna:` | **Group header** → block with `rounds`, optional trailing rest item and label. Also `Superserie`, `Circuito 3 rondas`, `Bloque:`, `5 series`. Its items are the lines indented under it; blank lines change nothing, dedenting to the header's column leaves the group. A header with no exercise indented under it gets an `empty_group` warning. |
| `41 burpees` | **Item**: count + exercise + modifiers (see below). A loose item is its own single block. |
| `descanso 90s` | Rest line: rest item inside a group, or a loose rest block. |
| `# comentario` | Internal comment: never stored in the structure nor shown to the athlete. Survives because the rutina keeps its `sourceText`. |
| `// nota para el atleta` | A note the athlete sees. Alone on a line it attaches to what is right above it: the last exercise of the open group (or the group itself when empty), else the last block of the open part/section (or the part itself). With nothing above → `orphan_note` warning. |

## Format headers

| Text | `formatConfig` |
|---|---|
| `AMRAP 12 min` | `amrap` · totalSeconds |
| `EMOM 10 min` · `EMOM 10 x 90s` · `E2MOM 10` | `emom` · intervalSeconds (default 60) · rounds |
| `Tabata 8 x 20/10` · `Tabata` | `tabata` · rounds/work/rest (default 8 × 20/10) |
| `For time` · `For time 5 rondas cap 20 min` · `Por tiempo` | `for_time` · rounds? · timeCapSeconds? |
| `Chipper cap 25 min` | `chipper` · timeCapSeconds? |
| `Fuerza` · `Strength` | `strength` |
| `Circuito 3 rondas descanso 1 min cap 30 min` | `circuit` · rounds? · restBetweenRoundsSeconds? · timeCapSeconds? |

Each format line starts a new part; the part closes on dedent. The rutina's
`format` column is derived from the main section's first part (null when main
has no part) and only serves lists and filters.

Durations accept `12 min`, `90s`, `1:30`, `1 min 30 s`, and the paper
shorthands `12'` (minutes) and `30''` / `30"` (seconds).

**Keyword typos.** A line whose first word is within edit distance of a
keyword (`Intervalor 2:`, `3 rondsa:`, `Calentamineto`) and that would be
structural once fixed gets an `unknown_keyword` diagnostic on that word with
the fix as its suggestion. Real exercise names are never flagged.

## Item modifiers (any order)

| Text | Field |
|---|---|
| `41 burpees` · `burpees x41` · `10 reps` | `reps` |
| `flexiones 3x5` · `3 x 5 flexiones` · `3 series de 5` | `sets` × `reps` |
| `plancha 30s` · `30''` · `1 min` · `1'` · `1:30` · `3x45s plancha` | `measure: time` · `workSeconds` (× sets) |
| `400 m carrera` · `remo 1 km` · `4x400 m` | `measure: distance` · `distanceMeters` (× sets) |
| `@60 kg` · `@135/95 lb` · `60 kg` | `loadPrescription: absolute` (`womenValue` from the second number; unit defaults to kg) |
| `@80%` | `percent_1rm` |
| `@RPE 8` | `rpe` |
| `+20 kg` · `@corporal` | `bodyweight` (+ addedValue) |
| `tempo 0-3-1-1` · `@0311` | `tempoOverride` — **hold arriba · negativa · hold abajo · positiva** (glossary order; `X` = explosive) |
| `c/lado` · `por lado` · `each side` | `perSide` |
| `desc 90s` · `descanso 1 min` (inline) | `restBetweenSeconds` |
| `intervalo 1:` · `min 1:` · `1)` prefix | `intervalIndex` (EMOM only; stripped elsewhere) |
| `intervalo 2:` on its own line (EMOM) | A group holding that interval's work (the lines indented under it); the player rotates over such slots. `min 2:` is accepted too |
| `intervalo N:` outside an EMOM | Ignored, with an `interval_outside_emom` warning |
| `// nota` (trailing) | `notes`, shown to the athlete |
| `# comentario` (trailing) | Internal; dropped. Runs to the end of the line, so a `//` note before it ends there |
| `max` · `al fallo` | no count, noted |

Whatever is left after removing modifiers is the exercise name, matched against
the catalog by name **or alias**. Only an exact match resolves (accents and
case ignored; plural and singular count as the same word, so `10 sentadillas`
finds "Sentadilla"). A typo or a partial name is an error, with the closest
catalog names as suggestions (prefix, token prefix, Damerau-Levenshtein ≥ 0.78)
so one click writes it properly; nothing half-written reaches the rutina or its
preview. A tie between two exercises is a warning. Tabata items need no count; elsewhere a
missing count is a warning.

## Diagnostics

`parseRutina` returns `{ main, warmup, cooldown, blocks, diagnostics, lines }`.
Each diagnostic carries a 0-based `line`, column `from/to`, `severity`
(`error` blocks saving) and a `code`:
`unknown_exercise` (also for a typo or a partial name: only an exact name or
alias resolves, and the closest catalog name comes first in `suggestions`),
`missing_exercise`, `ambiguous_exercise`, `missing_count`, `format_needs_config`. `lines[i].kind` classifies every line for editor styling.

**Objetivo** (skills only): a fourth section, `Objetivo` header like the others,
holding the marks that unlock the next level — one exercise line each, with an
amount: `3 Dominadas`, `Plancha 60s`, `400 m Carrera`, `Sentadilla 1x5 @100 kg`.
It is not typed by hand: the admin's goal panel (`skill-goals.tsx`) writes it with
`goalLine(goal)` from the exercises the level's rutina uses, and it is not offered
by autocomplete. Formats, rondas and descansos are errors there (`goal_structure`),
as is a line without an amount (`goal_needs_amount`). `goalsFrom(parsed)` turns
them into `SkillGoal[]` (metric reps / time_seconds / distance_meters / load_kg
with reps); `toWorkoutInput` leaves the section out of the blocks.

`toWorkoutInput(parsed)` yields the `format*`/`blocks` fields of
`CreateWorkoutInput`; `completionsAt(text, offset, catalog, opts)` powers the
editor's autocomplete: units after a bare number (`12 mi` → `12 min`, `800 met`
→ `800 m`, `@60 k` → `60 kg`), exercises after a count, loads/tempos/modifiers
after a complete exercise, tempo patterns after `tempo`, and a "Crear ejercicio"
entry when nothing matches. With `structure: true` (the default) it also offers
formats and their parameters, `N rondas`, `descanso`, sections, templates,
blocks and rutinas, and lists everything on an empty line; the admin editor
passes `structure: false` because those come from its "+" menu instead. What
that menu inserts carries placeholders (`${minutos}`, `${ejercicio}`…) that the
editor highlights: the first is selected, Tab jumps to the next, typing fills
it. Nothing comes pre-filled with invented exercises or times.

## Serializer conventions

- Main always gets its format header; `Rutina:` is only written when a warmup exists.
- Loose items print on their own line; groups print `3 rondas` (+ ` - label`, no colon) with items indented two spaces and a blank line after.
- Durations: `90s` under 10 min, `12 min` for whole minutes, `12:30` otherwise. Distances: `400 m` / `1.5 km`.
- `@135/95 lb` for dual loads, `tempo 0-3-1-1`, `c/lado`, `desc 90s`, `// notes`, `intervalo 2:` in EMOM.

## Saved blocks and rutina suggestions

Besides exercises, the editor suggests **reusable blocks** (`reusable_blocks`: a
name + rutina text, managed under `/bloques`) and **other rutinas** when a line
starts with their name (no count before it). Picking one inserts its lines at
the cursor, re-indented to the current line. A rutina inserts its main section
without the format header. Blocks are created from the editor: select the lines
(or put the cursor inside a block) and press "Guardar bloque".
