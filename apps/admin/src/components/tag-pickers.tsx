'use client';

// Pickers for an exercise's tags: muscles (with a primary / secondary role)
// searched from a dropdown, and equipment toggled as chips.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ExerciseMuscleInput, MuscleRole } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function useTaxonomy() {
  return useQuery({ queryKey: ['taxonomy'], queryFn: () => api.taxonomy.get(), staleTime: 60_000 });
}

export function MusclePicker({ value, onChange }: { value: ExerciseMuscleInput[]; onChange: (v: ExerciseMuscleInput[]) => void }) {
  const { data } = useTaxonomy();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const muscles = data?.muscles ?? [];
  const groups = data?.groups ?? [];
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? '';
  const options = useMemo(() => {
    const q = fold(query.trim());
    const chosen = new Set(value.map((v) => v.muscleId));
    const nameOfGroup = (id: string) => groups.find((g) => g.id === id)?.name ?? '';
    return muscles
      .filter((m) => !chosen.has(m.id))
      .filter((m) => !q || fold(`${m.name} ${nameOfGroup(m.muscleGroupId)}`).includes(q))
      .slice(0, 12);
  }, [query, muscles, value, groups]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const add = (muscleId: string) => {
    // The first muscle is the primary one; later ones start secondary.
    onChange([...value, { muscleId, role: value.length ? 'secondary' : 'primary' }]);
    setQuery('');
    setActive(0);
  };
  const setRole = (muscleId: string, role: MuscleRole) => onChange(value.map((v) => (v.muscleId === muscleId ? { ...v, role } : v)));
  const remove = (muscleId: string) => onChange(value.filter((v) => v.muscleId !== muscleId));

  return (
    <div className="flex flex-col gap-2.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => {
            const m = muscles.find((x) => x.id === v.muscleId);
            return (
              <span
                key={v.muscleId}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2.5 pr-1 text-[13px]',
                  v.role === 'primary' ? 'border-accent bg-accent-tint text-accent-dark' : 'border-line-2 bg-surface-2 text-ink-2',
                )}
              >
                <span className="font-semibold">{m?.name ?? '…'}</span>
                <button
                  type="button"
                  onClick={() => setRole(v.muscleId, v.role === 'primary' ? 'secondary' : 'primary')}
                  className="rounded-full px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] opacity-80 hover:opacity-100"
                  title="Cambiar entre principal y secundario"
                >
                  {v.role === 'primary' ? 'principal' : 'secundario'}
                </button>
                <button type="button" onClick={() => remove(v.muscleId)} className="rounded-full px-1 text-faint-2 hover:text-accent-dark" aria-label={`Quitar ${m?.name ?? ''}`}>
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div ref={box} className="relative">
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (options.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const o = options[active];
              if (o) add(o.id);
            } else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={muscles.length ? 'Buscar músculo…' : 'Crea músculos en "Músculos y equipo"'}
          disabled={!muscles.length}
          className="h-9 w-full rounded-lg border border-line-2 bg-surface px-3 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none disabled:opacity-60"
        />
        {open && options.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
            {options.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(m.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px]',
                  i === active ? 'bg-accent-tint text-ink' : 'text-ink-2 hover:bg-surface-2',
                )}
              >
                <span className="font-semibold">{m.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{groupName(m.muscleGroupId)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] leading-snug text-muted">El primero es el principal; pulsa la etiqueta de un músculo para cambiar principal / secundario.</p>
    </div>
  );
}

export function EquipmentPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useTaxonomy();
  const items = data?.equipment ?? [];
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  if (!items.length) return <p className="text-[13px] text-muted">Crea equipo en «Músculos y equipo» para etiquetar ejercicios.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((e) => {
        const on = value.includes(e.id);
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => toggle(e.id)}
            aria-pressed={on}
            className={cn(
              'rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors',
              on ? 'border-ink bg-ink text-white' : 'border-line-2 bg-surface text-ink-3 hover:bg-surface-2',
            )}
          >
            {e.name}
          </button>
        );
      })}
    </div>
  );
}
