'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/components/theme-provider';
import { HideAmountsProvider } from '@/lib/hide-amounts-context';
import { getBasePath } from '@/lib/fetch';
import { Toaster } from 'sonner';
import React from 'react';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath={`${getBasePath()}/api/auth`}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <HideAmountsProvider>
          {children}
          <Toaster richColors position="top-right" />
        </HideAmountsProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
