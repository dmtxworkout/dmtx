'use client';

// Pickers for an exercise's tags, in the style of Shopify's product tags: the
// field shows the chosen tags and an "Agregar" button that opens a popover
// where existing tags are searched and ticked, and a name that doesn't exist
// yet is created right there ("Agregar «…»").
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Equipment, ExerciseMuscleInput, Muscle, MuscleGroup, MuscleRole, Taxonomy } from '@dmtx/schemas';
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
  /** Creates a tag named `name` and ticks it. Return false to keep the popover open (e.g. a second step is showing). */
  onCreate: (name: string) => Promise<boolean>;
  /** Rendered instead of the list while a creation needs more input (the muscle's group). */
  createStep?: ReactNode;
  /** The chosen tags, rendered inside the field in front of the opener. */
  chips?: ReactNode;
}

function TagPopover({ addLabel, placeholder, sections, selected, onToggle, onCreate, createStep, chips }: TagPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  // Closing, or finishing a two-step creation, starts the search afresh.
  const creating = !!createStep;
  useEffect(() => {
    if (!open || !creating) setQuery('');
  }, [open, creating]);

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
      const done = await onCreate(name);
      if (done) setQuery('');
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

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-line-2 bg-surface shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
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

          {createStep ?? (
            <div className="max-h-72 overflow-y-auto p-1.5">
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
                  Agregar «{query.trim()}»
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
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-7 items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-[13px]', className)}>{children}</span>;
}

// --- Muscles -----------------------------------------------------------------

export function MusclePicker({ value, onChange }: { value: ExerciseMuscleInput[]; onChange: (v: ExerciseMuscleInput[]) => void }) {
  const { data } = useTaxonomy();
  const cache = useTaxonomyCache();
  const muscles = data?.muscles ?? [];
  const groups = data?.groups ?? [];
  // A muscle being created: it needs a group, chosen (or created) in a second step.
  const [pending, setPending] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState('');
  const [busy, setBusy] = useState(false);

  const sections = useMemo<Section[]>(() => {
    const byGroup = groups.map((g) => ({ title: g.name, items: muscles.filter((m) => m.muscleGroupId === g.id) })).filter((s) => s.items.length);
    const orphans = muscles.filter((m) => !groups.some((g) => g.id === m.muscleGroupId));
    return orphans.length ? [...byGroup, { items: orphans }] : byGroup;
  }, [groups, muscles]);
  const selected = useMemo(() => new Set(value.map((v) => v.muscleId)), [value]);

  const add = (muscleId: string) => onChange([...value, { muscleId, role: value.length ? 'secondary' : 'primary' }]);
  const remove = (muscleId: string) => onChange(value.filter((v) => v.muscleId !== muscleId));
  const toggle = (id: string) => (selected.has(id) ? remove(id) : add(id));
  const setRole = (muscleId: string, role: MuscleRole) => onChange(value.map((v) => (v.muscleId === muscleId ? { ...v, role } : v)));

  const createIn = async (group: MuscleGroup | { name: string }) => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      let g: MuscleGroup;
      if ('id' in group) g = group;
      else {
        g = await api.taxonomy.createGroup({ name: group.name });
        cache.patch((t) => ({ ...t, groups: [...t.groups, g] }));
      }
      const m: Muscle = await api.taxonomy.createMuscle({ name: pending, muscleGroupId: g.id });
      cache.patch((t) => ({ ...t, muscles: [...t.muscles, m] }));
      add(m.id);
      setPending(null);
      setNewGroup('');
    } finally {
      setBusy(false);
    }
  };

  const createStep = pending ? (
    <div className="p-1.5">
      <p className="px-2.5 pb-1 pt-1.5 text-[13px] text-ink-2">
        Agregar <span className="font-semibold text-ink">«{pending}»</span> en el grupo:
      </p>
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          disabled={busy}
          onClick={() => void createIn(g)}
          className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium text-ink hover:bg-surface-2 disabled:opacity-60"
        >
          {g.name}
        </button>
      ))}
      {/* Not a <form>: the picker already lives inside the exercise form. */}
      <div className="mt-1 flex items-center gap-1.5 border-t border-line-3 px-2.5 pt-2">
        <input
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (newGroup.trim()) void createIn({ name: newGroup.trim() });
          }}
          placeholder={groups.length ? 'Nuevo grupo…' : 'Nombre del grupo (p. ej. Pierna)'}
          className="h-8 min-w-0 flex-1 rounded-md border border-dashed border-line-2 bg-surface-3 px-2 text-[13px] text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => newGroup.trim() && void createIn({ name: newGroup.trim() })}
          disabled={!newGroup.trim() || busy}
          className="h-8 rounded-md bg-ink px-2.5 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          Crear
        </button>
      </div>
      <button type="button" onClick={() => setPending(null)} className="mt-1 px-2.5 py-1 text-[12px] text-muted hover:text-ink">
        ← Volver
      </button>
    </div>
  ) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <TagPopover
        addLabel="Agregar músculos"
        placeholder="Buscar o agregar músculos"
        sections={sections}
        selected={selected}
        onToggle={toggle}
        onCreate={async (name) => {
          setPending(name);
          return false;
        }}
        createStep={createStep}
        chips={value.map((v) => {
          const m = muscles.find((x) => x.id === v.muscleId);
          return (
            <Chip key={v.muscleId} className={v.role === 'primary' ? 'border-accent bg-accent-tint text-accent-dark' : 'border-line-2 bg-surface-2 text-ink-2'}>
              <span className="font-semibold">{m?.name ?? '…'}</span>
              <button
                type="button"
                onClick={() => setRole(v.muscleId, v.role === 'primary' ? 'secondary' : 'primary')}
                className="rounded-full px-1 font-mono text-[10px] uppercase tracking-[0.08em] opacity-80 hover:opacity-100"
                title="Cambiar entre principal y secundario"
              >
                {v.role === 'primary' ? 'principal' : 'secundario'}
              </button>
              <button type="button" onClick={() => remove(v.muscleId)} className="rounded-full px-1 text-faint-2 hover:text-accent-dark" aria-label={`Quitar ${m?.name ?? ''}`}>
                ✕
              </button>
            </Chip>
          );
        })}
      />
      <p className="text-[11px] leading-snug text-muted">El primero es el principal; pulsa la etiqueta de un músculo para cambiar principal / secundario.</p>
    </div>
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
        return true;
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
