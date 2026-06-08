'use client';

import { PageHeader } from '@/components/enterprise';
import { Plus, Search, Filter, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

interface ModulePageProps {
  title: string;
  subtitle: string;
  icon?: any;
  emptyMessage?: string;
  columns?: { key: string; label: string }[];
  showNewButton?: boolean;
  newButtonLabel?: string;
}

export function ModulePage({
  title,
  subtitle,
  emptyMessage = 'Nenhum registro encontrado.',
  columns = [],
  showNewButton = true,
  newButtonLabel = 'Novo',
}: ModulePageProps) {
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />

      {/* Toolbar */}
      <div className="bg-card border border-border/60 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-1.5" /> Filtros
            </Button>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1.5" /> Exportar
            </Button>
            {showNewButton && (
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1.5" /> {newButtonLabel}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table / Empty State */}
      <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
        {columns.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full enterprise-table">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  {columns.map(col => (
                    <th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {col.label}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    A\u00e7\u00f5es
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    {emptyMessage}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {columns.length === 0 && (
          <div className="px-4 py-12 text-center text-muted-foreground text-sm">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
