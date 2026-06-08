'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/fetch';

interface HideAmountsContextType {
  hideAmounts: boolean;
  toggleHideAmounts: () => void;
  maskValue: (value: string | number) => string;
}

const HideAmountsContext = createContext<HideAmountsContextType>({
  hideAmounts: false,
  toggleHideAmounts: () => {},
  maskValue: (v) => String(v),
});

export function HideAmountsProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession() || {};
  const [hideAmounts, setHideAmounts] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (session?.user) {
      apiFetch('/api/user/preferences')
        .then(r => r.json())
        .then(d => {
          setHideAmounts(d.hideAmounts ?? false);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    }
  }, [session?.user]);

  const toggleHideAmounts = useCallback(async () => {
    const newVal = !hideAmounts;
    setHideAmounts(newVal);
    try {
      await apiFetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hideAmounts: newVal }),
      });
    } catch (e) {
      console.error('Erro ao salvar preferência:', e);
      setHideAmounts(!newVal);
    }
  }, [hideAmounts]);

  const maskValue = useCallback((value: string | number): string => {
    if (!hideAmounts) return String(value);
    return '••••••';
  }, [hideAmounts]);

  return (
    <HideAmountsContext.Provider value={{ hideAmounts, toggleHideAmounts, maskValue }}>
      {children}
    </HideAmountsContext.Provider>
  );
}

export function useHideAmounts() {
  return useContext(HideAmountsContext);
}
