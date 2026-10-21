'use client';

// The rutina text editor: a CodeMirror 6 instance wired to @dmtx/core's parser.
// The parent owns the text and the parse result; this component renders it like
// a small code editor (line numbers, error markers in the gutter), offers
// completions (formats, exercises, units, modifiers, saved blocks) and shows a
// Grammarly-style card for every diagnostic.
import { useEffect, useRef, type MutableRefObject } from 'react';
import { EditorState, Prec, StateEffect, StateField, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  gutter,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
  showTooltip,
  type DecorationSet,
  type Tooltip,
  type ViewUpdate,
  closeHoverTooltips,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeCompletion,
  completionStatus,
  hasNextSnippetField,
  hasPrevSnippetField,
  moveCompletionSelection,
  nextSnippetField,
  prevSnippetField,
  snippet,
  startCompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { linter, lintKeymap, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import {
  completionsAt,
  parseRutina,
  type Catalog,
  type CompletionExtra,
  type Diagnostic,
  type LineInfo,
  type LineKind,
  type ParsedRutina,
} from '@dmtx/core';

export type InsertKind = 'template' | 'block' | 'rutina';
export interface InsertItem {
  id: string;
  title: string;
  desc?: string | null;
  /** Built-in items insert this text straight away (no preview). `${…}` marks a placeholder. */
  text?: string;
}
export interface InsertGroup {
  kind: InsertKind | 'rondas' | 'descanso' | 'formato' | 'ejercicio';
  title: string;
  items: InsertItem[];
  /** Items insert their `text` on click; no preview step. */
  direct?: boolean;
}

/** Imperative access the form uses for "guardar bloque". */
export interface RutinaEditorApi {
  /** The selected text, or the block (header + indented lines / run of lines) at the cursor. */
  selectionOrBlock(): string;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}

export interface RutinaTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  catalog: Catalog;
  parsed: ParsedRutina;
  /** Offered on "ejercicio no encontrado" diagnostics. */
  onCreateExercise?: (name: string) => void;
  /** Templates / saved blocks / other rutinas offered as whole-line suggestions. */
  extras?: CompletionExtra[];
  /** The same things, grouped, for the "+" menu in the gutter. */
  inserts?: InsertGroup[];
  /** Resolves the text to insert for a template / block / rutina. */
  onInsertBlock?: (kind: InsertKind, id: string) => Promise<string | null>;
  /** Shown as a floating action when two or more lines are selected. */
  onSaveBlock?: (text: string) => void;
  /** "Editar ejercicio": a click on a recognised exercise name, or the action on its diagnostic card. */
  onEditExercise?: (id: string) => void;
  apiRef?: MutableRefObject<RutinaEditorApi | null>;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

// --- State shared with the extensions ----------------------------------------
// Props that the (once-created) extensions need live in state fields, updated
// through effects, so tooltips can be built from `state` alone.
interface Handlers {
  create: ((name: string) => void) | null;
  save: ((text: string) => void) | null;
  insert: ((kind: InsertKind, id: string) => Promise<string | null>) | null;
  edit: ((id: string) => void) | null;
}
const setHandlers = StateEffect.define<Handlers>();
const handlersField = StateField.define<Handlers>({
  create: () => ({ create: null, save: null, insert: null, edit: null }),
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setHandlers)) return e.value;
    return v;
  },
});

/** A recognised exercise name in the text: where it is and which exercise it resolved to. */
interface ExerciseRef {
  line: number;
  from: number;
  to: number;
  id: string;
  name: string;
  /** Written exactly (name or alias). A fuzzy match carries an info diagnostic instead of the link look. */
  exact: boolean;
}
const setExerciseRefs = StateEffect.define<ExerciseRef[]>();
const exerciseRefsField = StateField.define<ExerciseRef[]>({
  create: () => [],
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setExerciseRefs)) return e.value;
    return v;
  },
});
function collectExerciseRefs(blocks: ParsedRutina['blocks']): ExerciseRef[] {
  const out: ExerciseRef[] = [];
  const walk = (list: ParsedRutina['blocks']) => {
    for (const b of list) {
      for (const it of b.items) {
        if (it.match && it.nameRange) {
          out.push({ line: it.line, from: it.nameRange[0], to: it.nameRange[1], id: it.match.id, name: it.match.name, exact: it.match.confidence === 'exact' });
        }
      }
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}
/** The recognised exercise under a document position, if any. */
function exerciseAt(state: EditorState, pos: number): (ExerciseRef & { docFrom: number; docTo: number }) | null {
  const line = state.doc.lineAt(pos);
  const col = pos - line.from;
  const ref = state.field(exerciseRefsField).find((r) => r.line === line.number - 1 && col >= r.from && col <= r.to);
  return ref ? { ...ref, docFrom: line.from + ref.from, docTo: line.from + ref.to } : null;
}

// Every recognised name gets a mark; with Cmd/Ctrl held the editor root carries
// `rt-mod` and the marks turn into links (pointer + underline on hover).
const exerciseMark = Decoration.mark({ class: 'rt-ex' });
const exerciseLinks = EditorView.decorations.compute([exerciseRefsField], (state) => {
  const marks: { from: number; to: number }[] = [];
  for (const r of state.field(exerciseRefsField)) {
    if (!r.exact || r.line + 1 > state.doc.lines) continue;
    const line = state.doc.line(r.line + 1);
    const from = line.from + r.from;
    const to = Math.min(line.from + r.to, line.to);
    if (to > from) marks.push({ from, to });
  }
  marks.sort((a, b) => a.from - b.from);
  return Decoration.set(marks.map((m) => exerciseMark.range(m.from, m.to)));
});

const setParsedLines = StateEffect.define<LineInfo[]>();
const parsedLinesField = StateField.define<LineInfo[]>({
  create: () => [],
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setParsedLines)) return e.value;
    return v;
  },
});

const setParsedDiags = StateEffect.define<Diagnostic[]>();
const diagsField = StateField.define<Diagnostic[]>({
  create: () => [],
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setParsedDiags)) return e.value;
    return v;
  },
});

// --- Tint for lines with a diagnostic ----------------------------------------
const errLine = Decoration.line({ class: 'rt-line-error' });
const warnLine = Decoration.line({ class: 'rt-line-warn' });
const diagLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setParsedDiags)) {
        const doc = tr.state.doc;
        const byLine = new Map<number, 'error' | 'warning'>();
        for (const d of e.value) {
          if (d.line >= doc.lines) continue;
          const prev = byLine.get(d.line);
          if (d.severity === 'error' || !prev) byLine.set(d.line, d.severity === 'error' ? 'error' : 'warning');
        }
        const ranges: Range<Decoration>[] = [];
        for (const [line, sev] of byLine) {
          ranges.push((sev === 'error' ? errLine : warnLine).range(doc.line(line + 1).from));
        }
        next = Decoration.set(ranges.sort((a, b) => a.from - b.from));
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// --- Line decorations (format / section / group / rest / comment) -----------
// Computed inside the editor on every change (line kinds need no catalog), so
// colouring never lags behind typing or undo.
const lineDeco: Record<string, Decoration> = {
  format: Decoration.line({ class: 'rt-format' }),
  section: Decoration.line({ class: 'rt-section' }),
  group: Decoration.line({ class: 'rt-group' }),
  rest: Decoration.line({ class: 'rt-rest' }),
  comment: Decoration.line({ class: 'rt-comment' }),
  note: Decoration.line({ class: 'rt-notes' }),
};
function lineKindDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const { lines } = parseRutina(doc.toString(), { catalog: [] });
  const ranges: Range<Decoration>[] = [];
  lines.forEach((info, i) => {
    if (i >= doc.lines) return;
    const d = lineDeco[info.kind];
    if (d) ranges.push(d.range(doc.line(i + 1).from));
  });
  return Decoration.set(ranges, true);
}
const lineKindPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = lineKindDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = lineKindDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// --- Diagnostic card ---------------------------------------------------------
const escape = (s: string) => s.replace(/[<>&]/g, '');
const BACK_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const CHEVRON_ICON =
  '<svg class="c" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const PENCIL_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const PLUS_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const BOOKMARK_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

