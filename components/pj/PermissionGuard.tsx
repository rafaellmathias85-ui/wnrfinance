'use client';

import { usePermissions } from '@/hooks/use-permissions';

interface Props {
  module: string;
  action: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGuard({ module, action, children, fallback = null }: Props) {
  const { canDo, loading } = usePermissions();
  if (loading) return null;
  if (!canDo(module, action)) return <>{fallback}</>;
  return <>{children}</>;
}
