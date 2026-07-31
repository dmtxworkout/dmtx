'use client';

import { type ReactNode, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { es } from '@/i18n/es';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/** Generic search-and-pick dialog for referencing another entity. */
export function EntityPicker<T extends { id: string }>({
  open,
  onClose,
  onPick,
  title,
  queryKey,
  load,
  renderTitle,
  renderSubtitle,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: T) => void;
  title: string;
  queryKey: string;
  load: (search: string) => Promise<T[]>;
  renderTitle: (item: T) => ReactNode;
  renderSubtitle?: (item: T) => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: [queryKey, search],
    queryFn: () => load(search),
    enabled: open,
  });
  const items = data ?? [];

  return (
    <Dialog open={open} onClose={onClose} title={title} className="max-w-lg">
      <div className="border-b border-line-3 p-3">
        <Input
          placeholder={es.app.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted">{es.app.loading}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">Sin resultados</div>
        ) : (
          <div className="flex flex-col">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  onPick(it);
                  onClose();
                }}
                className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left hover:bg-surface-2"
              >
                <span className="text-sm font-semibold">{renderTitle(it)}</span>
                {renderSubtitle && (
                  <span className="font-mono text-[11px] text-muted">{renderSubtitle(it)}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
