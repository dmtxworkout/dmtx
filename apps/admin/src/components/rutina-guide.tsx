'use client';
// The editor's guide: static examples coloured like the editor and short
// animated scenes for the things you do
// with the mouse (the "+" menu, the error card, editing an exercise, the
// placeholders). Everything is rendered, nothing is a screenshot, so it never
// goes stale.
import { Children, cloneElement, createContext, isValidElement, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Catalog, parseRutina } from '@dmtx/core';
import { cn } from '@/lib/utils';

// A small catalog so the examples resolve (and one archived exercise for the warning).
const DEMO_CATALOG = new Catalog([
  { id: 'g-sq', name: 'Sentadilla', aliases: ['sentadillas', 'squat'] },
  { id: 'g-pu', name: 'Flexión', aliases: ['flexiones', 'push up', 'push ups'] },
  { id: 'g-bu', name: 'Burpee', aliases: ['burpees'] },
  { id: 'g-pl', name: 'Dominada', aliases: ['dominadas', 'pull up'] },
  { id: 'g-pk', name: 'Plancha', aliases: ['plank'] },
  { id: 'g-ru', name: 'Correr', aliases: ['carrera', 'run'] },
  { id: 'g-ro', name: 'Remo', aliases: ['row'] },
  { id: 'g-lu', name: 'Zancada', aliases: ['zancadas', 'lunge'] },
  { id: 'g-hs', name: 'Handstand', aliases: ['parada de manos'], archived: true },
]);

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// --- Search highlighting ---------------------------------------------------------

/** The folded search text; components deep in a section mark it in their own copy. */
const MarkCtx = createContext('');

/** Fold a string character by character so offsets line up with the original. */
const foldChars = (str: string) => [...str].map((c) => fold(c)[0] ?? c).join('');

/** `text` with every occurrence of the folded query `q` wrapped in <mark>. */
function marked(text: string, q: string): ReactNode {
  if (!q) return text;
  const folded = foldChars(text);
  let at = folded.indexOf(q);
  if (at < 0) return text;
  const parts: ReactNode[] = [];
  let i = 0;
  while (at >= 0) {
    if (at > i) parts.push(text.slice(i, at));
    parts.push(
      <mark key={at} className="rounded-[2px] bg-[#ffe58a] px-0.5 text-ink">
        {text.slice(at, at + q.length)}
      </mark>,
    );
    i = at + q.length;
    at = folded.indexOf(q, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}

function Mark({ text }: { text: string }) {
  return <>{marked(text, useContext(MarkCtx))}</>;
}

// --- Example: the text as the editor shows it ---------------------------------

const LINE_CLASS: Record<string, string> = {
  format: 'font-semibold text-[#0451a5]',
  section: 'font-bold uppercase tracking-[0.08em] text-accent',
  group: 'font-semibold text-[#795e26]',
  rest: 'italic text-[#267f99]',
  comment: 'text-[#008000]',
  note: 'text-[#008000]',
};

/** A line of rutina text with the editor's colours: numbers, loads, tempo and notes tinted. */
function Tokens({ text }: { text: string }) {
  const q = useContext(MarkCtx);
  const parts = text.split(/(\/\/.*$|@\S+(?:\s*(?:kg|lb))?|tempo \S+|\b\d+(?:[.,]\d+)?(?:\s*(?:x|×)\s*\d+)?(?:\s*(?:min|s|m|km|reps))?\b)/);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        const m = marked(p, q);
        if (p.startsWith('//')) return <span key={i} className="italic text-[#008000]">{m}</span>;
        if (p.startsWith('@')) return <span key={i} className="text-[#a31515]">{m}</span>;
        if (p.startsWith('tempo')) return <span key={i} className="text-[#267f99]">{m}</span>;
        if (/^\d/.test(p)) return <span key={i} className="text-[#098658]">{m}</span>;
        return <span key={i}>{m}</span>;
      })}
    </>
  );
}

function Example({ text }: { text: string }) {
  const parsed = useMemo(() => parseRutina(text, { catalog: DEMO_CATALOG }), [text]);
  const lines = text.replace(/\n$/, '').split('\n');
  return (
    <div className="rounded-lg bg-surface-2/50 py-2">
      {lines.map((line, i) => {
        const kind = parsed.lines[i]?.kind ?? 'item';
        const cls = LINE_CLASS[kind];
        return (
          <div key={i} className="flex h-7 items-center font-mono text-[12.5px] text-ink">
            <span className="w-10 shrink-0 text-right text-[11px] text-faint-2">{i + 1}</span>
            <span className={cn('ml-4 whitespace-pre', cls)}>{cls ? <Mark text={line} /> : <Tokens text={line} />}</span>
          </div>
        );
      })}
    </div>
  );
}

// --- Animated scenes: a mock editor with a cursor that moves and clicks ---------

