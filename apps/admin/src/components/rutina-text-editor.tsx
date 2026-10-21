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
  moveCompletionSelection,
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
  type ParsedRutina,
} from '@dmtx/core';

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
  /** Saved blocks / other rutinas offered as whole-line suggestions. */
  extras?: CompletionExtra[];
  /** Resolves the text to insert for a `snippet` / `rutina` suggestion. */
  onInsertBlock?: (kind: 'snippet' | 'rutina', id: string) => Promise<string | null>;
  /** Shown as a floating action when two or more lines are selected. */
  onSaveBlock?: (text: string) => void;
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
}
const setHandlers = StateEffect.define<Handlers>();
const handlersField = StateField.define<Handlers>({
  create: () => ({ create: null, save: null }),
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setHandlers)) return e.value;
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
        button('rt-diag-action', `${PLUS_ICON}<span>Crear ejercicio "${escape(raw)}"</span>`, () => create(raw));
      }
    } else if (d.code === 'ambiguous_exercise') {
      el('div', 'rt-diag-label', 'Varias coincidencias · elige', top);
      for (const name of d.suggestions ?? []) button('rt-diag-sugg', escape(name), replaceWith(name), top);
    } else {
      el('div', `rt-diag-label${d.severity === 'error' ? ' error' : ''}`, d.severity === 'error' ? 'Error' : 'Aviso', top);
      el('div', 'rt-diag-msg', d.message, top);
    }
  });
  return dom;
}

// Hover: the card for the diagnostic under the pointer.
const hoverCard = hoverTooltip(
  (view, pos): Tooltip | null => {
    const hit = diagnosticsAt(view.state, pos);
    if (!hit) return null;
    return {
      pos: hit.from,
      end: hit.to,
      above: false,
      create: () => ({ dom: buildCard(view, hit.diags, hit.from, hit.to) }),
    };
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
        create: () => {
          const dom = document.createElement('div');
          dom.className = 'rt-selection-tip';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.innerHTML = `${BOOKMARK_ICON}<span>Guardar como bloque</span>`;
          btn.addEventListener('mousedown', (e) => e.preventDefault());
          btn.addEventListener('click', () => save(text));
          dom.appendChild(btn);
          return { dom, offset: { x: 0, y: 6 } };
        },
      };
    }
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

// --- Token colouring (numbers, loads, tempo, modifiers, notes) ---------------
const TOKENS: { re: RegExp; cls: string }[] = [
  { re: /\/\/.*$/g, cls: 'rt-note' },
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
  '.rt-note': { color: '#008000', fontStyle: 'italic' },
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
  '.cm-lintRange-info': { backgroundImage: 'none' },
  // tooltips
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
    maxHeight: '260px',
    minWidth: '280px',
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
  onInsertBlock,
  onSaveBlock,
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
  catalogRef.current = catalog;
  parsedRef.current = parsed;
  onChangeRef.current = onChange;
  onCreateRef.current = onCreateExercise;
  extrasRef.current = extras;
  onInsertRef.current = onInsertBlock;
  onSaveRef.current = onSaveBlock;

  useEffect(() => {
    if (!host.current) return;

    // Insert a saved block / rutina as whole lines at [from, to).
    const insertBlock = (view: EditorView, kind: 'snippet' | 'rutina', id: string, from: number, to: number) => {
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

    const source = (ctx: CompletionContext): CompletionResult | null => {
      const r = completionsAt(ctx.state.doc.toString(), ctx.pos, catalogRef.current, {
        explicit: ctx.explicit,
        extras: extrasRef.current,
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
          // "Crear ejercicio" opens the create dialog and leaves the text as typed;
          // blocks and rutinas are fetched and inserted whole.
          apply:
            o.type === 'create'
              ? () => onCreateRef.current?.(o.apply)
              : o.type === 'snippet' || o.type === 'rutina'
                ? (view: EditorView, _c: unknown, from: number, to: number) =>
                    insertBlock(view, o.type as 'snippet' | 'rutina', o.apply, from, to)
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
        startCompletion(view);
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
      startCompletion(view);
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
    const tabKey = (view: EditorView) => {
      if (completionStatus(view.state) === 'active') return acceptCompletion(view);
      return indentMore(view);
    };

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          indentUnit.of('  '),
          handlersField,
          diagsField,
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
              { key: 'Enter', run: enterKey },
              { key: 'Tab', run: tabKey },
              { key: 'Shift-Tab', run: indentLess },
              { key: 'Escape', run: closeCompletion },
              { key: 'ArrowDown', run: moveCompletionSelection(true) },
              { key: 'ArrowUp', run: moveCompletionSelection(false) },
              { key: 'PageDown', run: moveCompletionSelection(true, 'page') },
              { key: 'PageUp', run: moveCompletionSelection(false, 'page') },
              { key: 'Ctrl-Space', run: startCompletion },
            ]),
          ),
          keymap.of([...historyKeymap, ...lintKeymap, ...defaultKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.dispatch({
      effects: setHandlers.of({
        create: onCreateRef.current ? (n) => onCreateRef.current?.(n) : null,
        save: onSaveRef.current ? (t) => onSaveRef.current?.(t) : null,
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
      effects: [setParsedDiags.of(parsed.diagnostics)],
    });
  }, [parsed]);

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
