'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ExerciseListItem } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { formatDateEs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const columnHelper = createColumnHelper<ExerciseListItem>();

export default function ExercisesPage() {
  const [search, setSearch] = useState('');
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exercises', search],
    queryFn: () => api.exercises.list({ search: search || undefined, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.exercises.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: es.exercises.fields.name,
        cell: (c) => <span className="font-medium text-zinc-900">{c.getValue()}</span>,
      }),
      columnHelper.accessor('difficulty', {
        header: es.exercises.fields.difficulty,
        cell: (c) => es.difficulty[c.getValue()],
      }),
      columnHelper.accessor('measurementType', {
        header: es.exercises.fields.measurementType,
        cell: (c) => es.measurement[c.getValue()],
      }),
      columnHelper.accessor('status', {
        header: es.exercises.fields.status,
        cell: (c) => <Badge tone={c.getValue()}>{es.status[c.getValue()]}</Badge>,
      }),
      columnHelper.accessor('updatedAt', {
        header: 'Actualizado',
        cell: (c) => <span className="text-zinc-500">{formatDateEs(c.getValue())}</span>,
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <span className="sr-only">{es.app.actions}</span>,
        cell: (c) => (
          <div className="flex justify-end gap-2">
            <Link href={`/ejercicios/${c.row.original.id}`}>
              <Button variant="outline" size="sm">
                {es.app.edit}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(es.app.confirmDelete)) remove.mutate(c.row.original.id);
              }}
            >
              {es.app.delete}
            </Button>
          </div>
        ),
      }),
    ],
    [remove],
  );

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{es.exercises.title}</h1>
          {data && <p className="text-sm text-zinc-500">{es.exercises.count(data.total)}</p>}
        </div>
        <Link href="/ejercicios/nuevo">
          <Button>{es.exercises.new}</Button>
        </Link>
      </div>

      <div className="mb-4 max-w-xs">
        <Input
          placeholder={es.app.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-zinc-500">{es.app.loading}</div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-600">{es.app.error}</div>
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">{es.exercises.empty}</div>
        ) : (
          <Table>
            <THead>
              {table.getHeaderGroups().map((hg) => (
                <TR key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((h) => (
                    <TH key={h.id}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </TH>
                  ))}
                </TR>
              ))}
            </THead>
            <TBody>
              {table.getRowModel().rows.map((row) => (
                <TR key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TD key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
