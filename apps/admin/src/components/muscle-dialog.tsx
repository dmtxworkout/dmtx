'use client';

// Add or edit a muscle in one place: its name, zone, the other names people
// search it by, and the picture marking it on a body.
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { MUSCLE_ZONE, MUSCLE_ZONE_LABEL, type Muscle, type MuscleZone } from '@dmtx/schemas';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { ActionsMenu } from '@/components/ui/actions-menu';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { MediaField } from '@/components/media-field';

const fieldLabel = 'mb-1.5 block text-[13px] font-semibold text-ink-2';

export function MuscleDialog({
  muscle,
  onClose,
  onSaved,
}: {
  /** The muscle to edit; null adds a new one. */
  muscle: Muscle | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = useState(muscle?.name ?? '');
  const [zone, setZone] = useState<MuscleZone | null>(muscle?.zone ?? null);
  const [aliases, setAliases] = useState<string[]>(muscle?.aliases ?? []);
  const [draft, setDraft] = useState('');
  const [imageAssetId, setImageAssetId] = useState<string | null>(muscle?.imageAssetId ?? null);
  const [saving, setSaving] = useState(false);

  /** The list with what is being typed added to it (commas separate several). */
  const withDraft = () => {
    const seen = new Set(aliases.map((a) => a.toLowerCase()));
    const out = [...aliases];
    for (const a of draft.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!seen.has(a.toLowerCase())) out.push(a);
      seen.add(a.toLowerCase());
    }
    return out;
  };
  const onAliasKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      setAliases(withDraft());
      setDraft('');
    } else if (e.key === 'Backspace' && !draft) {
      setAliases(aliases.slice(0, -1));
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !zone) return;
    setSaving(true);
    try {
      const input = { name: name.trim(), zone, aliases: withDraft(), imageAssetId };
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
    <Dialog open onClose={onClose} title={muscle ? muscle.name : 'Agregar músculo'} className="max-w-lg">
      <form onSubmit={(e) => void save(e)} className="flex min-h-0 flex-col">
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_170px] gap-3">
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
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onAliasKey}
                placeholder={aliases.length ? '' : 'p. ej. isquios, hamstrings'}
                className="h-6 min-w-[120px] flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted-2 focus:outline-none"
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-ink-3">
              Escribe cada uno y presiona Enter. Solo se usan para buscar: en la app se muestra el nombre.
            </p>
          </div>

          <MediaField kind="image" label="Imagen del músculo" value={imageAssetId} onChange={setImageAssetId} />
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
