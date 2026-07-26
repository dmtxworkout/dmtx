/** Display-only search field for base pages (wire up per screen when needed). */
export function SearchField({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-9 w-[300px] items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5 text-sm text-muted-2">
      <span>⌕</span>
      <span className="truncate">{placeholder}</span>
    </div>
  );
}
