'use client';

// «Mover a»: a searchable list of the library's folders (root first, children
// indented under their parent) with a way to create one right there.
import { useMemo, useState } from 'react';
import type { MediaFolder } from '@dmtx/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function folderPath(folders: MediaFolder[], id: string | null): MediaFolder[] {
  const path: MediaFolder[] = [];
  let cursor = id;
  while (cursor) {
    const f = folders.find((x) => x.id === cursor);
    if (!f) break;
    path.unshift(f);
    cursor = f.parentId;
  }
  return path;
}

/** Folders as a flat list in tree order with their depth, for indented menus. */
export function folderTree(folders: MediaFolder[]): { folder: MediaFolder; depth: number }[] {
  const out: { folder: MediaFolder; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const f of folders.filter((x) => x.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function FolderPicker({
  open,
  folders,
  title = 'Mover a',
  confirmLabel = 'Mover',
  /** Folders that cannot be chosen (a folder being moved, and what is inside it). */
  exclude = [],
  current,
  onClose,
  onPick,
  onCreate,
}: {
  open: boolean;
  folders: MediaFolder[];
  title?: string;
  confirmLabel?: string;
  exclude?: string[];
  /** Where the files are now (shown as such, still selectable). */
  current?: string | null;
  onClose: () => void;
  onPick: (folderId: string | null) => void;
  onCreate: (name: string, parentId: string | null) => Promise<MediaFolder>;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const tree = useMemo(() => folderTree(folders), [folders]);
  const q = query.trim().toLowerCase();
  const rows = q ? tree.filter(({ folder }) => folder.name.toLowerCase().includes(q)) : tree;
  const picked = chosen === undefined ? null : chosen;

  async function create() {
    const name = newName.trim();
    if (!name) return;
    const f = await onCreate(name, picked);
    setNewName('');
    setCreating(false);
    setChosen(f.id);
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} className="max-w-md">
      <div className="flex flex-col gap-3 p-4">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar carpetas" autoFocus />
        <ul className="max-h-72 overflow-y-auto rounded-lg border border-line-2">
          {!q && (
            <li>
              <button
                type="button"
                onClick={() => setChosen(null)}
                className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-surface-2', picked === null && chosen !== undefined && 'bg-accent-tint/40 font-semibold')}
              >
                <FolderIcon />
                Biblioteca
                {current === null && <span className="font-mono text-[10px] text-muted">· aquí</span>}
              </button>
            </li>
          )}
          {rows.map(({ folder, depth }) => {
            const off = exclude.includes(folder.id);
            return (
              <li key={folder.id}>
                <button
                  type="button"
                  disabled={off}
                  onClick={() => setChosen(folder.id)}
                  className={cn(
                    'flex w-full items-center gap-2 border-t border-line-3 px-3 py-2 text-left text-[13.5px] hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent',
                    picked === folder.id && 'bg-accent-tint/40 font-semibold',
                  )}
                  style={{ paddingLeft: 12 + (q ? 0 : depth) * 16 }}
                >
                  <FolderIcon />
                  <span className="truncate">{folder.name}</span>
                  {current === folder.id && <span className="font-mono text-[10px] text-muted">· aquí</span>}
                </button>
              </li>
            );
          })}
          {rows.length === 0 && q && <li className="px-3 py-2 text-[13px] text-muted">Ninguna carpeta se llama así.</li>}
        </ul>
        {creating ? (
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={picked ? `Nueva carpeta dentro de ${folders.find((f) => f.id === picked)?.name ?? ''}` : 'Nueva carpeta en Biblioteca'}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
            />
            <Button type="button" size="sm" disabled={!newName.trim()} onClick={() => void create()}>
              Crear
            </Button>
          </div>
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="self-start text-[13px] font-medium text-accent hover:text-accent-dark">
            + Nueva carpeta{picked ? ' aquí dentro' : ''}
          </button>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={chosen === undefined} onClick={() => onPick(picked)}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function FolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cn('h-4 w-4 shrink-0 text-ink-3', className)} aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
