import { Catalog } from './catalog';
import { parseRutina } from './parse';
import type { BlockSection } from '@dmtx/schemas';

/**
 * The admin edits each section in its own tab, so a rutina's text is split
 * into unindented texts (warmup, main, cooldown, and for a skill level the
 * goal) and joined back (Python-style headers) for parsing, preview and
 * saving. Comments and spacing inside a section survive.
 */
export type SectionTexts = Record<BlockSection, string>;

const EMPTY = new Catalog([]);

const HEADER: Record<Exclude<BlockSection, 'main'>, string> = {
  warmup: 'Calentamiento',
  cooldown: 'Estiramiento',
  goal: 'Objetivo',
};

const indent = (text: string) =>
  text
    .split('\n')
    .map((l) => (l.trim() ? `  ${l}` : ''))
    .join('\n');

/** One document from the three section texts; empty sections are left out. */
export function joinSections(parts: SectionTexts): string {
  const out: string[] = [];
  const push = (section: Exclude<BlockSection, 'main'>) => {
    const t = (parts[section] ?? '').replace(/\s+$/, '');
    if (!t.trim()) return;
    out.push(`${HEADER[section]}\n${indent(t)}`);
  };
  push('warmup');
  const main = parts.main.replace(/\s+$/, '');
  if (main.trim()) out.push(main);
  push('cooldown');
  push('goal');
  return out.length ? out.join('\n\n') + '\n' : '';
}

/** The three section texts of a document, each dedented and without its header. */
export function splitSections(text: string): SectionTexts {
  const lines = text.split('\n');
  const info = parseRutina(text, { catalog: EMPTY }).lines;
  const out: Record<BlockSection, string[]> = { warmup: [], main: [], cooldown: [], goal: [] };
  lines.forEach((line, i) => {
    const li = info[i];
    if (!li || li.kind === 'section') return;
    const section = li.section;
    out[section].push(section !== 'main' && line.startsWith('  ') ? line.slice(2) : line);
  });
  const trim = (ls: string[]) => {
    while (ls.length && !ls[0]!.trim()) ls.shift();
    while (ls.length && !ls[ls.length - 1]!.trim()) ls.pop();
    return ls.length ? ls.join('\n') + '\n' : '';
  };
  return { warmup: trim(out.warmup), main: trim(out.main), cooldown: trim(out.cooldown), goal: trim(out.goal) };
}
