'use client';

import { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface KpiItem {
  label: string;
  value: string | ReactNode;
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  color?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'purple';
  loading?: boolean;
}

interface KpiStripProps {
  items: KpiItem[];
  className?: string;
  loading?: boolean;
}

const colorConfig = {
  default: {
    icon: 'bg-blue-50 text-blue-600 dark:bg-blue-900/25 dark:text-blue-400',
    accent: 'border-l-blue-500',
    value: 'text-blue-700 dark:text-blue-300',
  },
  success: {
    icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400',
    accent: 'border-l-emerald-500',
    value: 'text-emerald-700 dark:text-emerald-300',
  },
  danger: {
    icon: 'bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400',
    accent: 'border-l-red-500',
    value: 'text-red-700 dark:text-red-300',
  },
  warning: {
    icon: 'bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-400',
    accent: 'border-l-amber-500',
    value: 'text-amber-700 dark:text-amber-300',
  },
  info: {
    icon: 'bg-sky-50 text-sky-600 dark:bg-sky-900/25 dark:text-sky-400',
    accent: 'border-l-sky-500',
    value: 'text-sky-700 dark:text-sky-300',
  },
  purple: {
    icon: 'bg-purple-50 text-purple-600 dark:bg-purple-900/25 dark:text-purple-400',
    accent: 'border-l-purple-500',
    value: 'text-purple-700 dark:text-purple-300',
  },
};

function KpiCardSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border/60 p-5 border-l-4 border-l-border">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="skeleton h-3 w-24 mb-3" />
          <div className="skeleton h-7 w-16" />
        </div>
        <div className="skeleton w-10 h-10 rounded-xl" />
      </div>
    </div>
  );
}

export function KpiStrip({ items, className = '', loading = false }: KpiStripProps) {
  const colClass =
    items.length === 1 ? 'grid-cols-1'
    : items.length === 2 ? 'grid-cols-1 sm:grid-cols-2'
    : items.length === 3 ? 'grid-cols-1 sm:grid-cols-3'
    : items.length <= 5 ? 'grid-cols-2 lg:grid-cols-5'
    : 'grid-cols-2 lg:grid-cols-4 xl:grid-cols-6';

  if (loading) {
    return (
      <div className={`grid gap-4 mb-6 ${colClass} ${className}`}>
        {items.map((_, i) => <KpiCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className={`grid gap-4 mb-6 ${colClass} ${className}`}>
      {items.map((item, i) => {
        const cfg = colorConfig[item.color || 'default'];
        return (
          <div
            key={i}
            className={`bg-card rounded-xl border border-border/60 border-l-4 ${cfg.accent} p-5 transition-shadow hover:shadow-md group`}
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 leading-none">
                  {item.label}
                </p>
                {item.loading ? (
                  <div className="skeleton h-7 w-20" />
                ) : (
                  <p className={`text-xl lg:text-2xl font-bold tracking-tight truncate ${cfg.value}`}>
                    {item.value}
                  </p>
                )}
              </div>
              {item.icon && (
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.icon} group-hover:scale-105 transition-transform`}>
                  {item.icon}
                </div>
              )}
            </div>
            {item.change !== undefined && !item.loading && (
              <div className="flex items-center gap-1.5 mt-3">
                {item.change > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                ) : item.change < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                ) : (
                  <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className={`text-xs font-bold ${item.change > 0 ? 'text-emerald-600' : item.change < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {item.change > 0 ? '+' : ''}{item.change.toFixed(1)}%
                </span>
                {item.changeLabel && (
                  <span className="text-[11px] text-muted-foreground">{item.changeLabel}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
