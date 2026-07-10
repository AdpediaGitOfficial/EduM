'use client';

/**
 * DataTable — generic server-paginated table bound to a list endpoint.
 * Provides search, filters, pagination, loading/empty/error states.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, Paged } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, Card, EmptyState, ErrorState, SearchInput, Select, Spinner } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useMemo(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function DataTable<T extends { id: string }>({
  endpoint,
  columns,
  filters = [],
  searchPlaceholder,
  actions,
  onRowClick,
  refreshKey,
  pageSize = 15,
  extraParams = {},
}: {
  endpoint: string;
  columns: Column<T>[];
  filters?: FilterDef[];
  searchPlaceholder?: string;
  actions?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  refreshKey?: number;
  pageSize?: number;
  extraParams?: Record<string, string>;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const debouncedSearch = useDebounced(search);

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...extraParams });
    if (debouncedSearch) p.set('search', debouncedSearch);
    for (const [k, v] of Object.entries(filterValues)) if (v) p.set(k, v);
    return p.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedSearch, filterValues, JSON.stringify(extraParams)]);

  const query = useQuery({
    queryKey: [endpoint, params, refreshKey],
    queryFn: () => api<Paged<T>>(`${endpoint}${endpoint.includes('?') ? '&' : '?'}${params}`),
    placeholderData: (prev) => prev,
  });

  const data = query.data;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
        <div className="min-w-52 flex-1">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={searchPlaceholder} />
        </div>
        {filters.map((f) => (
          <Select
            key={f.key}
            className="w-auto"
            value={filterValues[f.key] ?? ''}
            onChange={(e) => { setFilterValues((s) => ({ ...s, [f.key]: e.target.value })); setPage(1); }}
          >
            <option value="">{f.label}: all</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        ))}
      </div>

      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error)?.message} onRetry={() => query.refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState hint={debouncedSearch ? 'Try a different search' : undefined} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  {columns.map((c) => (
                    <th key={c.key} className={cn('px-4 py-2.5 font-medium', c.className)}>{c.header}</th>
                  ))}
                  {actions && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      'border-b border-slate-50 dark:border-slate-800/50',
                      onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    )}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-2.5', c.className)}>
                        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">{actions(row)}</div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 text-xs text-slate-500">
            <span>
              {data.total} total · page {data.page}/{data.totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
