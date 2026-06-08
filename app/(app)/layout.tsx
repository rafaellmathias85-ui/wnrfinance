'use client';

import AppSidebar from '@/components/app-sidebar';
import { PJProvider } from '@/lib/pj-context';
import { QuickActionFAB } from '@/components/quick-action-fab';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PJProvider>
      <AppSidebar>{children}</AppSidebar>
      <QuickActionFAB />
    </PJProvider>
  );
}
