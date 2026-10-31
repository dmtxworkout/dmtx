'use client';

// The panel's form for a muscle: its name and the other names people search it
// by. The one part it lights up is picked on the page's body, and its zone
// follows from that part. Other names work like an exercise's muscles: a button
// opens a list of those already in use, by muscle, and what's typed filters it or
// adds a new one, in lower case. Another muscle's name can't be one.
import { useState, type FormEvent } from 'react';
import { BODY_PART_LABEL, BODY_PART_ZONE, MUSCLE_ZONE_LABEL, type BodyPart, type Muscle, type MuscleZone } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { Chip, TagPopover } from '@/components/tag-pickers';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';

const fieldLabel = 'mb-1.5 block text-[13px] font-semibold text-ink-2';
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function MuscleEditor({
  muscle,
  all,
  bodyPart,
  onCancel,
  onSaved,
  onDeleted,
}: {
  /** The muscle to edit; null adds a new one. */
  muscle: Muscle | null;
  all: Muscle[];
  /** What it lights up, picked on the page's body. */
  bodyPart: BodyPart | null;
  onCancel: () => void;
  onSaved: (zone: MuscleZone) => Promise<unknown>;
  onDeleted: () => Promise<unknown>;
}) {
  const [name, setName] = useState(muscle?.name ?? '');
  const [aliases, setAliases] = useState<string[]>(muscle?.aliases ?? []);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const others = all.filter((m) => m.id !== muscle?.id);
  const held = new Set(aliases.map(fold));
  const sections = [
    { title: 'Este músculo', items: aliases.map((a) => ({ id: a, name: a })) },
    ...others.map((m) => ({
      title: `Ya está en ${m.name}`,
      items: m.aliases.filter((a) => !held.has(fold(a))).map((a) => ({ id: a, name: a })),
    })),
  ].filter((s) => s.items.length);
  const toggleAlias = (alias: string) => setAliases(aliases.includes(alias) ? aliases.filter((a) => a !== alias) : [...aliases, alias]);
  const refuseAlias = (text: string) => {
    const q = fold(text);
    if (fold(name) === q) return 'Es el nombre de este músculo.';
    const taken = others.find((m) => fold(m.name) === q);
    return taken ? `«${taken.name}» ya es un músculo: no puede ser un alias.` : null;
  };

  // Cancelar and Guardar only appear once something changed.
  const dirty = name !== (muscle?.name ?? '') || aliases.join() !== (muscle?.aliases ?? []).join() || bodyPart !== (muscle?.bodyPart ?? null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || !name.trim() || !bodyPart) return;
    setSaving(true);
    try {
      const input = { name: name.trim(), aliases, bodyPart };
      if (muscle) await api.taxonomy.updateMuscle(muscle.id, input);
      else await api.taxonomy.createMuscle(input);
      await onSaved(BODY_PART_ZONE[bodyPart]);
      toast(muscle ? 'Músculo guardado' : 'Músculo agregado');
    } catch (err) {
      toast(err instanceof Error ? err.message : es.app.error, 'error');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!muscle) return;
    setSaving(true);
    try {
      await api.taxonomy.removeMuscle(muscle.id);
      await onDeleted();
      toast('Músculo eliminado');
    } catch (err) {
      toast(err instanceof Error ? err.message : es.app.error, 'error');
      setSaving(false);
      setConfirming(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-[59px] items-center gap-2 border-b border-line-3 px-5 py-3">
        {!dirty && (
          <button type="button" onClick={onCancel} aria-label="Volver a la lista" className="text-muted hover:text-ink">
            ←
          </button>
        )}
        <h2 className="min-w-0 truncate text-[15px] font-semibold text-ink">{muscle ? muscle.name : 'Agregar músculo'}</h2>
        <div className="ml-auto flex shrink-0 gap-2">
          {dirty ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                {es.app.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={saving || !name.trim() || !bodyPart}>
                {saving ? es.app.saving : 'Guardar'}
              </Button>
            </>
          ) : (
            muscle && (
              <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={saving}>
                {es.app.delete}
              </Button>
            )
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <label>
          <span className={fieldLabel}>Nombre</span>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Femorales" />
        </label>
        <div>
          <span className={fieldLabel}>Alias</span>
          <TagPopover
            addLabel="Agregar alias"
            placeholder="Buscar o agregar alias"
            sections={sections}
            selected={new Set(aliases)}
            onToggle={toggleAlias}
            onCreate={async (text) => setAliases([...aliases, text.toLowerCase()])}
            refuse={refuseAlias}
            chips={aliases.map((a) => (
              <Chip key={a} className="border-line-2 bg-surface-2 text-ink-2">
                <span className="font-semibold">{a}</span>
                <button type="button" onClick={() => toggleAlias(a)} className="rounded-full px-1 text-faint-2 hover:text-accent-dark" aria-label={`Quitar ${a}`}>
                  ✕
                </button>
              </Chip>
            ))}
          />
          <p className="mt-1.5 text-[11px] leading-4 text-ink-3">Solo se usan para buscar: en la app se muestra el nombre.</p>
        </div>

        <div>
          <span className={fieldLabel}>Parte del cuerpo</span>
          {bodyPart ? (
            <p className="text-[13px] leading-5 text-ink-2">
              {BODY_PART_LABEL[bodyPart]} <span className="text-ink-3">· zona {MUSCLE_ZONE_LABEL[BODY_PART_ZONE[bodyPart]]}</span>
            </p>
          ) : (
            <p className="text-[13px] leading-5 text-ink-3">Elige una en el cuerpo: la zona se asigna sola.</p>
          )}
        </div>
      </div>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Eliminar" className="max-w-sm">
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[14px] leading-relaxed text-ink-2">
            ¿Eliminar <strong className="font-semibold text-ink">{muscle?.name}</strong>?{' '}
            {muscle?.exerciseCount
              ? `Se quitará de ${muscle.exerciseCount === 1 ? 'el ejercicio que lo usa' : `los ${muscle.exerciseCount} ejercicios que lo usan`}. Los ejercicios siguen igual, solo sin esta etiqueta.`
              : 'Ningún ejercicio lo usa.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              {es.app.cancel}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void remove()}>
              {saving ? es.app.saving : es.app.delete}
            </Button>
          </div>
        </div>
      </Dialog>
    </form>
  );
}
