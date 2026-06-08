'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/fetch';

type Env = 'pf' | 'pj';

interface Company {
  id: string;
  name: string;
  cnpj: string;
  role: string;
}

interface PJContextType {
  activeEnv: Env;
  hasPF: boolean;
  hasPJ: boolean;
  activeCompanyId: string | null;
  activeCompanyRole: string | null;
  companies: Company[];
  switchEnv: (env: Env) => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
  loading: boolean;
}

const PJContext = createContext<PJContextType>({
  activeEnv: 'pf',
  hasPF: true,
  hasPJ: false,
  activeCompanyId: null,
  activeCompanyRole: null,
  companies: [],
  switchEnv: async () => {},
  switchCompany: async () => {},
  loading: true,
});

export function PJProvider({ children }: { children: React.ReactNode }) {
  const { data: session, update } = useSession() || {};
  const pathname = usePathname();
  const [activeEnv, setActiveEnv] = useState<Env>('pf');
  const [hasPF, setHasPF] = useState(true);
  const [hasPJ, setHasPJ] = useState(false);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [activeCompanyRole, setActiveCompanyRole] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const envFromPath = useCallback((path?: string | null): Env | null => {
    if (!path) return null;
    if (path === '/pj' || path.startsWith('/pj/')) return 'pj';
    if (
      path === '/dashboard' ||
      path === '/hoje' ||
      path.startsWith('/pf/') ||
      path.startsWith('/despesas') ||
      path.startsWith('/receitas') ||
      path.startsWith('/caixinhas') ||
      path.startsWith('/cartoes') ||
      path.startsWith('/investimentos') ||
      path.startsWith('/alertas') ||
      path.startsWith('/relatorios') ||
      path.startsWith('/bancos') ||
      path.startsWith('/assistente') ||
      path.startsWith('/conciliacao')
    ) return 'pf';
    return null;
  }, []);

  // Sync from session. On PF/PJ routes, the route itself is authoritative.
  useEffect(() => {
    if (session?.user) {
      const u = session.user as any;
      setHasPF(u.hasPF !== false);
      setHasPJ(u.hasPJ === true);
      setActiveEnv(envFromPath(pathname) ?? (u.defaultEnv === 'pj' ? 'pj' : 'pf'));
      setActiveCompanyId(u.activeCompanyId || null);
      setActiveCompanyRole(u.activeCompanyRole || null);
    }
  }, [session, pathname, envFromPath]);

  useEffect(() => {
    const routeEnv = envFromPath(pathname);
    if (routeEnv) setActiveEnv(routeEnv);
  }, [pathname, envFromPath]);

  // Fetch companies when PJ is active
  useEffect(() => {
    if (hasPJ) {
      apiFetch('/api/pj/companies')
        .then(r => r.ok ? r.json() : [])
        .then(data => setCompanies(Array.isArray(data) ? data : data.companies || []))
        .catch(() => setCompanies([]))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [hasPJ]);

  const switchEnv = useCallback(async (env: Env) => {
    try {
      const res = await apiFetch('/api/pj/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switchEnv', env }),
      });
      if (!res.ok) throw new Error('Erro ao trocar ambiente');
      setActiveEnv(env);
      if (update) await update();
    } catch (e) {
      console.error('Erro ao trocar ambiente:', e);
    }
  }, [update]);

  const switchCompany = useCallback(async (companyId: string) => {
    try {
      const res = await apiFetch('/api/pj/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switchCompany', companyId }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveCompanyId(companyId);
        setActiveCompanyRole(data.role || null);
        if (update) await update();
      }
    } catch (e) {
      console.error('Erro ao trocar empresa:', e);
    }
  }, [update]);

  return (
    <PJContext.Provider value={{
      activeEnv, hasPF, hasPJ, activeCompanyId, activeCompanyRole,
      companies, switchEnv, switchCompany, loading,
    }}>
      {children}
    </PJContext.Provider>
  );
}

export function usePJ() {
  return useContext(PJContext);
}