/** One line of the mock editor, with the editor's colours. */
function Row({ n, children, marker, hover }: { n: number; children: ReactNode; marker?: 'error' | 'warning' | 'plus'; hover?: boolean }) {
  return (
    <div className={cn('flex h-7 items-center font-mono text-[12.5px]', hover && 'bg-surface-2')}>
      <span className="flex w-5 shrink-0 items-center justify-center text-[11px]">
        {marker === 'plus' && <span className="rounded-[4px] bg-accent-tint px-1 text-[12px] font-bold text-accent-dark">+</span>}
        {marker === 'error' && <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#e51400] text-[9px] font-bold text-white">✕</span>}
        {marker === 'warning' && <span className="text-[12px] text-[#bf8803]">▲</span>}
      </span>
      <span className="w-7 shrink-0 text-right font-mono text-[11px] text-faint-2">{n}</span>
      <span className="ml-4 whitespace-pre text-ink">{kids(children)}</span>
    </div>
  );
}
/** The text of a mock-editor line, with the search matches marked. */
function kids(children: ReactNode): ReactNode {
  return Children.map(children, (c) => (typeof c === 'string' ? <Mark text={c} /> : c));
}
const F = ({ children }: { children: ReactNode }) => <span className="font-semibold text-[#0451a5]">{kids(children)}</span>;
const G = ({ children }: { children: ReactNode }) => <span className="font-semibold text-[#795e26]">{kids(children)}</span>;
const N = ({ children }: { children: ReactNode }) => <span className="text-[#098658]">{kids(children)}</span>;
const Err = ({ children }: { children: ReactNode }) => (
  <span className="underline decoration-[#e51400] decoration-wavy underline-offset-[3px]">{kids(children)}</span>
);
const Warn = ({ children }: { children: ReactNode }) => (
  <span className="underline decoration-[#bf8803] decoration-wavy underline-offset-[3px]">{kids(children)}</span>
);

const CURSOR =
  '<svg width="18" height="20" viewBox="0 0 18 20"><path d="M2 1 L2 16 L6 12.5 L8.5 18.5 L11.5 17.2 L9 11.5 L14 11.5 Z" fill="#111" stroke="#fff" stroke-width="1.4"/></svg>';

/**
 * A scene loops a short animation: the cursor travels to a target, "clicks"
 * (a ring pulses) and something appears. Keyframes are plain CSS so the scene
 * keeps playing without JavaScript.
 */
function Scene({
  name,
  duration,
  cursor,
  children,
  css,
  caption,
  height,
}: {
  name: string;
  duration: number;
  /** Room for what pops up during the scene (menu, card, dialog). */
  height: number;
  /** Keyframes for the cursor's position, e.g. "0%{left:20px;top:60px} 40%{left:…}". */
  cursor: string;
  children: ReactNode;
  /** Extra keyframes/rules for the parts that appear during the scene. */
  css?: string;
  caption: ReactNode;
}) {
  return (
    <figure className="flex flex-col gap-2.5">
      <style>{`
        @keyframes ${name}-cursor { ${cursor} }
        @keyframes ${name}-click { 0%,100%{transform:scale(.4);opacity:0} 50%{transform:scale(1);opacity:.9} }
        .${name} .g-cursor { position:absolute; z-index:3; pointer-events:none; animation:${name}-cursor ${duration}s ease-in-out infinite; }
        .${name} .g-ring { position:absolute; z-index:2; width:28px; height:28px; margin:-14px 0 0 -14px; border-radius:9999px; border:2px solid var(--color-accent); opacity:0; pointer-events:none; }
        .${name} .g-show { opacity:0; }
        ${css ?? ''}
      `}</style>
      <div className={cn('relative select-none overflow-hidden rounded-lg bg-surface-2/50 px-2 py-2', name)} style={{ minHeight: height }}>
        {children}
        <span className="g-cursor" dangerouslySetInnerHTML={{ __html: CURSOR }} aria-hidden />
      </div>
      <figcaption className="text-[13px] leading-relaxed text-ink-2">
        {typeof caption === 'string' ? <Mark text={caption} /> : caption}
      </figcaption>
    </figure>
  );
}

function ScenePlus() {
  const n = 'g-plus';
  return (
    <Scene
      name={n}
      duration={7}
      height={290}
      cursor="0%,15%{left:150px;top:62px} 35%,100%{left:12px;top:72px}"
      css={`
        .${n} .g-ring { left:18px; top:78px; }
        @keyframes ${n}-ring { 0%,36%{transform:scale(.4);opacity:0} 42%{transform:scale(1);opacity:.9} 50%,100%{transform:scale(1.2);opacity:0} }
        .${n} .g-ring { animation:${n}-ring 7s ease-out infinite; }
        @keyframes ${n}-menu { 0%,44%{opacity:0;transform:translateY(-4px)} 52%,92%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
        .${n} .g-menu { animation:${n}-menu 7s ease-out infinite; }
      `}
      caption="Pasa el ratón por el margen izquierdo de una línea y aparece un +. Clic → un menú con formatos, rondas, descansos, ejercicios, plantillas y bloques reutilizables; lo que eliges se inserta en esa línea. En una línea vacía, Enter o un clic abren el mismo menú."
    >
      <Row n={1}>
        <F>AMRAP 12 min</F>
      </Row>
      <Row n={2}>
        {'  '}
        <N>10</N> Sentadillas
      </Row>
      <Row n={3} marker="plus" hover>
        {'  '}
      </Row>
      <span className="g-ring" aria-hidden />
      <div className="g-show g-menu absolute left-9 top-[88px] z-[1] w-48 rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
        <div className="px-2.5 pb-1 pt-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-2">Insertar aquí</div>
        {['Plantillas', 'Bloques reutilizables', 'Rutinas', 'Formatos', 'Rondas', 'Ejercicios', 'Descanso'].map((t, i) => (
          <div key={t} className={cn('flex items-center justify-between rounded-lg px-2.5 py-1 text-[12px] font-semibold text-ink', i === 3 && 'bg-accent-tint')}>
            {t}
            <span className="text-[10px] text-muted">›</span>
          </div>
        ))}
      </div>
    </Scene>
  );
}

function SceneCard() {
  const n = 'g-card';
  return (
    <Scene
      name={n}
      duration={7}
      height={200}
      cursor="0%,15%{left:200px;top:90px} 40%,100%{left:112px;top:46px}"
      css={`
        @keyframes ${n}-card { 0%,42%{opacity:0;transform:translateY(-4px)} 50%,92%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
        .${n} .g-card { animation:${n}-card 7s ease-out infinite; }
      `}
      caption="Una ✕ roja en el margen es un error en esa línea (el ejercicio no existe, falta algo): la rutina no se puede guardar hasta corregirlo. Un ▲ amarillo es un aviso: se guarda igual. Pasa el ratón por la palabra subrayada y la tarjeta te dice qué pasa y te ofrece la corrección con un clic."
    >
      <Row n={1}>
        <G>3 rondas</G>
      </Row>
      <Row n={2} marker="error">
        {'  '}
        <N>10</N> <Err>Sentadila</Err>
      </Row>
      <Row n={3} marker="warning">
        {'  '}
        <N>30s</N> <Warn>Handstand</Warn>
      </Row>
      <div className="g-show g-card absolute left-[84px] top-[64px] z-[1] w-56 rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
        <div className="rounded-lg bg-surface-2 p-1">
          <div className="px-2 pb-0.5 pt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-accent-dark">¿Quisiste decir?</div>
          <div className="rounded-md px-2 py-1 text-[14px] font-bold text-accent-dark">Sentadilla</div>
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-ink-2">
          <span className="text-[13px]">+</span> Crear ejercicio «Sentadila»
        </div>
      </div>
    </Scene>
  );
}

function SceneEdit() {
  const n = 'g-edit';
  return (
    <Scene
      name={n}
      duration={7}
      height={200}
      cursor="0%,15%{left:210px;top:84px} 38%,100%{left:118px;top:48px}"
      css={`
        @keyframes ${n}-link { 0%,36%{color:inherit;text-decoration-color:transparent} 42%,100%{color:var(--color-accent-dark);text-decoration-color:var(--color-accent-dark)} }
        .${n} .g-link { text-decoration:underline; text-underline-offset:3px; animation:${n}-link 7s ease-out infinite; }
        @keyframes ${n}-ring { 0%,48%{transform:scale(.4);opacity:0} 54%{transform:scale(1);opacity:.9} 62%,100%{transform:scale(1.2);opacity:0} }
        .${n} .g-ring { left:124px; top:54px; animation:${n}-ring 7s ease-out infinite; }
        @keyframes ${n}-dlg { 0%,58%{opacity:0;transform:scale(.97)} 66%,94%{opacity:1;transform:scale(1)} 100%{opacity:0} }
        .${n} .g-dlg { animation:${n}-dlg 7s ease-out infinite; }
      `}
      caption="Cada ejercicio reconocido es un enlace: al pasar el ratón se subraya en rojo y con un clic se abre su ficha completa (nombre, multimedia, indicaciones, alias, músculos, equipo). Si lo renombras, el editor cambia el nombre en todas las líneas y guarda el antiguo como alias."
    >
      <Row n={1}>
        <F>EMOM 10 x 90s</F>
      </Row>
      <Row n={2}>
        {'  '}
        <N>10</N> <span className="g-link">Burpees</span>
      </Row>
      <Row n={3}>
        {'  '}
        <N>15</N> Sentadillas
      </Row>
      <span className="g-ring" aria-hidden />
      <div className="g-show g-dlg absolute inset-x-6 top-3 z-[1] rounded-xl border border-line-2 bg-surface shadow-[0_12px_32px_-10px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between border-b border-line-3 px-3 py-2">
          <span className="text-[12px] font-bold text-ink">Editar ejercicio</span>
          <span className="text-[11px] text-faint-2">✕</span>
        </div>
        <div className="flex flex-col gap-1.5 px-3 py-2.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-2">Nombre</span>
          <span className="rounded-md border border-line-2 bg-surface px-2 py-1 text-[12px] font-semibold text-ink">Burpee</span>
          <div className="mt-1 flex gap-1.5">
            <span className="rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-2">Pierna</span>
            <span className="rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-2">Pecho</span>
            <span className="rounded-full border border-dashed border-line-2 px-2 py-0.5 text-[10px] font-semibold text-ink-3">⊕ Agregar músculos</span>
          </div>
        </div>
      </div>
    </Scene>
  );
}

function SceneTab() {
  const n = 'g-tab';
  return (
    <Scene
      name={n}
      duration={8}
      height={110}
      cursor="0%,100%{left:230px;top:96px}"
      css={`
        @keyframes ${n}-a { 0%,20%{background:var(--color-accent-tint);box-shadow:0 0 0 1px var(--color-line-2) inset} 30%,100%{background:transparent;box-shadow:none} }
        @keyframes ${n}-a-text { 0%,22%{opacity:1} 28%,100%{opacity:0} }
        @keyframes ${n}-a-typed { 0%,24%{opacity:0} 30%,100%{opacity:1} }
        @keyframes ${n}-b { 0%,34%{background:transparent;box-shadow:none} 40%,60%{background:var(--color-accent-tint);box-shadow:0 0 0 1px var(--color-line-2) inset} 70%,100%{background:transparent;box-shadow:none} }
        @keyframes ${n}-b-text { 0%,62%{opacity:1} 68%,100%{opacity:0} }
        @keyframes ${n}-b-typed { 0%,64%{opacity:0} 70%,100%{opacity:1} }
        @keyframes ${n}-key { 0%,30%{opacity:0} 34%,42%{opacity:1} 46%,100%{opacity:0} }
        .${n} .g-a { border-radius:4px; padding:0 2px; animation:${n}-a 8s linear infinite; }
        .${n} .g-a .t1 { animation:${n}-a-text 8s linear infinite; }
        .${n} .g-a .t2 { position:absolute; left:2px; animation:${n}-a-typed 8s linear infinite; }
        .${n} .g-b { border-radius:4px; padding:0 2px; animation:${n}-b 8s linear infinite; }
        .${n} .g-b .t1 { animation:${n}-b-text 8s linear infinite; }
        .${n} .g-b .t2 { position:absolute; left:2px; animation:${n}-b-typed 8s linear infinite; }
        .${n} .g-key { animation:${n}-key 8s linear infinite; }
      `}
      caption="Lo que insertas desde el menú + llega con huecos en vez de valores inventados. El primero queda seleccionado: escribes y lo reemplaza. Tab salta al siguiente hueco, Shift+Tab vuelve. Un hueco que dejes sin rellenar queda marcado como error."
    >
      <Row n={1}>
        <F>AMRAP</F>{' '}
        <span className="g-a relative inline-block">
          <span className="t1">minutos</span>
          <span className="t2">15</span>
        </span>{' '}
        <F>min</F>
      </Row>
      <Row n={2}>
        {'  '}
        <span className="g-b relative inline-block">
          <span className="t1">reps</span>
          <span className="t2">12</span>
        </span>{' '}
        <span className="rounded-[4px] bg-accent-tint px-0.5 shadow-[0_0_0_1px_var(--color-line-2)_inset]">ejercicio</span>
      </Row>
      <Row n={3}>{''}</Row>
      <div className="g-show g-key absolute right-4 top-3 rounded-md border border-line-2 bg-surface-2 px-2 py-1 font-mono text-[11px] font-semibold text-ink-2 shadow-sm">Tab ⇥</div>
    </Scene>
  );
}

function SceneSections() {
  const n = 'g-sections';
  return (
    <Scene
      name={n}
      duration={8}
      height={150}
      cursor="0%,20%{left:220px;top:90px} 45%,100%{left:112px;top:16px}"
      css={`
        @keyframes ${n}-ring { 0%,50%{transform:scale(.4);opacity:0} 56%{transform:scale(1);opacity:.9} 64%,100%{transform:scale(1.2);opacity:0} }
        .${n} .g-ring { left:122px; top:22px; animation:${n}-ring 8s ease-out infinite; }
        @keyframes ${n}-tab-a { 0%,58%{color:var(--color-ink);box-shadow:inset 0 -2px 0 var(--color-accent)} 62%,100%{color:var(--color-muted);box-shadow:none} }
        @keyframes ${n}-tab-b { 0%,58%{color:var(--color-muted);box-shadow:none} 62%,100%{color:var(--color-ink);box-shadow:inset 0 -2px 0 var(--color-accent)} }
        .${n} .g-tab-a { animation:${n}-tab-a 8s ease-out infinite; }
        .${n} .g-tab-b { animation:${n}-tab-b 8s ease-out infinite; }
        @keyframes ${n}-doc-a { 0%,58%{opacity:1} 62%,100%{opacity:0} }
        @keyframes ${n}-doc-b { 0%,58%{opacity:0} 62%,100%{opacity:1} }
        .${n} .g-doc-a { animation:${n}-doc-a 8s ease-out infinite; }
        .${n} .g-doc-b { position:absolute; left:8px; right:8px; top:44px; animation:${n}-doc-b 8s ease-out infinite; }
      `}
      caption="Encima del editor hay una pestaña por sección: Rutina, Calentamiento y Estiramiento. Cada una se escribe igual que la rutina; en la vista previa salen como secciones separadas y una pestaña vacía no se muestra."
    >
      <div className="-mx-2 -mt-2 mb-2 flex h-8 items-stretch border-b border-line bg-surface-2 font-mono text-[11px]">
        <span className="g-tab-a flex items-center border-r border-line px-3">Rutina</span>
        <span className="g-tab-b flex items-center border-r border-line px-3">Calentamiento</span>
        <span className="flex items-center border-r border-line px-3 text-muted">Estiramiento</span>
      </div>
      <div className="g-doc-a">
        <Row n={1}>
          <F>AMRAP 12 min</F>
        </Row>
        <Row n={2}>
          {'  '}
          <N>10</N> Sentadillas
        </Row>
        <Row n={3}>
          {'  '}
          <N>8</N> Flexiones
        </Row>
      </div>
      <div className="g-doc-b">
        <Row n={1}>
          <G>2 rondas</G>
        </Row>
        <Row n={2}>
          {'  '}
          <N>10</N> Zancadas
        </Row>
        <Row n={3}>
          {'  '}
          <N>30s</N> Plancha
        </Row>
      </div>
      <span className="g-ring" aria-hidden />
    </Scene>
  );
}

/** Typing "10 sen" letter by letter: the suggestions appear, Tab completes the name. */
function SceneTyping() {
  const n = 'g-typing';
  const typed = '10 sen';
  const total = 9;
  // Each character shows up at its own moment; the popup follows the first letter of the name.
  const charKeys = typed
    .split('')
    .map((_, i) => `@keyframes ${n}-c${i} { 0%,${8 + i * 4}%{opacity:0} ${10 + i * 4}%,100%{opacity:1} }`)
    .join('\n');
  return (
    <Scene
      name={n}
      duration={total}
      height={220}
      cursor="0%,100%{left:260px;top:120px}"
      css={`
        ${charKeys}
        ${typed
          .split('')
          .map((_, i) => `.${n} .g-c${i} { animation:${n}-c${i} ${total}s linear infinite; }`)
          .join('\n')}
        @keyframes ${n}-caret { 0%,100%{opacity:1} 50%{opacity:0} }
        .${n} .g-caret { display:inline-block; width:1.5px; height:15px; background:var(--color-ink); vertical-align:-2px; animation:${n}-caret 1s steps(1) infinite; }
        @keyframes ${n}-pop { 0%,22%{opacity:0;transform:translateY(-4px)} 26%,60%{opacity:1;transform:translateY(0)} 64%,100%{opacity:0} }
        .${n} .g-pop { animation:${n}-pop ${total}s ease-out infinite; }
        @keyframes ${n}-key { 0%,52%{opacity:0} 55%,62%{opacity:1} 65%,100%{opacity:0} }
        .${n} .g-key { animation:${n}-key ${total}s linear infinite; }
        @keyframes ${n}-rest { 0%,62%{opacity:0} 66%,92%{opacity:1} 100%{opacity:0} }
        .${n} .g-rest { animation:${n}-rest ${total}s linear infinite; }
        @keyframes ${n}-typed { 0%,92%{opacity:1} 100%{opacity:0} }
        .${n} .g-typed { animation:${n}-typed ${total}s linear infinite; }
      `}
      caption="Mientras escribes el nombre de un ejercicio aparecen los del catálogo que coinciden (también por alias y aunque se te escape una letra). Tab o Enter acepta, Esc cierra. Si no existe, la última opción es «Crear ejercicio» con lo que escribiste."
    >
      <Row n={1}>
        <G>3 rondas</G>
      </Row>
      <Row n={2}>
        {'  '}
        <span className="g-typed">
          {typed.split('').map((ch, i) => (
            <span key={i} className={`g-c${i}`}>
              {ch === ' ' ? '\u00a0' : ch}
            </span>
          ))}
        </span>
        <span className="g-rest text-ink">tadillas</span>
        <span className="g-caret" />
      </Row>
      <Row n={3}>{''}</Row>
      <div className="g-show g-pop absolute left-[86px] top-[66px] z-[1] w-60 rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
        <div className="px-2.5 pb-0.5 pt-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-2">Ejercicios</div>
        <div className="rounded-lg bg-accent-tint px-2.5 py-1 text-[12px] font-semibold text-ink">Sentadilla</div>
        <div className="px-2.5 py-1 text-[12px] font-semibold text-ink">Sentadilla búlgara</div>
        <div className="mt-0.5 border-t border-line-3 px-2.5 pb-0.5 pt-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-2">Nuevo</div>
        <div className="flex items-center justify-between px-2.5 py-1 text-[12px] font-semibold text-ink">
          Crear ejercicio «sen» <span className="font-mono text-[9px] font-normal text-muted">nuevo en el catálogo</span>
        </div>
      </div>
      <div className="g-show g-key absolute right-4 top-3 rounded-md border border-line-2 bg-surface-2 px-2 py-1 font-mono text-[11px] font-semibold text-ink-2 shadow-sm">Tab ⇥</div>
    </Scene>
  );
}

/** The "Versión" / "Nivel" dropdown: the cursor opens it and the list appears. */
function SceneVersions({ skillMode }: { skillMode: boolean }) {
  const n = skillMode ? 'g-levels' : 'g-versions';
  const rows = skillMode ? ['Nivel 1', 'Nivel 2', 'Nivel 3'] : ['Principal', 'Escalada'];
  return (
    <Scene
      name={n}
      duration={8}
      height={210}
      cursor="0%,20%{left:200px;top:110px} 45%,100%{left:calc(100% - 54px);top:14px}"
      css={`
        @keyframes ${n}-ring { 0%,50%{transform:scale(.4);opacity:0} 56%{transform:scale(1);opacity:.9} 64%,100%{transform:scale(1.2);opacity:0} }
        .${n} .g-ring { right:30px; top:20px; animation:${n}-ring 8s ease-out infinite; }
        @keyframes ${n}-menu { 0%,58%{opacity:0;transform:translateY(-4px)} 64%,94%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
        .${n} .g-menu { animation:${n}-menu 8s ease-out infinite; }
      `}
      caption={
        skillMode
          ? 'El desplegable de la derecha lista los niveles: cada uno es una rutina completa con su objetivo. «Nuevo nivel» copia el nivel activo. Arrastra por el asa ⋮⋮ para reordenar, el lápiz (o doble clic) renombra en la propia fila y la ✕ pide confirmación ahí mismo.'
          : 'El desplegable «Versión» de la derecha guarda variantes de la rutina entera (RX, Escalada…): la nueva copia la versión activa y en la app el usuario elige cuál hacer. El lápiz renombra en la fila y la ✕ pide confirmación ahí mismo.'
      }
    >
      <div className="-mx-2 -mt-2 mb-2 flex h-8 items-stretch border-b border-line bg-surface-2 font-mono text-[11px]">
        <span className="flex items-center border-r border-line px-3 text-ink shadow-[inset_0_-2px_0_var(--color-accent)]">Rutina</span>
        <span className="flex items-center border-r border-line px-3 text-muted">Calentamiento</span>
        <span className="flex items-center border-r border-line px-3 text-muted">Estiramiento</span>
        {skillMode && <span className="flex items-center border-r border-line px-3 text-muted">Objetivo</span>}
        <span className="flex-1" />
        <span className="mr-2 flex items-center gap-1.5 self-center rounded-md border-l border-line px-2 py-1 text-[11px]">
          {!skillMode && <span className="text-muted">Versión</span>}
          <span className="font-semibold text-ink">{rows[0]}</span>
          <span className="text-ink-3">⌄</span>
        </span>
      </div>
      <Row n={1}>
        <F>AMRAP 12 min</F>
      </Row>
      <Row n={2}>
        {'  '}
        <N>10</N> Sentadillas
      </Row>
      <span className="g-ring" aria-hidden />
      <div className="g-show g-menu absolute right-3 top-9 z-[1] w-64 rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
        {rows.map((r, i) => (
          <div key={r} className={cn('flex items-center gap-1 rounded-lg pl-1.5 pr-1 text-[12px]', i === 0 ? 'bg-accent-tint text-accent-dark' : 'text-ink-2')}>
            {skillMode && <span className="px-0.5 font-mono text-[11px] text-faint-2">⋮⋮</span>}
            <span className="flex-1 py-1.5 font-semibold">{r}</span>
            {!skillMode && i === 0 && <span className="font-mono text-[9px] text-muted">base</span>}
            <span className="px-1 text-[10px] text-faint-2">✎</span>
            {(skillMode || i > 0) && <span className="px-1 text-[10px] text-faint-2">✕</span>}
          </div>
        ))}
        <div className="my-1 h-px bg-line-3" />
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] font-semibold text-accent-dark">
          <span className="w-3 text-center">+</span>
          {skillMode ? 'Nuevo nivel' : 'Nueva variante'}
        </div>
      </div>
    </Scene>
  );
}

