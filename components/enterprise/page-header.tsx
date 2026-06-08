'use client';

import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { ReactNode } from 'react';

export interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  badge?: ReactNode;
  icon?: ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumbs, actions, badge, icon }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-2.5" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground transition-colors">
            <Home className="w-3 h-3" />
          </Link>
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3 text-border" />
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-foreground transition-colors font-medium">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground font-semibold">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                {icon}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight leading-tight">{title}</h1>
                {badge && <div>{badge}</div>}
              </div>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 mt-1">
            {actions}
          </div>
        )}
      </div>

      {/* Subtle separator */}
      <div className="mt-4 h-px bg-gradient-to-r from-border via-border/60 to-transparent" />
    </div>
  );
}
