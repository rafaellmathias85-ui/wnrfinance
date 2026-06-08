'use client';

import { useState, ReactNode } from 'react';
import { Search, Filter, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FilterBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  activeFilterCount?: number;
  onClearFilters?: () => void;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  children,
  actions,
  collapsible = false,
  defaultExpanded = true,
  activeFilterCount = 0,
  onClearFilters,
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-card border border-border/60 rounded-xl mb-4 overflow-hidden"
      style={{ boxShadow: 'var(--shadow-sm)' }}>

      {/* Main bar */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        {onSearchChange && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchValue || ''}
              onChange={e => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9 h-8 text-sm bg-background border-border/60"
            />
          </div>
        )}

        {/* Collapsible toggle */}
        {collapsible && children && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-8 gap-1.5 text-xs border-border/60"
          >
            <Filter className="w-3.5 h-3.5" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold leading-none">
                {activeFilterCount}
              </span>
            )}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        )}

        {/* Clear filters */}
        {activeFilterCount > 0 && onClearFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" />
            Limpar
          </Button>
        )}

        {/* Actions */}
        {actions && (
          <div className="ml-auto flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* Expanded filter area */}
      {children && (!collapsible || expanded) && (
        <div className="flex flex-wrap gap-2 items-end px-4 pb-3 pt-1 border-t border-border/30">
          {children}
        </div>
      )}
    </div>
  );
}
