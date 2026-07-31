'use client';

import { type DragEvent, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn, formatBytes } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';

const KINDS = [
  { key: 'all', label: es.media.all },
  { key: 'image', label: es.media.image },
  { key: 'video', label: es.media.video },
] as const;

type KindKey = (typeof KINDS)[number]['key'];

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

export default function BibliotecaPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<KindKey>('all');
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['media', kind, search],
    queryFn: () =>
      api.media.list({
        kind: kind === 'all' ? undefined : kind,
        search: search || undefined,
        pageSize: 100,
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.media.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  });

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const k = file.type.startsWith('video/') ? 'video' : 'image';
        await api.media.upload(file, k);
      }
      await qc.invalidateQueries({ queryKey: ['media'] });
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void uploadFiles(e.dataTransfer.files);
  }

  const items = data?.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={es.media.title}
        subtitle={data ? `${data.total} archivo${data.total === 1 ? '' : 's'}` : es.media.title}
        actions={
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? es.app.uploading : es.media.chooseFiles}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex h-9 w-[300px] items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5">
            <span className="text-muted-2">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar archivo"
              className="h-full flex-1 bg-transparent text-sm text-ink placeholder:text-muted-2 focus:outline-none"
            />
          </div>
          {KINDS.map((k) => (
            <Chip key={k.key} active={kind === k.key} onClick={() => setKind(k.key)}>
              {k.label}
            </Chip>
          ))}
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-[22px]">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'mb-[18px] flex cursor-pointer items-center gap-4 rounded-xl border border-dashed p-5 transition-colors',
            dragging ? 'border-accent bg-accent-tint/40' : 'border-line-2 bg-surface-3 hover:bg-surface-2',
          )}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-[#f0ece4] text-ink-3">
            <UploadIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[15px] font-semibold">{es.media.uploadHint}</div>
            <div className="font-mono text-xs text-muted">{es.media.uploadSub}</div>
          </div>
          <span className="ml-auto inline-flex h-[34px] items-center rounded-lg border border-line-2 bg-surface px-3.5 text-[13px] font-semibold">
            {uploading ? es.app.uploading : es.media.chooseFiles}
          </span>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted">{es.app.loading}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">{es.media.empty}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((m) => (
              <div key={m.id} className="group flex flex-col gap-2">
                <div className="relative aspect-video overflow-hidden rounded-[10px] border border-line">
                  {m.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.viewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <video src={m.viewUrl} muted className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  <span className="absolute left-2 top-2 rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                    {m.kind === 'image' ? 'IMG' : 'VIDEO'}
                  </span>
                  <button
                    type="button"
                    onClick={() => confirm(es.media.deleteConfirm) && remove.mutate(m.id)}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[11px] text-faint opacity-0 transition-opacity hover:text-accent-dark group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
                <div className="truncate text-[13px] font-semibold">{m.name}</div>
                <div className="font-mono text-[10px] text-muted">
                  {[m.kind === 'image' ? es.media.image : es.media.video, formatBytes(m.sizeBytes)]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