/** Diagnostics whose range contains `pos` (doc offset), with their doc range. */
function diagnosticsAt(state: EditorState, pos: number) {
  const line = state.doc.lineAt(pos);
  const col = pos - line.from;
  const here = state
    .field(diagsField)
    .filter((d) => d.line === line.number - 1 && col >= d.from && col <= (d.to > d.from ? d.to : line.length));
  if (!here.length) return null;
  const d0 = here[0]!;
  return {
    diags: here,
    from: line.from + d0.from,
    to: d0.to > d0.from ? line.from + d0.to : line.to,
  };
}

/**
 * A label, then each suggestion as a clickable row that applies the fix, then
 * secondary actions. Built from state so hover and selection can both show it.
 */
function buildCard(view: EditorView, diags: Diagnostic[], from: number, to: number): HTMLElement {
  const { create } = view.state.field(handlersField);
  const raw = view.state.sliceDoc(from, to);
  const dom = document.createElement('div');
  dom.className = 'rt-diag';
  const el = (tag: string, cls: string, text?: string, parent: HTMLElement = dom) => {
    const e = document.createElement(tag);
    e.className = cls;
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  };
  const button = (cls: string, html: string, onClick: () => void, parent: HTMLElement = dom) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.innerHTML = html;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', onClick);
    parent.appendChild(b);
    return b;
  };
  const replaceWith = (name: string) => () =>
    view.dispatch({ changes: { from, to, insert: name }, userEvent: 'input' });

  diags.forEach((d, i) => {
    if (i > 0) el('div', 'rt-diag-sep');
    const top = el('div', 'rt-diag-top');
    if (d.code === 'unknown_exercise') {
      const names = d.suggestions ?? [];
      el('div', 'rt-diag-label error', names.length ? '¿Quisiste decir?' : 'Ejercicio no encontrado', top);
      for (const name of names) button('rt-diag-sugg', escape(name), replaceWith(name), top);
      if (!names.length) el('div', 'rt-diag-msg', `"${raw}" no está en el catálogo.`, top);
      if (create) {
        button('rt-diag-action', `${PLUS_ICON}<span>Crear ejercicio "${escape(raw)}"</span>`, () => {
          // The card would otherwise stay open under the create dialog.
          view.dispatch({ effects: setGutterTip.of(null) });
          create(raw);
        });
      }
    } else if (d.code === 'unknown_keyword') {
      const top = el('div', 'rt-diag-top');
      el('div', 'rt-diag-label error', '¿Quisiste decir?', top);
      for (const name of d.suggestions ?? []) button('rt-diag-sugg', escape(name), replaceWith(name), top);
      el('div', 'rt-diag-msg', d.message, top);
    } else if (d.code === 'ambiguous_exercise') {
      el('div', 'rt-diag-label', 'Varias coincidencias · elige', top);
      for (const name of d.suggestions ?? []) button('rt-diag-sugg', escape(name), replaceWith(name), top);
    } else if (d.code === 'fuzzy_exercise') {
      el('div', 'rt-diag-label', 'Se entiende como · clic para escribirlo bien', top);
      for (const name of d.suggestions ?? []) button('rt-diag-sugg', escape(name), replaceWith(name), top);
    } else {
      el('div', `rt-diag-label${d.severity === 'error' ? ' error' : ''}`, d.severity === 'error' ? 'Error' : 'Aviso', top);
      el('div', 'rt-diag-msg', d.message, top);
    }
  });
  // A recognised exercise under the card (an archived one, say) can be edited from here.
  const ref = exerciseAt(view.state, from) ?? exerciseAt(view.state, to);
  const { edit } = view.state.field(handlersField);
  if (ref && edit) {
    button('rt-diag-action', `${PENCIL_ICON}<span>Editar ejercicio «${escape(ref.name)}»</span>`, () => {
      view.dispatch({ effects: [setGutterTip.of(null), closeHoverTooltips] });
      edit(ref.id);
    });
  }
  return dom;
}

// Hover: the card for the diagnostic under the pointer.
const hoverCard = hoverTooltip(
  (view, pos): Tooltip | null => {
    const hit = diagnosticsAt(view.state, pos);
    if (hit) {
      return {
        pos: hit.from,
        end: hit.to,
        above: false,
        create: () => ({ dom: buildCard(view, hit.diags, hit.from, hit.to) }),
      };
    }
    return null;
  },
  { hoverTime: 120, hideOnChange: true },
);

// Selection: two or more lines → "Guardar como bloque"; a selection inside one
// line that touches a diagnostic → that diagnostic's card.
const selectionTooltip = StateField.define<Tooltip | null>({
  create: () => null,
  update(_v, tr) {
    const { state } = tr;
    const sel = state.selection.main;
    if (sel.empty) return null;
    const text = state.sliceDoc(sel.from, sel.to);
    if (!text.trim()) return null;
    const firstLine = state.doc.lineAt(sel.from).number;
    const lastLine = state.doc.lineAt(text.endsWith('\n') ? sel.to - 1 : sel.to).number;
    if (lastLine > firstLine) {
      const { save } = state.field(handlersField);
      if (!save) return null;
      return {
        pos: sel.to,
        above: false,
        strictSide: false,
        arrow: false,
        create: (view) => {
          const dom = document.createElement('div');
          dom.className = 'rt-selection-tip';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.innerHTML = `${BOOKMARK_ICON}<span>Guardar como bloque</span>`;
          btn.addEventListener('mousedown', (e) => e.preventDefault());
          btn.addEventListener('click', () => {
            // Collapse the selection so the action disappears while the dialog is open.
            view.dispatch({ selection: { anchor: view.state.selection.main.to } });
            save(text);
          });
          dom.appendChild(btn);
          return { dom, offset: { x: 0, y: 6 } };
        },
      };
    }
    // A selected snippet placeholder is about to be overwritten: no card over it.
    if (hasNextSnippetField(state) || hasPrevSnippetField(state)) return null;
    const hit = diagnosticsAt(state, sel.from) ?? diagnosticsAt(state, sel.to);
    if (!hit) return null;
    return {
      pos: hit.from,
      end: hit.to,
      above: false,
      arrow: false,
      create: (view) => ({ dom: buildCard(view, hit.diags, hit.from, hit.to) }),
    };
  },
  provide: (f) => showTooltip.from(f),
});

// --- Diagnostic gutter: ✕ / △ left of the line number; hovering it opens the card
class DiagMarker extends GutterMarker {
  constructor(readonly severity: 'error' | 'warning') {
    super();
  }
  override eq(other: DiagMarker) {
    return other.severity === this.severity;
  }
  override toDOM() {
    const el = document.createElement('div');
    el.className = `rt-mark rt-mark-${this.severity}`;
    el.title = '';
    return el;
  }
}
const markerFor = (sev: 'error' | 'warning') => new DiagMarker(sev);

