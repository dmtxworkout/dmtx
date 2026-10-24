'use client';

import { useEffect, useState } from 'react';
import { es } from '@/i18n/es';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MediaBrowser } from '@/components/media-library';

/** "Elegir de la biblioteca": the library in a fixed-height dialog, one pick, Listo. */
export function MediaPicker({
  kind,
  open,
  onClose,
  onPick,
  current = null,
}: {
  kind: 'image' | 'video';
  open: boolean;
  onClose: () => void;
  onPick: (assetId: string) => void;
  /** The field's file: marked when the picker opens. */
  current?: string | null;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (open) setSelected(current ? [current] : []);
  }, [open, current]);
  const close = () => {
    setSelected([]);
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} title={es.media.pickTitle} className="max-w-5xl md:h-[min(85vh,40rem)]">
      <MediaBrowser kind={kind} selectable="single" selected={selected} onSelectedChange={setSelected} className="min-h-0 flex-1 px-5 pt-4" />
      <div className="flex flex-none items-center justify-between gap-2 border-t border-line-3 px-5 py-3">
        <span className="text-xs text-muted">{selected.length ? '1 marcado' : ''}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={close}>
            {es.app.cancel}
          </Button>
          <Button
            type="button"
            disabled={!selected.length}
            onClick={() => {
              if (selected[0]) onPick(selected[0]);
              close();
            }}
          >
            Listo
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
