'use client';

import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown, FileX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DataGridColumn<T = any> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataGridProps<T = any> {
  columns: DataGridColumn<T>[];
  data: T[];
  keyField?: string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  loading?: boolean;
  skeletonRows?: number;
  totalItems?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  rowActions?: (row: T) => ReactNode;
  className?: string;
  compact?: boolean;
}

function GridSkeleton({ cols, rows, hasActions }: { cols: number; rows: number; hasActions: boolean }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-border/20">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className={`skeleton h-4 ${
                j === 0 ? 'w-36' : j % 3 === 0 ? 'w-20' : 'w-28'
              }`} style={{ opacity: 1 - i * 0.1 }} />
            </td>
          ))}
          {hasActions && (
            <td className="px-4 py-3">
              <div className="skeleton h-7 w-16 ml-auto rounded-lg" />
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

export function DataGrid<T extends Record<string, any>>({
  columns,
  data,
  keyField = 'id',
  onRowClick,
  emptyMessage = 'Nenhum registro encontrado',
  emptyIcon,
  loading = false,
  skeletonRows = 8,
  totalItems,
  page = 1,
  pageSize = 20,
  onPageChange,
  sortKey,
  sortDir,
  onSort,
  rowActions,
  className = '',
  compact = false,
}: DataGridProps<T>) {
  const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : 1;
  const showPagination = onPageChange && totalItems !== undefined && totalPages > 1;

  const alignClass = (a?: string) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className={`table-container ${className}`}>
      <div className="overflow-x-auto">
        <table className="enterprise-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`${alignClass(col.align)} ${col.headerClassName || ''} ${
                    col.sortable ? 'cursor-pointer select-none hover:text-foreground group' : ''
                  }`}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.header}
                    {col.sortable && (
                      <span className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                        {sortKey === col.key
                          ? (sortDir === 'asc'
                              ? <ArrowUp className="w-3 h-3 text-primary" />
                              : <ArrowDown className="w-3 h-3 text-primary" />)
                          : <ArrowUpDown className="w-3 h-3" />
                        }
                      </span>
                    )}
                  </span>
                </th>
              ))}
              {rowActions && <th className="w-16" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <GridSkeleton cols={columns.length} rows={skeletonRows} hasActions={!!rowActions} />
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)}>
                  <div className="empty-state">
                    {emptyIcon ?? <FileX className="empty-state-icon" />}
                    <p className="empty-state-title">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={row[keyField] ?? idx}
                  onClick={() => onRowClick?.(row)}
                  className={onRowClick ? 'cursor-pointer' : ''}
                >
                  {columns.map(col => (
                    <td key={col.key} className={`${alignClass(col.align)} ${col.className || ''}`}>
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="text-right" onClick={e => e.stopPropagation()}>
                      {rowActions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {showPagination && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {totalItems} registro{totalItems !== 1 ? 's' : ''} · página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPageChange?.(1)}>
              <ChevronsLeft className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>

            {/* Page number pills */}
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              const p = page <= 3 ? i + 1 : page - 2 + i;
              if (p < 1 || p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => onPageChange?.(p)}
                  className={`h-8 w-8 text-xs rounded-lg transition-colors font-medium ${
                    p === page
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {p}
                </button>
              );
            })}

            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPageChange?.(totalPages)}>
              <ChevronsRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