const setGutterTip = StateEffect.define<number | null>(); // 0-based line, or null to hide
const closeTimers = new WeakMap<EditorView, number>();
const gutterTipField = StateField.define<Tooltip | null>({
  create: () => null,
  update(v, tr) {
    let next = v;
    for (const e of tr.effects) {
      if (e.is(setGutterTip)) {
        if (e.value == null) next = null;
        else {
          const lineNo = e.value;
          const doc = tr.state.doc;
          if (lineNo >= doc.lines) return null;
          const line = doc.line(lineNo + 1);
          const diags = tr.state.field(diagsField).filter((d) => d.line === lineNo);
          if (!diags.length) return null;
          const d0 = diags[0]!;
          const from = line.from + d0.from;
          const to = d0.to > d0.from ? line.from + d0.to : line.to;
          next = {
            pos: line.from,
            above: false,
            arrow: false,
            create: (view) => {
              const dom = buildCard(view, diags, from, to);
              // Keep the card open while the pointer is inside it.
              dom.addEventListener('mouseenter', () => window.clearTimeout(closeTimers.get(view)));
              dom.addEventListener('mouseleave', () => view.dispatch({ effects: setGutterTip.of(null) }));
              return { dom, offset: { x: 0, y: 4 } };
            },
          };
        }
      }
    }
    // A doc change invalidates the card (its range may have moved).
    return tr.docChanged ? null : next;
  },
  provide: (f) => showTooltip.from(f),
});

const diagGutter = gutter({
  class: 'rt-gutter-diag',
  lineMarker(view, line) {
    const lineNo = view.state.doc.lineAt(line.from).number - 1;
    const here = view.state.field(diagsField).filter((d) => d.line === lineNo);
    if (!here.length) return null;
    return markerFor(here.some((d) => d.severity === 'error') ? 'error' : 'warning');
  },
  lineMarkerChange: (u) => u.transactions.some((tr) => tr.effects.some((e) => e.is(setParsedDiags))),
  domEventHandlers: {
    mouseover(view, line, event) {
      if (!(event.target as HTMLElement).classList?.contains('rt-mark')) return false;
      window.clearTimeout(closeTimers.get(view));
      view.dispatch({ effects: setGutterTip.of(view.state.doc.lineAt(line.from).number - 1) });
      return true;
    },
    mouseout(view) {
      closeTimers.set(
        view,
        window.setTimeout(() => view.dispatch({ effects: setGutterTip.of(null) }), 250),
      );
      return false;
    },
  },
});

// --- "+" gutter: insert a template / saved block / rutina at a line ----------
// The "+" sits left of the line number on the hovered line and on the cursor's
// line; clicking it opens a searchable menu. Inside a format or a group, whole
// rutinas are left out (they only fit at the top level).
const setInserts = StateEffect.define<InsertGroup[]>();
const insertsField = StateField.define<InsertGroup[]>({
  create: () => [],
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setInserts)) return e.value;
    return v;
  },
});
const setHoverLine = StateEffect.define<number | null>();
const hoverLineField = StateField.define<number | null>({
  create: () => null,
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setHoverLine)) return e.value;
    return v;
  },
});
class AddMarker extends GutterMarker {
  constructor(readonly hot: boolean) {
    super();
  }
  override eq(other: AddMarker) {
    return other.hot === this.hot;
  }
  override toDOM() {
    const el = document.createElement('div');
    el.className = `rt-add${this.hot ? ' hot' : ''}`;
    el.textContent = '+';
    el.title = 'Insertar plantilla, bloque reutilizable o rutina';
    return el;
  }
}
const addMarkers = [new AddMarker(false), new AddMarker(true)];
const lineUnderPointer = (view: EditorView, event: MouseEvent): number | null => {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
  return pos == null ? null : view.state.doc.lineAt(pos).number - 1;
};
const trackHover = (view: EditorView, event: MouseEvent) => {
  const line = lineUnderPointer(view, event);
  if (line !== view.state.field(hoverLineField)) view.dispatch({ effects: setHoverLine.of(line) });
  return false;
};
const hoverTracker = EditorView.domEventHandlers({
  mousemove: (event, view) => trackHover(view, event),
  // A click on a recognised exercise opens it for editing. `click` (not
  // mousedown) so a drag that starts on a name still selects text.
  click: (event, view) => {
    if (event.button !== 0 || !view.state.selection.main.empty) return false;
    // Only on the name itself: a click elsewhere on the line (or past its end)
    // would otherwise snap to the nearest position, which may be the name.
    if (!(event.target as HTMLElement).closest?.('.rt-ex')) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    const ref = exerciseAt(view.state, pos);
    const { edit } = view.state.field(handlersField);
    if (!ref || !edit) return false;
    edit(ref.id);
    return true;
  },
  mouseleave: (_e, view) => {
    if (view.state.field(hoverLineField) != null) view.dispatch({ effects: setHoverLine.of(null) });
    return false;
  },
});
/** Open the menu at a 0-based line (from the gutter "+", or from the line itself), or close it. */
type MenuOrigin = 'gutter' | 'line';
const openInsertMenu = StateEffect.define<{ line: number; origin: MenuOrigin } | null>();
const setCatalog = StateEffect.define<Catalog>();
const catalogField = StateField.define<Catalog | null>({
  create: () => null,
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setCatalog)) return e.value;
    return v;
  },
});
// While a line-opened menu sits at its root, the editor keeps focus and routes
// these keys to it (so typing anything else just closes it and goes to the text).
const menuKeys = new WeakMap<EditorView, (key: string) => boolean>();

// What the menu inserts comes with placeholders (${…}), never made-up values:
// the editor highlights them and Tab jumps from one to the next.
const BUILT_IN_FORMATS: InsertItem[] = [
  { id: 'amrap', title: 'AMRAP', desc: 'máximas rondas en un tiempo · AMRAP 12 min', text: 'AMRAP ${minutos} min\n  ${reps} ${ejercicio}' },
  { id: 'emom', title: 'EMOM', desc: 'cada intervalo, al intervalo · EMOM 10 x 90s', text: 'EMOM ${intervalos} x ${segundos}s\n  ${reps} ${ejercicio}' },
  { id: 'tabata', title: 'Tabata', desc: 'trabajo/descanso · Tabata 8 x 20/10', text: 'Tabata ${rondas} x ${trabajo}/${descanso}\n  ${ejercicio}' },
  { id: 'for_time', title: 'For time', desc: 'completar lo más rápido posible', text: 'For time\n  ${reps} ${ejercicio}' },
  { id: 'chipper', title: 'Chipper', desc: 'lista completada una vez, por tiempo', text: 'Chipper\n  ${reps} ${ejercicio}' },
  { id: 'fuerza', title: 'Fuerza', desc: 'series y repeticiones', text: 'Fuerza\n  ${ejercicio} ${series}x${reps}' },
  { id: 'circuito', title: 'Circuito', desc: 'rondas con descanso · Circuito 3 rondas', text: 'Circuito ${rondas} rondas\n  ${reps} ${ejercicio}' },
];
const BUILT_IN_RONDAS: InsertItem[] = Array.from({ length: 10 }, (_, i) => ({
  id: `r${i + 1}`,
  title: i === 0 ? '1 ronda' : `${i + 1} rondas`,
  text: `${i + 1} rondas\n  \${reps} \${ejercicio}`,
}));
const BUILT_IN_DESCANSO: InsertItem[] = ['10s', '20s', '30s', '45s', '60s', '90s', '2 min', '3 min', '5 min'].map((d) => ({
  id: `d${d}`,
  title: d,
  text: `descanso ${d}`,
}));
/** The categories every menu starts with; the form adds templates, blocks and rutinas. */
function builtInGroups(catalog: Catalog | null): InsertGroup[] {
  const exercises = catalog ? catalog.search('', catalog.size) : [];
  return [
    { kind: 'rondas', title: 'Rondas', direct: true, items: BUILT_IN_RONDAS },
    { kind: 'descanso', title: 'Descanso', direct: true, items: BUILT_IN_DESCANSO },
    { kind: 'formato', title: 'Formatos', direct: true, items: BUILT_IN_FORMATS },
    {
      kind: 'ejercicio',
      title: 'Ejercicios',
      direct: true,
      items: exercises.map((ex) => ({ id: ex.id, title: ex.name, text: `\${cantidad} ${ex.name}` })),
    },
  ];
}
const addGutter = gutter({
  class: 'rt-gutter-add',
  lineMarker(view, line) {
    const n = view.state.doc.lineAt(line.from).number - 1;
    const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number - 1;
    return addMarkers[n === view.state.field(hoverLineField) || n === cursorLine ? 1 : 0]!;
  },
  lineMarkerChange: (u) =>
    u.selectionSet || u.transactions.some((tr) => tr.effects.some((e) => e.is(setHoverLine))),
  domEventHandlers: {
    mousemove: (view, _line, event) => trackHover(view, event as MouseEvent),
    mousedown(view, line, event) {
      if (!(event.target as HTMLElement).classList?.contains('rt-add')) return false;
      event.preventDefault();
      view.dispatch({ effects: openInsertMenu.of({ line: view.state.doc.lineAt(line.from).number - 1, origin: 'gutter' }) });
      return true;
    },
  },
});

