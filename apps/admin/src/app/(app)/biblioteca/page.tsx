'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MediaFolder, MediaUsageItem } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { PageHeader } from '@/components/ui/page-header';
import { ActionsMenu } from '@/components/ui/actions-menu';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MediaBrowser } from '@/components/media-library';
import { FolderPicker, folderPath } from '@/components/folder-picker';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';

// useSearchParams needs a Suspense boundary above it for the build's static pass.
export default function BibliotecaPage() {
  return (
    <Suspense fallback={null}>
      <Biblioteca />
    </Suspense>
  );
}

function Biblioteca() {
  const qc = useQueryClient();
  const router = useRouter();
  // The open folder travels in the URL (?carpeta=…), so a folder can be linked and the back button works.
  const params = useSearchParams();
  const folderId = params.get('carpeta');
  const foldersQ = useQuery({ queryKey: ['media-folders'], queryFn: () => api.media.folders() });
  const folders = foldersQ.data?.items ?? [];
  const path = folderPath(folders, folderId);
  const openFolder = (id: string | null) =>
    router.push(id ? `/biblioteca?carpeta=${id}` : '/biblioteca');
  // New folder / rename: one small dialog with a name.
  const [folderDialog, setFolderDialog] = useState<{
    mode: 'create' | 'rename';
    folder?: MediaFolder;
    name: string;
  } | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<MediaFolder | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const refreshFolders = () => qc.invalidateQueries({ queryKey: ['media-folders'] });
  const createFolder = async (name: string, parentId: string | null) => {
    const f = await api.media.createFolder({ name, parentId });
    await refreshFolders();
    return f;
  };
  const saveFolder = useMutation({
    mutationFn: async () => {
      if (!folderDialog) return;
      const name = folderDialog.name.trim();
      if (folderDialog.mode === 'create')
        await api.media.createFolder({ name, parentId: folderId });
      else if (folderDialog.folder) await api.media.updateFolder(folderDialog.folder.id, { name });
    },
    onSuccess: () => {
      toast(folderDialog?.mode === 'create' ? 'Carpeta creada' : 'Carpeta renombrada');
      setFolderDialog(null);
      void refreshFolders();
    },
    onError: (e) => toast(e instanceof Error ? e.message : es.app.error, 'error'),
  });
  const deleteFolder = useMutation({
    mutationFn: (f: MediaFolder) => api.media.removeFolder(f.id),
    onSuccess: (_, f) => {
      toast(
        <>
          Carpeta <strong className="font-extrabold">{f.name}</strong> eliminada; su contenido pasó
          a la carpeta de arriba.
        </>,
      );
      setFolderToDelete(null);
      void refreshFolders();
      void qc.invalidateQueries({ queryKey: ['media'] });
      if (folderId === f.id) openFolder(f.parentId);
    },
    onError: (e) => toast(e instanceof Error ? e.message : es.app.error, 'error'),
  });
  const uploadRef = useRef<{ upload: () => void } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const clearSelection = () => {
    setSelected([]);
    setSelectedFolders([]);
  };
  // A folder and everything under it cannot be the destination of its own move.
  const descendants = (ids: string[]): string[] => {
    const out = new Set(ids);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
          out.add(f.id);
          grew = true;
        }
      }
    }
    return [...out];
  };
  const move = useMutation({
    mutationFn: async (target: string | null) => {
      const moved = selected.length ? (await api.media.move(selected, target)).moved : 0;
      for (const id of selectedFolders) await api.media.updateFolder(id, { parentId: target });
      return { moved, folders: selectedFolders.length };
    },
    onSuccess: ({ moved, folders: nFolders }, target) => {
      const name = target
        ? (folders.find((f) => f.id === target)?.name ?? 'la carpeta')
        : 'Biblioteca';
      const parts = [
        moved ? (moved === 1 ? '1 archivo' : `${moved} archivos`) : '',
        nFolders ? (nFolders === 1 ? '1 carpeta' : `${nFolders} carpetas`) : '',
      ].filter(Boolean);
      toast(
        <>
          {parts.join(' y ')} {moved + nFolders === 1 ? 'movido' : 'movidos'} a{' '}
          <strong className="font-extrabold">{name}</strong>
        </>,
      );
      setMoveOpen(false);
      clearSelection();
      void refreshFolders();
      void qc.invalidateQueries({ queryKey: ['media'] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : es.app.error, 'error'),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Before deleting, where each marked file is used: those are kept and listed.
  const [usage, setUsage] = useState<
    { id: string; name: string; items: MediaUsageItem[] }[] | null
  >(null);
  useEffect(() => {
    if (!confirmDelete) {
      setUsage(null);
      return;
    }
    let alive = true;
    void Promise.all(
      selected.map(async (id) => {
        const [asset, u] = await Promise.all([api.media.view(id), api.media.usage(id)]);
        return { id, name: asset.name, items: u.items };
      }),
    ).then((rows) => alive && setUsage(rows));
    return () => {
      alive = false;
    };
  }, [confirmDelete, selected]);
  const inUse = (usage ?? []).filter((u) => u.items.length);
  const free = (usage ?? []).filter((u) => !u.items.length).map((u) => u.id);

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api.media.remove(id);
      // Marked folders go too (what they hold moves up to the parent).
      for (const id of selectedFolders) await api.media.removeFolder(id);
    },
    onSuccess: (_, ids) => {
      setSelected((s) => s.filter((id) => !ids.includes(id)));
      setSelectedFolders([]);
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: ['media'] });
      void refreshFolders();
    },
  });
  const usageLabel: Record<MediaUsageItem['type'], string> = {
    exercise: 'ejercicio',
    workout: 'rutina',
    program: 'programa',
    skill: 'habilidad',
    skillLevel: 'nivel',
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={
          path.length ? (
            <span className="flex items-center gap-1.5">
              <Link
                href={
                  path.length > 1
                    ? `/biblioteca?carpeta=${path[path.length - 2]!.id}`
                    : '/biblioteca'
                }
                className="mr-1 flex h-7 w-7 items-center justify-center rounded-md border border-line-2 text-ink-3 hover:bg-surface-2 hover:text-ink"
                aria-label="Volver a la carpeta de arriba"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </Link>
              <Link href="/biblioteca" className="text-ink-3 hover:text-ink">
                {es.media.title}
              </Link>
              {path.map((f, i) => (
                <span key={f.id} className="flex items-baseline gap-1.5">
                  <span className="text-faint-2">/</span>
                  {i === path.length - 1 ? (
                    <span>{f.name}</span>
                  ) : (
                    <Link
                      href={`/biblioteca?carpeta=${f.id}`}
                      className="text-ink-3 hover:text-ink"
                    >
                      {f.name}
                    </Link>
                  )}
                </span>
              ))}
            </span>
          ) : (
            es.media.title
          )
        }
        actions={
          <>
            {path.length > 0 && (
              <ActionsMenu
                label="···"
                chevron={false}
                size="sm"
                ariaLabel="Acciones de la carpeta"
                items={[
                  {
                    label: 'Renombrar carpeta',
                    onSelect: () =>
                      setFolderDialog({
                        mode: 'rename',
                        folder: path[path.length - 1]!,
                        name: path[path.length - 1]!.name,
                      }),
                  },
                  {
                    label: 'Eliminar carpeta',
                    danger: true,
                    onSelect: () => setFolderToDelete(path[path.length - 1]!),
                  },
                ]}
              />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFolderDialog({ mode: 'create', name: '' })}
            >
              Nueva carpeta
            </Button>
            <Button type="button" size="sm" onClick={() => uploadRef.current?.upload()}>
              Subir
            </Button>
          </>
        }
      />
      <MediaBrowser
        kind="all"
        uploadRef={uploadRef}
        selectable="multi"
        selected={selected}
        onSelectedChange={setSelected}
        onOpen={(id) => router.push(`/biblioteca/${id}`)}
        layout="table"
        folder={{
          id: folderId,
          all: folders,
          onOpen: openFolder,
          onRename: (f) => setFolderDialog({ mode: 'rename', folder: f, name: f.name }),
          onDelete: setFolderToDelete,
          selected: selectedFolders,
          onSelectedChange: setSelectedFolders,
        }}
        className="min-h-0 flex-1 px-6 pt-4"
      />
      {selected.length + selectedFolders.length > 0 && (
        <div className="flex flex-none items-center justify-between gap-3 border-t border-line bg-surface px-6 py-3">
          <span className="text-sm text-ink-2">
            {[
              selected.length
                ? `${selected.length} ${selected.length === 1 ? 'archivo' : 'archivos'}`
                : '',
              selectedFolders.length
                ? `${selectedFolders.length} ${selectedFolders.length === 1 ? 'carpeta' : 'carpetas'}`
                : '',
            ]
              .filter(Boolean)
              .join(' y ')}{' '}
            {selected.length + selectedFolders.length === 1 ? 'marcado' : 'marcados'}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={clearSelection}>
              Desmarcar
            </Button>
            <Button type="button" variant="outline" onClick={() => setMoveOpen(true)}>
              Mover a…
            </Button>
            <Button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={remove.isPending}
            >
              {es.app.delete}
            </Button>
          </div>
        </div>
      )}

      <FolderPicker
        open={moveOpen}
        folders={folders}
        current={folderId}
        onClose={() => setMoveOpen(false)}
        exclude={descendants(selectedFolders)}
        onPick={(target) => move.mutate(target)}
        onCreate={createFolder}
      />

      <Dialog
        open={!!folderDialog}
        onClose={() => setFolderDialog(null)}
        title={
          folderDialog?.mode === 'rename'
            ? 'Renombrar carpeta'
            : path.length
              ? `Nueva carpeta en ${path[path.length - 1]!.name}`
              : 'Nueva carpeta'
        }
        className="max-w-sm"
      >
        {folderDialog && (
          <div className="flex flex-col gap-4 p-5">
            <Input
              autoFocus
              value={folderDialog.name}
              onChange={(e) => setFolderDialog({ ...folderDialog, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && folderDialog.name.trim()) saveFolder.mutate();
              }}
              placeholder="Nombre de la carpeta"
              maxLength={200}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setFolderDialog(null)}>
                {es.app.cancel}
              </Button>
              <Button
                type="button"
                disabled={!folderDialog.name.trim() || saveFolder.isPending}
                onClick={() => saveFolder.mutate()}
              >
                {saveFolder.isPending
                  ? es.app.saving
                  : folderDialog.mode === 'rename'
                    ? es.app.save
                    : 'Crear'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!folderToDelete}
        onClose={() => setFolderToDelete(null)}
        title="Eliminar carpeta"
        className="max-w-sm"
      >
        {folderToDelete && (
          <div className="flex flex-col gap-4 p-5">
            <p className="text-[14px] leading-relaxed text-ink-2">
              ¿Eliminar la carpeta{' '}
              <strong className="font-semibold text-ink">{folderToDelete.name}</strong>? Los
              archivos y carpetas que tenga dentro no se borran: pasan a{' '}
              <strong className="font-semibold text-ink">
                {folderToDelete.parentId
                  ? (folders.find((f) => f.id === folderToDelete.parentId)?.name ??
                    'la carpeta de arriba')
                  : 'Biblioteca'}
              </strong>
              .
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setFolderToDelete(null)}>
                {es.app.cancel}
              </Button>
              <Button
                type="button"
                disabled={deleteFolder.isPending}
                onClick={() => deleteFolder.mutate(folderToDelete)}
              >
                {deleteFolder.isPending ? es.app.saving : es.app.delete}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Eliminar archivos"
        className="max-w-md"
      >
        <div className="flex flex-col gap-4 p-5">
          {usage === null ? (
            <p className="text-[14px] text-muted">{es.app.loading}</p>
          ) : (
            <>
              {selectedFolders.length > 0 && (
                <p className="text-[14px] leading-relaxed text-ink-2">
                  {selectedFolders.length === 1
                    ? 'La carpeta marcada se elimina'
                    : `Las ${selectedFolders.length} carpetas marcadas se eliminan`}
                  ; lo que tengan dentro no se borra, pasa a la carpeta de arriba.
                </p>
              )}
              {inUse.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[14px] leading-relaxed text-ink-2">
                    {inUse.length === 1
                      ? 'Este archivo se usa y no se puede eliminar. Quítalo de su contenido primero:'
                      : `Estos ${inUse.length} archivos se usan y no se pueden eliminar. Quítalos de su contenido primero:`}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {inUse.map((u) => (
                      <li key={u.id} className="text-[13px]">
                        <span className="font-semibold text-ink">{u.name}</span>
                        <span className="text-muted">
                          {' '}
                          · {u.items.map((it) => `${it.name} (${usageLabel[it.type]})`).join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {free.length > 0 && (
                <p className="text-[14px] leading-relaxed text-ink-2">
                  {inUse.length
                    ? 'El resto'
                    : free.length === 1
                      ? 'Este archivo'
                      : `Estos ${free.length} archivos`}{' '}
                  {free.length === 1
                    ? 'no se usa en ningún contenido'
                    : 'no se usan en ningún contenido'}
                  . ¿Eliminar{free.length === 1 ? 'lo' : 'los'}? Se borra también de Cloudflare.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                  {free.length || selectedFolders.length ? es.app.cancel : 'Entendido'}
                </Button>
                {(free.length > 0 || selectedFolders.length > 0) && (
                  <Button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(free)}
                  >
                    {remove.isPending
                      ? es.app.saving
                      : free.length === selected.length
                        ? es.app.delete
                        : `Eliminar ${free.length}`}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