/** Selecting two lines by dragging: the "Guardar como bloque" action appears and gets clicked. */
function SceneBlock() {
  const n = 'g-block';
  return (
    <Scene
      name={n}
      duration={9}
      height={190}
      cursor="0%,12%{left:72px;top:40px} 30%,45%{left:172px;top:72px} 62%,100%{left:262px;top:124px}"
      css={`
        @keyframes ${n}-sel1 { 0%,12%{width:0} 21%,100%{width:120px} }
        @keyframes ${n}-sel2 { 0%,21%{width:0} 30%,100%{width:98px} }
        .${n} .g-sel { position:absolute; left:72px; height:28px; background:rgba(66,133,244,0.3); }
        .${n} .g-sel1 { top:36px; animation:${n}-sel1 9s ease-in-out infinite; }
        .${n} .g-sel2 { top:64px; animation:${n}-sel2 9s ease-in-out infinite; }
        @keyframes ${n}-chip { 0%,32%{opacity:0;transform:translateY(-4px)} 40%,90%{opacity:1;transform:translateY(0)} 100%{opacity:0} }
        .${n} .g-chip { animation:${n}-chip 9s ease-out infinite; }
        @keyframes ${n}-ring { 0%,64%{transform:scale(.4);opacity:0} 70%{transform:scale(1);opacity:.9} 78%,100%{transform:scale(1.2);opacity:0} }
        .${n} .g-ring { left:272px; top:130px; animation:${n}-ring 9s ease-out infinite; }
        @keyframes ${n}-dlg { 0%,74%{opacity:0;transform:scale(.97)} 80%,96%{opacity:1;transform:scale(1)} 100%{opacity:0} }
        .${n} .g-dlg { animation:${n}-dlg 9s ease-out infinite; }
      `}
      caption="Selecciona dos líneas o más y aparece «Guardar como bloque»: le pones un nombre y queda guardado. Después lo insertas desde el menú + (Bloques reutilizables), igual que cualquier otra rutina del catálogo: se copia su texto en la línea."
    >
      <span className="g-sel g-sel1" aria-hidden />
      <span className="g-sel g-sel2" aria-hidden />
      <Row n={1}>
        <G>3 rondas</G>
      </Row>
      <Row n={2}>
        {'  '}
        <N>10</N> Sentadillas
      </Row>
      <Row n={3}>
        {'  '}
        <N>8</N> Flexiones
      </Row>
      <div className="g-show g-chip absolute left-[190px] top-[112px] z-[1] flex items-center gap-1.5 rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-ink shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)]">
        <span className="text-accent-dark">🔖</span> Guardar como bloque
      </div>
      <span className="g-ring" aria-hidden />
      <div className="g-show g-dlg absolute inset-x-10 top-4 z-[2] rounded-xl border border-line-2 bg-surface shadow-[0_12px_32px_-10px_rgba(0,0,0,0.35)]">
        <div className="border-b border-line-3 px-3 py-2 text-[12px] font-bold text-ink">Guardar como bloque</div>
        <div className="flex flex-col gap-1.5 px-3 py-2.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-2">Nombre</span>
          <span className="rounded-md border border-accent bg-surface px-2 py-1 text-[12px] font-semibold text-ink">Circuito de pierna</span>
        </div>
      </div>
    </Scene>
  );
}