const indentOf = (text: string) => text.length - text.trimStart().length;
/** Kind of the line a target line is nested under (by indentation), or null at the top level. */
function parentKindOf(view: EditorView, lineNo: number): LineKind | null {
  const doc = view.state.doc;
  const lines = view.state.field(parsedLinesField);
  const target = doc.line(lineNo + 1).text;
  const indent = target.trim() ? indentOf(target) : indentOf(target);
  for (let n = lineNo - 1; n >= 0; n -= 1) {
    const t = doc.line(n + 1).text;
    if (!t.trim()) continue;
    const kind = lines[n]?.kind ?? 'item';
    if (kind === 'comment' || kind === 'note') continue;
    if (indentOf(t) < indent) return kind;
    if (indent === 0) return null;
  }
  return null;
}

const HAS_PLACEHOLDER = /\$\{[^}]*\}/;
/** Placeholders shown as ⟨…⟩ in previews and copy. */
const showPlaceholders = (text: string) => text.replace(/\$\{([^}]*)\}/g, '⟨$1⟩');

/**
 * Put `text` on `lineNo`: replacing it when blank, else on new lines below it,
 * re-indented to match. Text with `${…}` placeholders goes in as a snippet: the
 * first placeholder is selected, Tab moves to the next, typing fills it.
 */
function insertAtLine(view: EditorView, lineNo: number, text: string) {
  const doc = view.state.doc;
  const line = doc.line(Math.min(lineNo + 1, doc.lines));
  const blank = !line.text.trim();
  const indent = ' '.repeat(indentOf(line.text));
  const body = text.replace(/\s+$/, '').split('\n');
  const from = blank ? line.from : line.to;
  const to = line.to;
  if (HAS_PLACEHOLDER.test(text)) {
    // The snippet re-indents every line after the first to match `line`, so
    // only the first line carries the indent itself (or a line break).
    const template = blank ? indent + body.join('\n') : `\n${body.join('\n')}`;
    snippet(template)(view, null, from, to);
    view.focus();
    return;
  }
  const insert = body.map((l) => (l.trim() ? indent + l : '')).join('\n');
  const payload = blank ? insert : `\n${insert}`;
  view.dispatch({
    changes: { from, to, insert: payload },
    selection: { anchor: from + payload.length },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
}

const foldText = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function buildInsertMenu(
  view: EditorView,
  lineNo: number,
  origin: MenuOrigin,
): { dom: HTMLElement; destroy: () => void } {
  const groups = [...builtInGroups(view.state.field(catalogField)), ...view.state.field(insertsField)];
  const { insert } = view.state.field(handlersField);
  const parent = parentKindOf(view, lineNo);
  const nested = parent === 'format' || parent === 'group';
  // Formats and groups nest freely; a whole rutina only fits at the top level.
  const allowed = groups.filter((g) => !nested || g.kind !== 'rutina');
  const dom = document.createElement('div');
  dom.className = 'rt-insert';
  const close = () => {
    menuKeys.delete(view);
    view.dispatch({ effects: openInsertMenu.of(null) });
  };

  // A small three-level navigation: categories → items (searchable) → preview + insert.
  type Screen =
    | { level: 'root'; query: string }
    | { level: 'list'; group: InsertGroup; query: string }
    | { level: 'preview'; group: InsertGroup; item: InsertItem; text: string | null };
  let screen: Screen = allowed.length === 1 ? { level: 'list', group: allowed[0]!, query: '' } : { level: 'root', query: '' };
  let rows: HTMLButtonElement[] = [];
  let active = 0;
  const paint = () => rows.forEach((r, i) => r.classList.toggle('active', i === active));

  const el = (tag: string, cls: string, text?: string, parent: HTMLElement = dom) => {
    const e = document.createElement(tag);
    e.className = cls;
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  };
  const button = (cls: string, parent: HTMLElement, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', onClick);
    parent.appendChild(b);
    return b;
  };
  const header = (title: string, onBack: (() => void) | null) => {
    const h = el('div', 'rt-insert-head');
    if (onBack) {
      const back = button('rt-insert-back', h, onBack);
      back.innerHTML = `${BACK_ICON}<span>Atrás</span>`;
      back.title = 'Atrás (Esc)';
    }
    el('div', 'rt-insert-title', title, h);
  };
  const go = (next: Screen) => {
    screen = next;
    render();
  };
  const back = () => {
    if (screen.level === 'preview') go({ level: 'list', group: screen.group, query: '' });
    else if (screen.level === 'list' && allowed.length > 1) {
      go({ level: 'root', query: '' });
      if (origin === 'line') view.focus();
    } else {
      close();
      view.focus();
    }
  };
  const doInsert = (text: string | null) => {
    close();
    if (text) insertAtLine(view, lineNo, text);
    else view.focus();
  };
  /** Built-in items (rondas, descanso, formatos, ejercicios): insert as they are. */
  const pickDirect = (item: InsertItem) => {
    close();
    insertAtLine(view, lineNo, item.text ?? item.title);
  };
  const choose = (group: InsertGroup, item: InsertItem) => (group.direct ? pickDirect(item) : openPreview(group, item));
  const openPreview = (group: InsertGroup, item: InsertItem) => {
    go({ level: 'preview', group, item, text: null });
    if (group.direct) return;
    insert?.(group.kind as InsertKind, item.id).then((text) => {
      if (screen.level === 'preview' && screen.item.id === item.id) go({ ...screen, text: text ?? '' });
    });
  };

  const render = () => {
    dom.textContent = '';
    rows = [];
    active = 0;
    if (screen.level === 'root' && origin === 'line') {
      // Opened from the line itself: the categories only, focus stays in the
      // editor. Arrows/Enter/Esc drive the menu; any other key closes it and types.
      header('Insertar aquí', null);
      const list = el('div', 'rt-insert-list');
      for (const g of allowed) {
        const b = button('rt-insert-item rt-insert-cat', list, () => go({ level: 'list', group: g, query: '' }));
        b.innerHTML = `<span class="t">${escape(g.title)}</span><span class="n">${g.items.length}</span>${CHEVRON_ICON}`;
        rows.push(b);
      }
      el('div', 'rt-insert-hint', 'o escribe directamente', list);
      // Nothing highlighted until the arrows choose: Enter picks a category only
      // then; otherwise it breaks the line as usual (the menu reopens below).
      active = -1;
      paint();
      let navigated = false;
      menuKeys.set(view, (key) => {
        if (key === 'ArrowDown' || key === 'ArrowUp') {
          if (!rows.length) return true;
          if (active < 0) active = key === 'ArrowDown' ? 0 : rows.length - 1;
          else active = (active + (key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
          navigated = true;
          paint();
          return true;
        }
        if (key === 'Enter') {
          if (!navigated) {
            close();
            return false;
          }
          rows[active]?.click();
          return true;
        }
        if (key === 'Escape') {
          close();
          return true;
        }
        return false;
      });
      return;
    }
    menuKeys.delete(view);
    if (screen.level === 'root') {
      header('Insertar aquí', null);
      // Search across every category; with nothing typed, the categories.
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Buscar rondas, descanso, formato, ejercicio, plantilla…';
      input.className = 'rt-insert-search';
      input.value = screen.query;
      dom.appendChild(input);
      const list = el('div', 'rt-insert-list');
      const fill = () => {
        const q = foldText(input.value.trim());
        list.textContent = '';
        rows = [];
        if (!q) {
          for (const g of allowed) {
            const b = button('rt-insert-item rt-insert-cat', list, () => go({ level: 'list', group: g, query: '' }));
            b.innerHTML = `<span class="t">${escape(g.title)}</span><span class="n">${g.items.length}</span>${CHEVRON_ICON}`;
            rows.push(b);
          }
          if (!allowed.length) el('div', 'rt-insert-empty', 'Nada que insertar aquí.', list);
        } else {
          for (const g of allowed) {
            const items = g.items.filter((it) => foldText(`${it.title} ${it.desc ?? ''}`).includes(q));
            if (!items.length) continue;
            el('div', 'rt-insert-group', g.title, list);
            for (const it of items) {
              const b = button('rt-insert-item', list, () => choose(g, it));
              b.innerHTML = `<span class="t">${escape(it.title)}</span>${it.desc ? `<span class="d">${escape(it.desc)}</span>` : ''}`;
              rows.push(b);
            }
          }
          if (!rows.length) el('div', 'rt-insert-empty', 'Nada con ese nombre.', list);
        }
        active = 0;
        paint();
      };
      input.addEventListener('input', () => {
        if (screen.level === 'root') screen.query = input.value;
        fill();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!rows.length) return;
          active = (active + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
          paint();
          rows[active]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          rows[active]?.click();
        }
      });
      fill();
      window.setTimeout(() => input.focus(), 0);
      return;
    }
    if (screen.level === 'list') {
      const { group } = screen;
      header(group.title, back);
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = `Buscar en ${group.title.toLowerCase()}…`;
      input.className = 'rt-insert-search';
      input.value = screen.query;
      dom.appendChild(input);
      const list = el('div', 'rt-insert-list');
      const fill = () => {
        const q = foldText(input.value.trim());
        list.textContent = '';
        rows = [];
        const items = group.items.filter((it) => !q || foldText(`${it.title} ${it.desc ?? ''}`).includes(q));
        for (const it of items) {
          const b = button('rt-insert-item', list, () => choose(group, it));
          b.innerHTML = `<span class="t">${escape(it.title)}</span>${it.desc ? `<span class="d">${escape(it.desc)}</span>` : ''}`;
          rows.push(b);
        }
        if (!rows.length) el('div', 'rt-insert-empty', group.items.length ? 'Nada con ese nombre.' : 'Todavía no hay nada aquí.', list);
        active = 0;
        paint();
      };
      input.addEventListener('input', () => {
        if (screen.level === 'list') screen.query = input.value;
        fill();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!rows.length) return;
          active = (active + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
          paint();
          rows[active]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          rows[active]?.click();
        }
      });
      fill();
      window.setTimeout(() => input.focus(), 0);
      return;
    }
    // preview
    const { item, text } = screen;
    header(item.title, back);
    if (item.desc) el('div', 'rt-insert-desc', item.desc);
    const pre = el('pre', 'rt-insert-preview', text == null ? 'Cargando…' : showPlaceholders(text.replace(/\s+$/, '')) || '(vacío)');
    if (text == null) pre.classList.add('loading');
    const actions = el('div', 'rt-insert-actions');
    const ok = button('rt-insert-go', actions, () => doInsert(text));
    ok.textContent = nested ? 'Insertar aquí' : 'Insertar';
    ok.disabled = text == null;
    window.setTimeout(() => ok.focus(), 0);
  };

  dom.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      back();
    } else if (screen.level === 'preview' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      if (!rows.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      paint();
      rows[active]?.focus();
    }
  });
  const onDocDown = (e: MouseEvent) => {
    if (!dom.contains(e.target as Node)) close();
  };
  window.setTimeout(() => document.addEventListener('mousedown', onDocDown), 0);
  render();
  return {
    dom,
    destroy: () => {
      document.removeEventListener('mousedown', onDocDown);
      menuKeys.delete(view);
    },
  };
}

