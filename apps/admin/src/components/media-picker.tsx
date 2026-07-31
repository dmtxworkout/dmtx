'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function MediaPicker({
  kind,
  open,
  onClose,
  onPick,
}: {
  kind: 'image' | 'video';
  open: boolean;
  onClose: () => void;
  onPick: (assetId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['media', kind, search],
    queryFn: () => api.media.list({ kind, search: search || undefined, pageSize: 60 }),
    enabled: open,
  });

  const items = data?.data ?? [];

  return (
    <Dialog open={open} onClose={onClose} title={es.media.pickTitle}>
      <div className="border-b border-line-3 p-3">
        <Input
          placeholder={es.app.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted">{es.app.loading}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">{es.media.empty}</div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onPick(m.id);
                  onClose();
                }}
                className="group flex flex-col gap-1.5 text-left"
              >
                <div className="relative aspect-video overflow-hidden rounded-lg border border-line transition-colors group-hover:border-accent">
                  {m.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.viewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <video src={m.viewUrl} muted className="absolute inset-0 h-full w-full object-cover" />
                  )}
                </div>
                <span className="truncate text-xs font-medium">{m.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
