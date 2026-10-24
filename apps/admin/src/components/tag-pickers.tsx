'use client';

// Pickers for an exercise's tags (muscles, equipment), in the style of Shopify's product tags: the
// field shows the chosen tags and an "Agregar" button that opens a popover
// where existing tags are searched and ticked, and a name that doesn't exist
// yet is created right there ("Agregar «…»").
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Equipment, Muscle, Taxonomy } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function useTaxonomy() {
  return useQuery({ queryKey: ['taxonomy'], queryFn: () => api.taxonomy.get(), staleTime: 60_000 });
}

/** Keep the cached taxonomy in step with something just created, then refetch counts. */
function useTaxonomyCache() {
  const qc = useQueryClient();
  return {
    patch(fn: (t: Taxonomy) => Taxonomy) {
      qc.setQueryData<Taxonomy>(['taxonomy'], (t) => (t ? fn(t) : t));
      void qc.invalidateQueries({ queryKey: ['taxonomy'] });
    },
  };
}

type Option = { id: string; name: string };
type Section = { title?: string; items: Option[] };

interface TagPopoverProps {
  /** Label on the opener, e.g. "Agregar músculos". */
  addLabel: string;
  placeholder: string;
  sections: Section[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** Creates a tag named `name` and ticks it. */
  onCreate: (name: string) => Promise<void>;
  /** The chosen tags, rendered inside the field in front of the opener. */
  chips?: ReactNode;
}

function TagPopover({ addLabel, placeholder, sections, selected, onToggle, onCreate, chips }: TagPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // The panel lives at the document root (a dialog's scroll area would clip it) and follows the
  // field: below it, or above when there is more room there; the list shrinks to fit.
  const [place, setPlace] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const vh = window.innerHeight;
      const below = vh - r.bottom - 14;
      const above = r.top - 14;
      // 41 = the search row; the list wants up to 288 px.
      const up = below < 41 + 160 && above > below;
      const room = up ? above : below;
      setPlace({
        left: r.left,
        width: r.width,
        ...(up ? { bottom: vh - r.top + 6 } : { top: r.bottom + 6 }),
        maxH: Math.max(96, Math.min(288, room - 41)),
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    // Capture phase: Escape closes only the popover, not a dialog around it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const q = fold(query.trim());
  const visible = useMemo(
    () =>
      sections
        .map((s) => ({ ...s, items: s.items.filter((o) => !q || fold(o.name).includes(q)) }))
        .filter((s) => s.items.length > 0),
    [sections, q],
  );
  const total = visible.reduce((n, s) => n + s.items.length, 0);
  const exact = sections.some((s) => s.items.some((o) => fold(o.name) === q));
  const canCreate = q.length > 0 && !exact;

  const create = async () => {
    const name = query.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onCreate(name);
      setQuery('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <div
        className={cn(
          'flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border bg-surface px-2 py-1.5 transition-colors',
          open ? 'border-accent' : 'border-line-2',
        )}
      >
        {chips}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-line-2 px-2.5 text-[13px] font-semibold text-ink-2 hover:border-ink hover:text-ink"
        >
          <span aria-hidden className="text-[15px] leading-none">
            ⊕
          </span>
          {addLabel}
        </button>
      </div>

      {open && place && createPortal(
        <div
          ref={panel}
          style={{ position: 'fixed', left: place.left, width: place.width, top: place.top, bottom: place.bottom }}
          className="z-[80] overflow-hidden rounded-xl border border-line-2 bg-surface shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]"
        >
          <div className="flex items-center gap-2 border-b border-line-3 px-3">
            <span className="text-[14px] text-muted" aria-hidden>
              ⌕
            </span>
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const only = total === 1 ? visible[0]?.items[0] : undefined;
                if (only && (!canCreate || fold(only.name).startsWith(q))) onToggle(only.id);
                else if (canCreate) void create();
              }}
              placeholder={placeholder}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted-2 focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-muted hover:text-ink" aria-label="Borrar búsqueda">
                ⊗
              </button>
            )}
          </div>

          <div className="overflow-y-auto p-1.5" style={{ maxHeight: place.maxH }}>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-60"
                >
                  <span aria-hidden className="text-[15px] leading-none">
                    ⊕
                  </span>
                  Agregar <strong className="font-semibold">{query.trim()}</strong>
                </button>
              )}
              {total === 0 && !canCreate && <p className="px-2.5 py-2 text-[13px] text-muted">Sin resultados.</p>}
              {total === 0 && canCreate && <p className="px-2.5 pb-1 pt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">0 resultados</p>}
              {visible.map((s, i) => (
                <div key={s.title ?? i}>
                  {s.title && <p className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{s.title}</p>}
                  {s.items.map((o) => {
                    const on = selected.has(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => onToggle(o.id)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-surface-2"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] leading-none',
                            on ? 'border-ink bg-ink text-white' : 'border-line-2 bg-surface',
                          )}
                        >
                          {on ? '✓' : ''}
                        </span>
                        <span className="font-medium">{o.name}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-7 items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-[13px]', className)}>{children}</span>;
}

// --- Muscles -----------------------------------------------------------------

export function MusclePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useTaxonomy();
  const cache = useTaxonomyCache();
  const muscles = data?.muscles ?? [];
  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <TagPopover
      addLabel="Agregar músculos"
      placeholder="Buscar o agregar músculos"
      sections={[{ items: muscles }]}
      selected={selected}
      onToggle={toggle}
      onCreate={async (name) => {
        const m: Muscle = await api.taxonomy.createMuscle({ name });
        cache.patch((t) => ({ ...t, muscles: [...t.muscles, m] }));
        onChange([...value, m.id]);
      }}
      chips={value.map((id) => {
        const m = muscles.find((x) => x.id === id);
        return (
          <Chip key={id} className="border-line-2 bg-surface-2 text-ink-2">
            <span className="font-semibold">{m?.name ?? '…'}</span>
            <button type="button" onClick={() => toggle(id)} className="rounded-full px-1 text-faint-2 hover:text-accent-dark" aria-label={`Quitar ${m?.name ?? ''}`}>
              ✕
            </button>
          </Chip>
        );
      })}
    />
  );
}

// --- Equipment ---------------------------------------------------------------

export function EquipmentPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useTaxonomy();
  const cache = useTaxonomyCache();
  const items = data?.equipment ?? [];
  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <TagPopover
      addLabel="Agregar equipo"
      placeholder="Buscar o agregar equipo"
      sections={[{ items }]}
      selected={selected}
      onToggle={toggle}
      onCreate={async (name) => {
        const e: Equipment = await api.taxonomy.createEquipment({ name });
        cache.patch((t) => ({ ...t, equipment: [...t.equipment, e] }));
        onChange([...value, e.id]);
      }}
      chips={value.map((id) => {
        const e = items.find((x) => x.id === id);
        return (
          <Chip key={id} className="border-line-2 bg-surface-2 text-ink-2">
            <span className="font-semibold">{e?.name ?? '…'}</span>
            <button type="button" onClick={() => toggle(id)} className="rounded-full px-1 text-faint-2 hover:text-accent-dark" aria-label={`Quitar ${e?.name ?? ''}`}>
              ✕
            </button>
          </Chip>
        );
      })}
    />
  );
}