const insertMenuField = StateField.define<Tooltip | null>({
  create: () => null,
  update(v, tr) {
    let next = v;
    for (const e of tr.effects) {
      if (e.is(openInsertMenu)) {
        if (e.value == null || e.value.line >= tr.state.doc.lines) next = null;
        else {
          const { line: lineNo, origin } = e.value;
          next = {
            pos: tr.state.doc.line(lineNo + 1).from,
            above: false,
            arrow: false,
            create: (view) => {
              const { dom, destroy } = buildInsertMenu(view, lineNo, origin);
              return { dom, destroy, offset: { x: origin === 'gutter' ? -20 : 0, y: 4 } };
            },
          };
        }
      }
    }
    return tr.docChanged ? null : next;
  },
  provide: (f) => showTooltip.from(f),
});

// --- Token colouring (numbers, loads, tempo, modifiers, notes) ---------------
// "# comentario" runs to the end of the line; "// nota" (athlete) runs up to it.
const TOKENS: { re: RegExp; cls: string }[] = [
  { re: /#.*$/g, cls: 'rt-tail-comment' },
  { re: /\/\/[^#]*/g, cls: 'rt-tail' },
  { re: /\btempo\s*:?\s*[0-9xX][-/. ]?[0-9xX][-/. ]?[0-9xX][-/. ]?[0-9xX]\b/gi, cls: 'rt-tempo' },
  { re: /[@+]\s*(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*(?:kg|lb|lbs|%)?|rpe\s*\d+(?:\.\d+)?|corporal|bw)/gi, cls: 'rt-load' },
  { re: /\b(?:c\/(?:lado|u|l)|por lado|cada lado|desc(?:anso)?\s+\S+|rest\s+\S+)/gi, cls: 'rt-mod' },
  { re: /\b\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+)?\s*(?:s|seg|min|m|km|reps?|rondas?)?\b/gi, cls: 'rt-num' },
];
const tokenMarks: Record<string, Decoration> = Object.fromEntries(
  TOKENS.map((t) => [t.cls, Decoration.mark({ class: t.cls })]),
);
function tokenDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const taken: [number, number][] = [];
      const free = (a: number, b: number) => taken.every(([x, y]) => b <= x || a >= y);
      for (const t of TOKENS) {
        t.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = t.re.exec(line.text))) {
          if (!m[0]) {
            t.re.lastIndex += 1;
            continue;
          }
          const a = line.from + m.index;
          const b = a + m[0].length;
          if (free(a, b)) {
            taken.push([a, b]);
            ranges.push(tokenMarks[t.cls]!.range(a, b));
          }
        }
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}
const tokenPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = tokenDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = tokenDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// --- Theme (VS Code dark) ----------------------------------------------------
const ERROR_MARK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='7' fill='%23d1502a'/%3E%3Cpath d='M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6' stroke='%23fff' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E\")";
const WARN_MARK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1.5l7 12.5H1z' fill='%23d9a21b'/%3E%3Cpath d='M8 6v4' stroke='%23fff' stroke-width='1.8' stroke-linecap='round'/%3E%3Ccircle cx='8' cy='12' r='1' fill='%23fff'/%3E%3C/svg%3E\")";

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13.5px', backgroundColor: 'var(--color-surface)', color: 'var(--color-ink)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': { padding: '10px 16px 40vh 8px', caretColor: 'var(--color-accent)' },
  '.cm-line': { padding: '0 2px' },
  '&.cm-focused': { outline: 'none' },
  // Recognised exercises read as links: a dotted underline and a pointer on
  // hover; a click opens the exercise for editing.
  '.rt-ex': { textUnderlineOffset: '3px' },
  '.rt-ex:hover': { cursor: 'pointer', textDecoration: 'underline', color: 'var(--color-accent-dark)' },
  '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.03)' },
  '.rt-line-error': { backgroundColor: 'rgba(229, 20, 0, 0.06)' },
  '.rt-line-warn': { backgroundColor: 'rgba(191, 136, 3, 0.07)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--color-faint)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 4px', minWidth: '28px' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-ink-2)' },
  '.rt-gutter-diag': { width: '16px' },
  '.rt-gutter-diag .cm-gutterElement': { padding: '0 0 0 3px' },
  '.rt-mark': { width: '13px', height: '13px', marginTop: '5px', backgroundSize: '13px 13px', cursor: 'pointer' },
  '.rt-mark-error': { backgroundImage: ERROR_MARK },
  '.rt-mark-warning': { backgroundImage: WARN_MARK },
  '.cm-placeholder': { color: 'var(--color-faint)', fontStyle: 'normal' },
  // line kinds (VS Code Light+ palette)
  '.rt-format': { color: '#0451a5', fontWeight: '600' },
  '.rt-section': { color: 'var(--color-accent)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' },
  '.rt-group': { color: '#795e26', fontWeight: '600' },
  '.rt-rest': { color: '#267f99', fontStyle: 'italic' },
  '.rt-comment': { color: '#008000' },
  // tokens
  '.rt-num': { color: '#098658' },
  '.rt-load': { color: '#a31515' },
  '.rt-tempo': { color: '#267f99' },
  '.rt-mod': { color: '#001080' },
  // "// nota" (athlete) is teal, "# comentario" (internal) green; a line's kind wins over the token.
  '.rt-tail': { color: '#0b7285', fontStyle: 'italic' },
  '.rt-tail-comment': { color: '#008000', fontStyle: 'italic' },
  '.rt-notes': { color: '#0b7285', fontStyle: 'italic' },
  // "+" gutter
  '.rt-gutter-add': { width: '16px' },
  '.rt-gutter-add .cm-gutterElement': { padding: '0 0 0 2px' },
  '.rt-add': {
    width: '14px',
    height: '16px',
    marginTop: '3px',
    borderRadius: '4px',
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',
    lineHeight: '16px',
    textAlign: 'center',
    color: 'var(--color-muted)',
    cursor: 'pointer',
    opacity: '0',
    userSelect: 'none',
  },
  '.rt-add.hot': { opacity: '1' },
  '.rt-add:hover': { backgroundColor: 'var(--color-accent-tint)', color: 'var(--color-accent-dark)' },
  // Insert menu
  '.rt-insert': { width: '340px', padding: '6px', fontFamily: 'var(--font-sans)' },
  '.rt-insert-search': {
    width: '100%',
    boxSizing: 'border-box',
    padding: '7px 10px',
    border: '1px solid var(--color-line-2)',
    borderRadius: '8px',
    background: 'var(--color-surface-2)',
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
    color: 'var(--color-ink)',
    outline: 'none',
  },
  '.rt-insert-search:focus': { borderColor: 'var(--color-accent)' },
  '.rt-insert-list': { maxHeight: '300px', overflowY: 'auto', marginTop: '4px' },
  '.rt-insert-group': {
    padding: '8px 8px 3px',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-muted)',
  },
  '.rt-insert-item': {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '1px',
    width: '100%',
    textAlign: 'left',
    padding: '6px 8px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
  },
  '.rt-insert-item .t': { fontSize: '13px', fontWeight: '600', color: 'var(--color-ink)' },
  '.rt-insert-item .d': { fontSize: '12px', color: 'var(--color-muted)', lineHeight: '1.3' },
  '.rt-insert-item:hover, .rt-insert-item.active': { background: 'var(--color-accent-tint)' },
  '.rt-insert-empty': { padding: '10px 8px', fontSize: '12px', color: 'var(--color-muted)' },
  '.rt-insert-hint': { padding: '6px 10px 2px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-faint)' },
  '.rt-insert-head': { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 4px 6px' },
  '.rt-insert-back': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '3px 7px 3px 4px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-accent-dark)',
    cursor: 'pointer',
  },
  '.rt-insert-back:hover': { background: 'var(--color-accent-tint)' },
  '.rt-insert-title': {
    flex: '1',
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '0 4px',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-muted)',
  },
  '.rt-insert-cat': { flexDirection: 'row', alignItems: 'center', gap: '8px', padding: '8px 10px' },
  '.rt-insert-cat .t': { flex: '1' },
  '.rt-insert-cat .n': { fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-muted)' },
  '.rt-insert-cat .c': { color: 'var(--color-faint-2)' },
  '.rt-insert-item:focus': { outline: 'none', background: 'var(--color-accent-tint)' },
  '.rt-insert-desc': { padding: '0 8px 8px', fontSize: '12px', lineHeight: '1.4', color: 'var(--color-muted)' },
  '.rt-insert-preview': {
    margin: '0 4px',
    maxHeight: '260px',
    overflow: 'auto',
    padding: '8px 10px',
    borderRadius: '8px',
    background: 'var(--color-surface-2)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    lineHeight: '1.6',
    color: 'var(--color-ink-2)',
    whiteSpace: 'pre',
  },
  '.rt-insert-preview.loading': { color: 'var(--color-muted)', fontStyle: 'italic' },
  '.rt-insert-actions': { display: 'flex', justifyContent: 'flex-end', padding: '8px 4px 2px' },
  '.rt-insert-go': {
    padding: '7px 14px',
    border: 'none',
    borderRadius: '8px',
    background: 'var(--color-accent)',
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
    fontWeight: '700',
    color: '#fff',
    cursor: 'pointer',
  },
  '.rt-insert-go:hover': { filter: 'brightness(0.95)' },
  '.rt-insert-go:disabled': { opacity: '0.5', cursor: 'default' },
  '.rt-insert-go:focus': { outline: '2px solid var(--color-accent-tint)' },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy #e51400',
    textUnderlineOffset: '3px',
  },
  '.cm-lintRange-warning': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy #bf8803',
    textUnderlineOffset: '3px',
  },
  '.cm-lintRange-info': {
    backgroundImage: 'none',
    textDecoration: 'underline dotted var(--color-muted)',
    textUnderlineOffset: '3px',
  },
  // tooltips
  // Snippet placeholders: a soft chip the author overwrites; the active one is outlined.
  '.cm-snippetField': {
    backgroundColor: 'var(--color-accent-tint)',
    borderRadius: '4px',
    boxShadow: '0 0 0 1px var(--color-line-2) inset',
    padding: '0 2px',
  },
  '.cm-snippetFieldPosition': { borderLeft: '1.4px dotted var(--color-accent)' },
  '.cm-tooltip': {
    border: '1px solid var(--color-line-2)',
    borderRadius: '10px',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-ink)',
    boxShadow: '0 12px 32px -10px rgba(0,0,0,0.25)',
    fontFamily: 'var(--font-sans)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
    maxHeight: '320px',
    minWidth: '300px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '5px 10px',
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--color-accent-tint)',
    color: 'var(--color-ink)',
  },
  '.cm-completionLabel': { fontWeight: '600' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > completion-section': {
    display: 'block',
    padding: '7px 10px 2px',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-muted)',
  },
  '.cm-completionDetail': {
    marginLeft: 'auto',
    fontStyle: 'normal',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--color-muted)',
  },
  // Diagnostic card
  '.rt-diag': { minWidth: '240px', maxWidth: '380px', padding: '4px', fontFamily: 'var(--font-sans)' },
  '.rt-diag-top': { background: 'var(--color-surface-2)', borderRadius: '8px', padding: '4px' },
  '.rt-diag-label': {
    padding: '3px 8px 1px',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-muted)',
  },
  '.rt-diag-label.error': { color: 'var(--color-accent-dark)' },
  '.rt-diag-msg': { padding: '2px 8px 5px', fontSize: '13px', color: 'var(--color-ink-2)', lineHeight: '1.4' },
  '.rt-diag-name': { padding: '2px 8px 0', fontSize: '15px', fontWeight: '700', color: 'var(--color-ink)' },
  '.rt-diag-action kbd': {
    marginLeft: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--color-muted)',
    letterSpacing: '0.04em',
  },
  '.rt-diag-sugg': {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '4px 8px',
    border: 'none',
    borderRadius: '7px',
    background: 'transparent',
    fontFamily: 'var(--font-sans)',
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--color-accent-dark)',
    cursor: 'pointer',
  },
  '.rt-diag-sugg:hover': { background: 'var(--color-accent-tint)' },
  '.rt-diag-sep': { height: '1px', margin: '4px 4px', background: 'var(--color-line-3)' },
  '.rt-diag-action': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    textAlign: 'left',
    padding: '6px 8px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
    color: 'var(--color-ink-2)',
    cursor: 'pointer',
  },
  '.rt-diag-action:hover': { background: 'var(--color-surface-2)', color: 'var(--color-ink)' },
  '.rt-diag-action svg': { color: 'var(--color-accent)' },
  // Selection action
  '.rt-selection-tip': { padding: '3px' },
  '.rt-selection-tip button': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'transparent',
    color: 'var(--color-accent-dark)',
    border: 'none',
    borderRadius: '7px',
    padding: '5px 9px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
  },
  '.rt-selection-tip button:hover': { backgroundColor: 'var(--color-accent-tint)' },
});

