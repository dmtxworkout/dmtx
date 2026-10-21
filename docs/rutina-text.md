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

Enfriamiento
  plancha 1 min
```

**Indentation scopes, like Python.** Whatever is indented under a line belongs
to it: items under `3 rondas` form that block; lines under a format header
(`AMRAP 5 min`) are that format's content; lines under `Calentamiento` form the
warmup. The serializer always indents; the parser also accepts flat content. Dedenting back to the column of the header returns to the
main rutina, so `Rutina:` is only needed in the older flat style. Colons after
section and group headers are optional.

## Lines

| Line | Meaning |
|---|---|
| `Calentamiento` / `Enfriamiento` (/ `Rutina`) | Section header (`warmup` / `cooldown` / `main`). Content indented under it belongs to it; dedent returns to `main`. A header whose next line is not indented runs in flat mode until the next header (legacy colon style). Also `Warmup`, `Cooldown`, `Vuelta a la calma`. |
| `AMRAP 12 min` | **Part**: a format header; the blocks indented under it play on that format. A section can hold several parts in sequence, plus loose blocks outside any part (played once, in order). Main without any part defaults to `For time`. |
| `3 rondas, descanso 1 min - Pierna:` | **Group header** → block with `rounds`, optional trailing rest item and label. Also `Superserie`, `Circuito 3 rondas`, `Bloque:`, `5 series`. Items follow until a blank line (or until indentation drops back). |
| `41 burpees` | **Item**: count + exercise + modifiers (see below). A loose item is its own single block. |
| `descanso 90s` | Rest line: rest item inside a group, or a loose rest block. |
| `// nota` / `# nota` | Whole-line comment (ignored). |

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

Each format line starts a new part; the previous part closes on dedent (or at the next format line in the flat, legacy style).

## Item modifiers (any order)

| Text | Field |
|---|---|
| `41 burpees` · `burpees x41` · `10 reps` | `reps` |
| `flexiones 3x5` · `3 x 5 flexiones` · `3 series de 5` | `sets` × `reps` |
| `plancha 30s` · `1 min` · `1:30` · `3x45s plancha` | `measure: time` · `workSeconds` (× sets) |
| `400 m carrera` · `remo 1 km` · `4x400 m` | `measure: distance` · `distanceMeters` (× sets) |
| `@60 kg` · `@135/95 lb` · `60 kg` | `loadPrescription: absolute` (`womenValue` from the second number; unit defaults to kg) |
| `@80%` | `percent_1rm` |
| `@RPE 8` | `rpe` |
| `+20 kg` · `@corporal` | `bodyweight` (+ addedValue) |
| `tempo 0-3-1-1` · `@0311` | `tempoOverride` — **hold arriba · negativa · hold abajo · positiva** (glossary order; `X` = explosive) |
| `c/lado` · `por lado` · `each side` | `perSide` |
| `desc 90s` · `descanso 1 min` (inline) | `restBetweenSeconds` |
| `min 1:` · `1)` prefix | `intervalIndex` (EMOM only; stripped elsewhere) |
| `// nota` (trailing) | `notes` |
| `max` · `al fallo` | no count, noted |

Whatever is left after removing modifiers is the exercise name, matched against
the catalog by name **or alias** (exact → then fuzzy: prefix, token prefix,
Damerau-Levenshtein ≥ 0.78). Unknown names are errors with suggestions; a tie
between two exercises is a warning. Tabata items need no count; elsewhere a
missing count is a warning.

## Diagnostics

`parseRutina` returns `{ main, warmup, cooldown, blocks, diagnostics, lines }`.
Each diagnostic carries a 0-based `line`, column `from/to`, `severity`
(`error` blocks saving) and a `code`:
`unknown_exercise`, `missing_exercise`, `ambiguous_exercise`, `missing_count`,
`format_needs_config`. `lines[i].kind` classifies every line for editor styling.

`toWorkoutInput(parsed)` yields the `format*`/`blocks` fields of
`CreateWorkoutInput`; `completionsAt(text, offset, catalog)` powers the editor's
autocomplete: formats on the first line and their parameters after the keyword,
units after a bare number (`12 mi` → `12 min`, `800 met` → `800 m`, `@60 k` →
`60 kg`), exercises after a count, loads/tempos/modifiers after a complete
exercise, tempo patterns after `tempo`, `N rondas:` group headers, sections, and
a "Crear ejercicio" entry when nothing matches. On an empty line (reached with
Enter) it lists everything that can go there; the editor accepts with Tab, and
Enter on an empty line only breaks the line.

## Serializer conventions

- Main always gets its format header; `Rutina:` is only written when a warmup exists.
- Loose items print on their own line; groups print `3 rondas:` (+ ` - label`) with items indented two spaces and a blank line after.
- Durations: `90s` under 10 min, `12 min` for whole minutes, `12:30` otherwise. Distances: `400 m` / `1.5 km`.
- `@135/95 lb` for dual loads, `tempo 0-3-1-1`, `c/lado`, `desc 90s`, `// notes`, `min 2:` in EMOM.

## Saved blocks and rutina suggestions

Besides exercises, the editor suggests **saved blocks** (`rutina_snippets`: a
name + rutina text, managed under `/bloques`) and **other rutinas** when a line
starts with their name (no count before it). Picking one inserts its lines at
the cursor, re-indented to the current line. A rutina inserts its main section
without the format header. Blocks are created from the editor: select the lines
(or put the cursor inside a block) and press "Guardar bloque".
