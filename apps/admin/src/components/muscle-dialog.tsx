'use client';

// Add or edit a muscle in one place: its name, zone, the other names people
// search it by, and what it lights up on the drawn body. While typing another
// name it lists those already in use that start the same, so the data stays
// consistent: one is reused only by choosing it, and another muscle's name
// can't be one.
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { MUSCLE_ZONE, MUSCLE_ZONE_LABEL, type BodyPart, type Muscle, type MuscleZone } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { ActionsMenu } from '@/components/ui/actions-menu';
import { BodyPicker } from '@/components/body-picker';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';

const fieldLabel = 'mb-1.5 block text-[13px] font-semibold text-ink-2';
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function MuscleDialog({
  muscle,
  all,
  onClose,
  onSaved,
}: {
  /** The muscle to edit; null adds a new one. */
  muscle: Muscle | null;
  all: Muscle[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = useState(muscle?.name ?? '');
  const [zone, setZone] = useState<MuscleZone | null>(muscle?.zone ?? null);
  const [aliases, setAliases] = useState<string[]>(muscle?.aliases ?? []);
  const [draft, setDraft] = useState('');
  const [bodyParts, setBodyParts] = useState<BodyPart[]>(muscle?.bodyParts ?? []);
  const [saving, setSaving] = useState(false);

  const others = all.filter((m) => m.id !== muscle?.id);
  const q = fold(draft);
  const inUse = q
    ? others.flatMap((m) => m.aliases.filter((a) => fold(a).startsWith(q)).map((alias) => ({ alias, owner: m.name })))
    : [];
  const isOwn = !!q && aliases.some((a) => fold(a) === q);
  const isOwnName = !!q && fold(name) === q;
  const nameTaken = q ? others.find((m) => fold(m.name) === q) : undefined;
  const aliasTaken = inUse.some((u) => fold(u.alias) === q);
  /** What typed text can be added as it is: an alias of another muscle only by choosing it. */
  const addable = !!q && !isOwn && !isOwnName && !nameTaken && !aliasTaken;

  const add = (alias: string) => {
    const clean = alias.trim().toLowerCase();
    if (clean && !aliases.some((a) => fold(a) === fold(clean))) setAliases([...aliases, clean]);
    setDraft('');
  };
  const onAliasKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (addable) add(draft);
    } else if (e.key === 'Backspace' && !draft) {
      setAliases(aliases.slice(0, -1));
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !zone) return;
    setSaving(true);
    try {
      const input = { name: name.trim(), zone, aliases: addable ? [...aliases, draft.trim().toLowerCase()] : aliases, bodyParts };
      if (muscle) await api.taxonomy.updateMuscle(muscle.id, input);
      else await api.taxonomy.createMuscle(input);
      await onSaved();
      toast(muscle ? 'Músculo guardado' : 'Músculo agregado');
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : es.app.error, 'error');
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={muscle ? muscle.name : 'Agregar músculo'} className="max-w-3xl">
      <form onSubmit={(e) => void save(e)} className="flex min-h-0 flex-col">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-6 overflow-y-auto p-5">
          <div className="flex flex-col gap-4">
            <label>
              <span className={fieldLabel}>Nombre</span>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Femorales" />
            </label>
            <div>
              <span className={fieldLabel}>Zona</span>
              <ActionsMenu
                align="left"
                label={zone ? MUSCLE_ZONE_LABEL[zone] : <span className="text-muted-2">Elegir zona</span>}
                items={MUSCLE_ZONE.map((z) => ({
                  label: (
                    <span className="flex w-full items-center gap-2">
                      <span className="w-3 text-ink">{zone === z ? '✓' : ''}</span>
                      {MUSCLE_ZONE_LABEL[z]}
                    </span>
                  ),
                  onSelect: () => setZone(z),
                }))}
              />
            </div>

            <div>
              <label htmlFor="muscle-aliases" className={fieldLabel}>
                También se busca como
              </label>
              <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg border border-line-2 bg-surface px-2 py-1.5 focus-within:border-accent/40">
                {aliases.map((a) => (
                  <span key={a} className="inline-flex h-6 items-center gap-1 rounded-full border border-line-2 bg-surface-2 pl-2.5 pr-1 text-[12px] text-ink-2">
                    {a}
                    <button
                      type="button"
                      onClick={() => setAliases(aliases.filter((x) => x !== a))}
                      className="rounded-full px-1 text-faint-2 hover:text-accent-dark"
                      aria-label={`Quitar ${a}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  id="muscle-aliases"
                  value={draft}
                  autoComplete="off"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onAliasKey}
                  placeholder={aliases.length ? '' : 'p. ej. isquios, hamstrings'}
                  className="h-6 min-w-[120px] flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted-2 focus:outline-none"
                />
              </div>
              {q && (
                <div className="mt-1 overflow-hidden rounded-lg border border-line-2 text-[13px]">
                  {inUse.map((u) => (
                    <button
                      key={`${u.owner}-${u.alias}`}
                      type="button"
                      onClick={() => add(u.alias)}
                      className="flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left hover:bg-surface-2"
                    >
                      <span className="text-ink">{u.alias}</span>
                      <span className="shrink-0 text-[12px] text-ink-3">ya está en {u.owner}</span>
                    </button>
                  ))}
                  {nameTaken && <p className="px-2.5 py-1.5 text-accent-dark">«{nameTaken.name}» ya es un músculo: no puede ser un sinónimo.</p>}
                  {isOwn && <p className="px-2.5 py-1.5 text-ink-3">Ya está en este músculo.</p>}
                  {isOwnName && <p className="px-2.5 py-1.5 text-ink-3">Es el nombre de este músculo.</p>}
                  {addable && (
                    <button type="button" onClick={() => add(draft)} className="block w-full px-2.5 py-1.5 text-left font-semibold text-ink hover:bg-surface-2">
                      + Agregar «{draft.trim().toLowerCase()}»
                    </button>
                  )}
                </div>
              )}
              <p className="mt-1.5 text-[11px] leading-4 text-ink-3">Solo se usan para buscar: en la app se muestra el nombre.</p>
            </div>
          </div>

          <BodyPicker value={bodyParts} onChange={setBodyParts} />
        </div>

        <div className="flex justify-end gap-2 border-t border-line-3 px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            {es.app.cancel}
          </Button>
          <Button type="submit" disabled={saving || !name.trim() || !zone}>
            {saving ? es.app.saving : muscle ? 'Guardar' : 'Agregar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