// --- Component ---------------------------------------------------------------
export function RutinaTextEditor({
  value,
  onChange,
  catalog,
  parsed,
  onCreateExercise,
  extras,
  inserts,
  onInsertBlock,
  onSaveBlock,
  onEditExercise,
  apiRef,
  placeholder,
  autoFocus,
  className,
}: RutinaTextEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Latest props for the extensions, which are created once.
  const catalogRef = useRef(catalog);
  const parsedRef = useRef(parsed);
  const onChangeRef = useRef(onChange);
  const onCreateRef = useRef(onCreateExercise);
  const extrasRef = useRef(extras);
  const onInsertRef = useRef(onInsertBlock);
  const onSaveRef = useRef(onSaveBlock);
  const onEditRef = useRef(onEditExercise);
  catalogRef.current = catalog;
  parsedRef.current = parsed;
  onChangeRef.current = onChange;
  onCreateRef.current = onCreateExercise;
  extrasRef.current = extras;
  onInsertRef.current = onInsertBlock;
  onSaveRef.current = onSaveBlock;
  onEditRef.current = onEditExercise;

  useEffect(() => {
    if (!host.current) return;

    // Insert a saved block / rutina as whole lines at [from, to).
    const insertBlock = (view: EditorView, kind: InsertKind, id: string, from: number, to: number) => {
      onInsertRef.current?.(kind, id).then((text) => {
        if (!text) return;
        const body = text.replace(/\s+$/, '');
        const line = view.state.doc.lineAt(from);
        // Re-indent to match the line the suggestion was typed on.
        const indent = line.text.match(/^\s*/)?.[0] ?? '';
        const insert = body
          .split('\n')
          .map((l, i) => (i === 0 ? l : indent + l))
          .join('\n');
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
          scrollIntoView: true,
          userEvent: 'input',
        });
      });
    };

    // The popup groups its rows like the "+" menu does, in this order.
    const SECTION: Partial<Record<string, { name: string; rank: number }>> = {
      group: { name: 'Estructura', rank: 1 },
      keyword: { name: 'Estructura', rank: 1 },
      section: { name: 'Estructura', rank: 1 },
      format: { name: 'Formatos', rank: 2 },
      exercise: { name: 'Ejercicios', rank: 3 },
      template: { name: 'Plantillas', rank: 4 },
      block: { name: 'Bloques reutilizables', rank: 5 },
      rutina: { name: 'Rutinas', rank: 6 },
      create: { name: 'Nuevo', rank: 7 },
    };
    const source = (ctx: CompletionContext): CompletionResult | null => {
      // A blank line is the insert menu's job (opened by Enter or a click);
      // the popup starts once something is typed, or on Ctrl-Space.
      const line = ctx.state.doc.lineAt(ctx.pos);
      if (!line.text.slice(0, ctx.pos - line.from).trim()) return null;
      const r = completionsAt(ctx.state.doc.toString(), ctx.pos, catalogRef.current, {
        explicit: ctx.explicit,
        extras: extrasRef.current,
        // Sections are edited in their own tabs; no header suggestions.
        sections: false,
        // Formats, rondas, descansos, plantillas, bloques y rutinas live in the
        // "+" menu; the popup is for exercises and what follows them.
        structure: false,
      });
      if (!r || !r.options.length) return null;
      return {
        from: r.from,
        to: r.to,
        filter: false,
        options: r.options.map((o) => ({
          label: o.label,
          detail: o.detail,
          type: o.type,
          section: SECTION[o.type],
          // "Crear ejercicio" opens the create dialog and leaves the text as typed;
          // blocks and rutinas are fetched and inserted whole.
          apply:
            o.type === 'create'
              ? () => onCreateRef.current?.(o.apply)
              : o.type === 'block' || o.type === 'rutina' || o.type === 'template'
                ? (view: EditorView, _c: unknown, from: number, to: number) =>
                    insertBlock(view, o.type as InsertKind, o.apply, from, to)
                : o.apply,
        })),
      };
    };

    if (apiRef) {
      apiRef.current = {
        undo: () => {
          if (viewRef.current) {
            undo(viewRef.current);
            viewRef.current.focus();
          }
        },
        redo: () => {
          if (viewRef.current) {
            redo(viewRef.current);
            viewRef.current.focus();
          }
        },
        canUndo: () => (viewRef.current ? undoDepth(viewRef.current.state) > 0 : false),
        canRedo: () => (viewRef.current ? redoDepth(viewRef.current.state) > 0 : false),
        selectionOrBlock: () => {
          const view = viewRef.current;
          if (!view) return '';
          const sel = view.state.selection.main;
          if (!sel.empty) return view.state.sliceDoc(sel.from, sel.to);
          // The block at the cursor, from the parse: a group header plus its
          // indented lines, or a single loose line.
          const doc = view.state.doc;
          const lines = parsedRef.current.lines;
          const cur = doc.lineAt(sel.head).number; // 1-based
          const kindOf = (n: number) => lines[n - 1]?.kind ?? 'blank';
          const ind = (n: number) => doc.line(n).text.length - doc.line(n).text.trimStart().length;
          if (kindOf(cur) === 'blank' || kindOf(cur) === 'comment') return '';
          // Climb to the group header that owns this line (a shallower group
          // line in the same run); a shallower non-group line means no group.
          let start = cur;
          if (kindOf(cur) !== 'group') {
            let n = cur;
            while (n > 1 && kindOf(n - 1) !== 'blank' && kindOf(n - 1) !== 'section') {
              n -= 1;
              if (ind(n) < ind(cur)) {
                if (kindOf(n) === 'group') start = n;
                break;
              }
            }
          }
          let end = start;
          if (kindOf(start) === 'group') {
            while (end < doc.lines && ['item', 'rest'].includes(kindOf(end + 1)) && ind(end + 1) > ind(start)) end += 1;
          }
          return doc.sliceString(doc.line(start).from, doc.line(end).to);
        },
      };
    }

    // Enter: after a section / format / group header, indent the next line one
    // level; on an empty indented line, dedent one level in place (so each
    // Enter climbs out of one container, like leaving a Python block);
    // otherwise keep the current indentation.
    /** The line-opened menu: everything that can go on the (blank) cursor line. */
    const openMenuAtCursor = (view: EditorView) => {
      const line = view.state.doc.lineAt(view.state.selection.main.head).number - 1;
      view.dispatch({ effects: openInsertMenu.of({ line, origin: 'line' }) });
    };
    const smartEnter = (view: EditorView) => {
      const { state } = view;
      const sel = state.selection.main;
      if (!sel.empty) return false;
      const line = state.doc.lineAt(sel.head);
      const info = parsedRef.current.lines[line.number - 1];
      const indent = line.text.match(/^\s*/)?.[0] ?? '';
      const atEnd = sel.head === line.to;
      if (line.text.trim() === '' && indent) {
        const less = indent.slice(0, Math.max(0, indent.length - 2));
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: less },
          selection: { anchor: line.from + less.length },
          userEvent: 'input.type',
        });
        openMenuAtCursor(view);
        return true;
      }
      let insert: string;
      const from = sel.head;
      if (atEnd && (info?.kind === 'group' || info?.kind === 'section' || info?.kind === 'format'))
        insert = `\n${indent}  `;
      else insert = `\n${atEnd ? indent : ''}`;
      view.dispatch({
        changes: { from, to: sel.head, insert },
        selection: { anchor: from + insert.length },
        scrollIntoView: true,
        userEvent: 'input.type',
      });
      // Show what can go on the new line right away.
      openMenuAtCursor(view);
      return true;
    };

    // With the popup open: Enter accepts only when something was typed on the
    // line (on an empty line it just breaks the line), Tab always accepts.
    const typedOnLine = (view: EditorView) => {
      const sel = view.state.selection.main;
      const line = view.state.doc.lineAt(sel.head);
      return line.text.slice(0, sel.head - line.from).trim() !== '';
    };
    const enterKey = (view: EditorView) => {
      if (completionStatus(view.state) === 'active' && typedOnLine(view)) return acceptCompletion(view);
      if (completionStatus(view.state) === 'active') closeCompletion(view);
      return smartEnter(view);
    };
    // Tab accepts a suggestion only when something was typed on the line;
    // on a blank line it indents one level (even with the popup open).
    const tabKey = (view: EditorView) => {
      if (completionStatus(view.state) === 'active' && typedOnLine(view)) return acceptCompletion(view);
      // Inside an inserted snippet, Tab walks its placeholders.
      if (hasNextSnippetField(view.state)) return nextSnippetField(view);
      return indentMore(view);
    };
    const shiftTabKey = (view: EditorView) => (hasPrevSnippetField(view.state) ? prevSnippetField(view) : indentLess(view));
    // Backspace inside the leading whitespace removes a whole level (2 spaces),
    // so the cursor always lands on a level boundary.
    const backspaceKey = (view: EditorView) => {
      const sel = view.state.selection.main;
      if (!sel.empty) return false;
      const line = view.state.doc.lineAt(sel.head);
      const before = line.text.slice(0, sel.head - line.from);
      if (!before.length || before.trim() !== '') return false;
      const remove = before.length % 2 === 0 ? 2 : 1;
      view.dispatch({
        changes: { from: sel.head - remove, to: sel.head, insert: '' },
        selection: { anchor: sel.head - remove },
        userEvent: 'delete',
      });
      return true;
    };

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          indentUnit.of('  '),
          handlersField,
          exerciseRefsField,
          exerciseLinks,
          diagsField,
          catalogField,
          parsedLinesField,
          insertsField,
          hoverLineField,
          hoverTracker,
          addGutter,
          insertMenuField,
          diagGutter,
          gutterTipField,
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          tokenPlugin,
          // Underlines come from setDiagnostics; the built-in hover card is
          // replaced by ours (hover on the text, on the gutter mark, or select).
          linter(null, { tooltipFilter: () => [] }),
          diagLineField,
          lineKindPlugin,
          theme,
          EditorView.lineWrapping,
          cmPlaceholder(placeholder ?? ''),
          closeBrackets(),
          autocompletion({
            override: [source],
            icons: false,
            activateOnTyping: true,
            defaultKeymap: false,
          }),
          selectionTooltip,
          hoverCard,
          Prec.highest(
            keymap.of([
              // The line-opened menu takes these while it is at its root.
              ...(['ArrowDown', 'ArrowUp', 'Enter', 'Escape'] as const).map((key) => ({
                key,
                run: (view: EditorView) => menuKeys.get(view)?.(key) ?? false,
              })),
              { key: 'Enter', run: enterKey },
              { key: 'Tab', run: tabKey },
              { key: 'Shift-Tab', run: shiftTabKey },
              { key: 'Backspace', run: backspaceKey },
              { key: 'Escape', run: closeCompletion },
              { key: 'ArrowDown', run: moveCompletionSelection(true) },
              { key: 'ArrowUp', run: moveCompletionSelection(false) },
              { key: 'PageDown', run: moveCompletionSelection(true, 'page') },
              { key: 'PageUp', run: moveCompletionSelection(false, 'page') },
              {
                key: 'Ctrl-Space',
                run: (view: EditorView) => {
                  const line = view.state.doc.lineAt(view.state.selection.main.head);
                  if (line.text.trim()) return startCompletion(view);
                  openMenuAtCursor(view);
                  return true;
                },
              },
            ]),
          ),
          keymap.of([...historyKeymap, ...lintKeymap, ...defaultKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
            // A click that lands on a blank line opens the suggestions, like Enter does.
            if (
              u.selectionSet &&
              !u.docChanged &&
              u.transactions.some((tr) => tr.isUserEvent('select.pointer')) &&
              u.state.selection.main.empty &&
              !u.state.doc.lineAt(u.state.selection.main.head).text.trim() &&
              completionStatus(u.state) !== 'active' &&
              !u.state.field(insertMenuField)
            ) {
              window.setTimeout(() => openMenuAtCursor(u.view), 0);
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.dispatch({ effects: setCatalog.of(catalogRef.current) });
    view.dispatch({
      effects: setHandlers.of({
        create: onCreateRef.current ? (n) => onCreateRef.current?.(n) : null,
        save: onSaveRef.current ? (t) => onSaveRef.current?.(t) : null,
        insert: (k, id) => onInsertRef.current?.(k, id) ?? Promise.resolve(null),
        edit: onEditRef.current ? (id) => onEditRef.current?.(id) : null,
      }),
    });
    if (autoFocus) view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is created once; later prop changes are pushed via effects below.
  }, []);

  // External value changes (import, reset) → replace the document.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // Diagnostics + line kinds follow the parse result.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    const diags: CmDiagnostic[] = [];
    for (const d of parsed.diagnostics) {
      if (d.line >= doc.lines) continue;
      const line = doc.line(d.line + 1);
      const from = Math.min(line.from + d.from, line.to);
      const to = Math.max(from, Math.min(line.from + d.to, line.to));
      diags.push({
        from,
        to: to === from ? line.to : to,
        severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
        message: d.message,
      });
    }
    view.dispatch(setDiagnostics(view.state, diags), {
      effects: [setParsedDiags.of(parsed.diagnostics), setParsedLines.of(parsed.lines), setExerciseRefs.of(collectExerciseRefs(parsed.blocks))],
    });
  }, [parsed]);

  // The "+" menu's contents follow the lists loaded by the form, and the catalog.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setInserts.of(inserts ?? []) });
  }, [inserts]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setCatalog.of(catalog) });
  }, [catalog]);

  return <div ref={host} className={className} />;
}

/** Move the cursor to a 0-based line and focus the editor (used by the diagnostics list). */
export function focusLine(host: HTMLElement | null, line: number) {
  const cm = host?.querySelector('.cm-content') as (HTMLElement & { cmView?: { view: EditorView } }) | null;
  const view = cm?.cmView?.view;
  if (!view) return;
  const l = view.state.doc.line(Math.min(line + 1, view.state.doc.lines));
  view.dispatch({ selection: { anchor: l.to }, scrollIntoView: true });
  view.focus();
}