// --- Reference rows ----------------------------------------------------------

type Ref = { k: string; v: string };
/** One way of writing it per pill; the alternatives in `k` are separated by " · ". */
function Reference({ rows }: { rows: Ref[] }) {
  return (
    <div className="flex flex-col divide-y divide-line-3 rounded-xl border border-line-2 bg-surface">
      {rows.map((g) => (
        <div key={g.k} className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-4 px-3 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {g.k.split(' · ').map((alt) => (
              <code key={alt} className="rounded-md border border-line-2 bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink">
                <Mark text={alt} />
              </code>
            ))}
          </div>
          <div className="pt-0.5 text-[12.5px] leading-snug text-ink-2">
            <Mark text={g.v} />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- The guide ----------------------------------------------------------------

type Section = { id: string; title: string; keywords: string; body: ReactNode };

function sections(skillMode: boolean, programMode: boolean): Section[] {
  const out: Section[] = [
    {
      id: 'basics',
      title: 'Así se escribe una rutina',
      keywords: 'escribir basico pizarra ejercicio cantidad nombre linea texto',
      body: (
        <>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Se escribe como en una pizarra: una cosa por línea. Primero la cantidad, luego el ejercicio. Lo que escribes es
            lo que el usuario ve en la app.
          </p>
          <Example
            text={`AMRAP 12 min
  10 Sentadillas
  8 Flexiones
  400 m Correr
`}
          />
        </>
      ),
    },
    {
      id: 'indent',
      title: 'La sangría dice qué va dentro de qué',
      keywords: 'sangria indentacion dentro bloque rondas anidar python tab',
      body: (
        <>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Lo indentado pertenece a la línea de arriba. Un formato (AMRAP, EMOM…) o un bloque de rondas abre un contenedor;
            Tab indenta y Enter mantiene el nivel. Los bloques se anidan sin límite.
          </p>
          <Example
            text={`EMOM 10 x 90s
  3 rondas
    10 Burpees
    15 Sentadillas
  descanso 60s
  20 Dominadas
`}
          />
        </>
      ),
    },
    {
      id: 'formats',
      title: 'Formatos',
      keywords: 'formato amrap emom tabata for time chipper fuerza circuito cap intervalo',
      body: (
        <>
          <p className="text-[13px] leading-relaxed text-ink-2">
            La primera línea de una parte es su formato. Una rutina puede tener varias partes seguidas, cada una con el suyo.
          </p>
          <Reference
            rows={[
              { k: 'AMRAP 12 min', v: 'máximas rondas en el tiempo' },
              { k: 'EMOM 10 min · EMOM 10 x 90s · E2MOM 10', v: 'cada intervalo un ejercicio o un grupo "intervalo N:"; rotan hasta acabar' },
              { k: 'Tabata 8 x 20/10', v: 'rondas × trabajo/descanso (los ejercicios no llevan cantidad)' },
              { k: 'For time · For time cap 20 min', v: 'lo más rápido posible, con tope opcional' },
              { k: 'For time 5 rondas', v: 'rondas del total' },
              { k: 'Chipper cap 25 min', v: 'lista completada una vez' },
              { k: 'Fuerza', v: 'series × reps con carga y descanso' },
              { k: 'Circuito 3 rondas descanso 1 min', v: 'vueltas al circuito' },
            ]}
          />
          <Example
            text={`Tabata 8 x 20/10
  Burpees
  Plancha

For time cap 20 min
  50 Sentadillas
  40 Flexiones
`}
          />
        </>
      ),
    },
    {
      id: 'amounts',
      title: 'Cantidades, carga y tempo',
      keywords: 'cantidad reps series tiempo distancia carga kg lb rpe porcentaje tempo c/lado desc descanso series',
      body: (
        <>
          <p className="text-[13px] leading-relaxed text-ink-2">Después del nombre van la carga, el tempo y el resto de detalles, en el orden que quieras.</p>
          <Example
            text={`Fuerza
  Sentadilla 5x5 @100 kg tempo 0-3-1-1 desc 2 min
  Zancadas 3x10 c/lado @20 kg
  Plancha 3x45s
`}
          />
          <Reference
            rows={[
              { k: '41 burpees · burpees x41', v: 'repeticiones' },
              { k: 'flexiones 3x5 · 3 series de 5', v: 'series × repeticiones' },
              { k: "plancha 30s · 1 min · 1:30 · 30'' · 12'", v: "tiempo (' minutos, '' segundos)" },
              { k: '400 m carrera · remo 1 km · 4x400 m', v: 'distancia, series × distancia' },
              { k: 'plancha max · al fallo', v: 'sin cantidad fija' },
              { k: '@60 kg · @135/95 lb · @80% · @RPE 8', v: 'carga: absoluta, hombres/mujeres, % del 1RM, esfuerzo' },
              { k: '+20 kg · @corporal', v: 'añadido al peso corporal · solo peso corporal' },
              { k: 'tempo 0-3-1-1 · tempo 0-3-0-X · @0311', v: 'hold arriba · negativa · hold abajo · positiva (X = explosivo)' },
              { k: 'c/lado · por lado', v: 'cantidad por cada lado' },
              { k: 'desc 90s', v: 'descanso entre series' },
            ]}
          />
        </>
      ),
    },
    {
      id: 'rest',
      title: 'Rondas y descansos',
      keywords: 'rondas descanso rest superserie bloque',
      body: (
        <Reference
          rows={[
            { k: '3 rondas', v: 'bloque: sus ejercicios van indentados debajo (los dos puntos son opcionales)' },
            { k: '3 rondas, descanso 1 min', v: 'descanso al final de cada ronda' },
            { k: 'descanso 90s · rest 2 min', v: 'un descanso suelto, solo en su línea' },
            { k: 'Superserie · Superserie 3 rondas', v: 'bloque tipo superserie' },
            { k: 'intervalo 2:', v: 'en un EMOM, el grupo de ese intervalo (indentado debajo); los intervalos rotan' },
          ]}
        />
      ),
    },
    {
      id: 'notes',
      title: 'Notas para el usuario y comentarios internos',
      keywords: 'nota comentario // # usuario interno',
      body: (
        <>
          <p className="text-[13px] leading-relaxed text-ink-2">
            <span className="font-mono">//</span> es una nota que el usuario ve. <span className="font-mono">#</span> es un comentario
            interno: queda en el texto pero nunca llega a la app.
          </p>
          <Example
            text={`# revisar la carga la semana que viene
3 rondas
  10 Sentadillas // despacio en la bajada
  // respira entre rondas
  8 Flexiones
`}
          />
        </>
      ),
    },
    {
      id: 'sections',
      title: 'Calentamiento y enfriamiento',
      keywords: 'calentamiento enfriamiento pestaña seccion',
      body: <SceneSections />,
    },
    {
      id: 'plus',
      title: 'El menú +',
      keywords: 'mas menu insertar plantilla bloque reutilizable formato rondas descanso ejercicio enter linea vacia',
      body: <ScenePlus />,
    },
    {
      id: 'placeholders',
      title: 'Huecos al insertar',
      keywords: 'hueco placeholder tab rellenar minutos ejercicio insertar',
      body: <SceneTab />,
    },
    {
      id: 'errors',
      title: 'Errores y avisos',
      keywords: 'error aviso warning x rojo amarillo tarjeta corregir crear ejercicio desconocido archivado',
      body: (
        <>
          <SceneCard />
        </>
      ),
    },
    {
      id: 'edit',
      title: 'Editar un ejercicio desde el texto',
      keywords: 'editar ejercicio clic enlace ficha renombrar alias musculos equipo',
      body: <SceneEdit />,
    },
    {
      id: 'suggest',
      title: 'Sugerencias al escribir',
      keywords: 'sugerencias autocompletar nombre alias typo tab esc',
      body: <SceneTyping />,
    },
    {
      id: 'blocks',
      title: 'Bloques reutilizables y otras rutinas',
      keywords: 'bloque reutilizable guardar seleccion rutina insertar',
      body: <SceneBlock />,
    },
    {
      id: 'versions',
      title: skillMode ? 'Niveles' : 'Versiones',
      keywords: 'version nivel variante rx escalada desplegable',
      body: <SceneVersions skillMode={skillMode} />,
    },
  ];
  if (programMode) {
    // A program has no versions: its days are picked from the week strip.
    out.splice(out.length - 1, 1, {
      id: 'weeks',
      title: 'Semanas y días',
      keywords: 'programa semana dia descanso video calendario duplicar copiar arrastrar',
      body: (
        <>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Un programa es un calendario en semanas de siete días. La barra sobre el editor muestra la semana activa:
            cada día es una casilla; haz clic para escribir su rutina en el editor y arrastra para moverlo dentro de la
            semana. Una casilla rellena tiene contenido (franja naranja: rutina; azul: video), una discontinua está vacía y las rayadas son días de descanso.
          </p>
          <p className="text-[13px] leading-relaxed text-ink-2">
            El desplegable «Semana N» cambia de semana, añade una nueva (vacía), duplica una (inserta la copia justo
            después) o la elimina.
          </p>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Cada día es una de tres cosas: una rutina escrita en el editor, una sola clase en video, o descanso. Para
            reutilizar una rutina del catálogo, insértala desde el menú + (Rutinas): se copia su texto. Para publicar,
            ningún día puede quedar vacío.
          </p>
        </>
      ),
    });
  }
  if (skillMode) {
    out.splice(7, 0, {
      id: 'goal',
      title: 'Objetivo: qué desbloquea el siguiente nivel',
      keywords: 'objetivo nivel desbloquear marca habilidad',
      body: (
        <>
          <p className="text-[13px] leading-relaxed text-ink-2">
            En la pestaña Objetivo escribes las marcas que el usuario debe alcanzar para pasar al siguiente nivel, una por línea y
            con la gramática de siempre. Hay que cumplirlas todas. El último nivel no lleva objetivo.
          </p>
          <Example
            text={`Objetivo
  3 Dominadas
  Plancha 60s
  Sentadilla 5x5 @100 kg
`}
          />
        </>
      ),
    });
  }
  out.push({
    id: 'keys',
    title: 'Atajos',
    keywords: 'atajos teclado enter tab guardar deshacer cmd ctrl',
    body: (
      <Reference
        rows={[
          { k: 'Enter', v: 'tras una cabecera indenta; en una línea vacía indentada sube un nivel por pulsación' },
          { k: 'Tab · Shift+Tab', v: 'indenta y desindenta; con huecos, salta entre ellos; acepta una sugerencia' },
          { k: '⌘S / Ctrl+S', v: 'guardar' },
          { k: '⌘Z / ⇧⌘Z', v: 'deshacer y rehacer (también los botones junto a las pestañas)' },
          { k: 'Esc', v: 'cierra el menú, la sugerencia o la tarjeta' },
        ]}
      />
    ),
  });
  return out;
}

// --- Search: whole sections that mention the text, with the matches marked -----

/** Plain strings inside a section's own markup (paragraphs) get the marks; components mark their own text. */
function highlight(node: ReactNode, q: string): ReactNode {
  if (!q) return node;
  if (typeof node === 'string') return marked(node, q);
  if (Array.isArray(node)) return Children.map(node, (c) => highlight(c, q));
  if (isValidElement<{ children?: ReactNode }>(node) && typeof node.type === 'string' && node.props.children !== undefined) {
    return cloneElement(node as ReactElement<{ children?: ReactNode }>, { children: highlight(node.props.children, q) });
  }
  return node;
}

/** Everything a section shows, as text, for matching (rendered once, tags stripped). */
const sectionText = (s: Section) =>
  fold(`${s.title} ${s.keywords} ${renderToStaticMarkup(<>{s.body}</>).replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')}`);

export function RutinaGuide({
  open,
  onClose,
  skillMode = false,
  programMode = false,
}: {
  open: boolean;
  onClose: () => void;
  skillMode?: boolean;
  programMode?: boolean;
}) {
  const [query, setQuery] = useState('');
  const all = useMemo(() => sections(skillMode, programMode), [skillMode, programMode]);
  const q = fold(query.trim());
  const index = useMemo(() => all.map(sectionText), [all]);
  const visible = q ? all.filter((_, i) => index[i]!.includes(q)) : all;
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[640px] flex-col border-l border-line bg-surface shadow-[0_0_40px_-10px_rgba(0,0,0,0.35)]">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h3 className="text-[15px] font-bold">Guía del editor</h3>
            <p className="text-[12px] text-muted">Cómo se escribe y qué ve el usuario.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink">
            ✕
          </button>
        </div>
        <div className="shrink-0 px-5 pt-4">
          <div className="flex h-9 items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5">
            <span className="text-muted-2">⌕</span>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar (tempo, carga, EMOM, menú +…)"
              className="h-full flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted-2 focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-faint-2 hover:text-ink">
                ✕
              </button>
            )}
          </div>
        </div>
        <MarkCtx.Provider value={q}>
          <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-5 pb-10 pt-4">
            {visible.length === 0 && <p className="text-[12px] text-muted">Nada coincide con «{query}».</p>}
            {visible.map((s) => (
              <section key={s.id} id={`guide-${s.id}`} className="flex scroll-mt-4 flex-col gap-3">
                <h4 className="text-[14px] font-bold text-ink">{marked(s.title, q)}</h4>
                {highlight(s.body, q)}
              </section>
            ))}
          </div>
        </MarkCtx.Provider>
      </aside>
    </>
  );
}
