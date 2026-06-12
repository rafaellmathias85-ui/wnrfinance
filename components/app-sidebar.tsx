'use client';
import { apiFetch } from '@/lib/fetch';
import { createPortal } from 'react-dom';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { signOut } from 'next-auth/react';
import { useHideAmounts } from '@/lib/hide-amounts-context';
import { FiscalMonitorBadge } from '@/components/pj/fiscal-monitor-badge';
import { Button } from '@/components/ui/button';

import {
  LogOut, Menu, X, Bell, Building2,
  ChevronDown, Briefcase, User, ShieldCheck, Eye, EyeOff,
  Wallet, ChevronRight,
} from 'lucide-react';
import {
  getModulesForContext,
  getAdminModule,
  getMenuForContext,
  type ModuleTab,
  type MegaMenuColumn,
} from '@/lib/menu-registry';

/* ================================================================== */
/*  MegaMenuTab — Portal-based mega menu (avoids overflow clipping)    */
/* ================================================================== */
function MegaMenuTab({
  mod, megaOpen, active, accentCls, inactiveCls, filteredCols, isAdmin: _isAdmin,
  openMega, closeMega, setActiveMega, isActive,
}: {
  mod: ModuleTab; megaOpen: boolean; active: boolean;
  accentCls: string; inactiveCls: string;
  filteredCols: MegaMenuColumn[]; isAdmin: boolean;
  openMega: (id: string) => void; closeMega: () => void;
  setActiveMega: (fn: any) => void;
  isActive: (href: string) => boolean;
}) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; maxLeft: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (megaOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuW = Math.min(filteredCols.length, 4) * 210 + 32;
      let left = rect.left;
      if (left + menuW > window.innerWidth - 16) {
        left = Math.max(8, rect.right - menuW);
      }
      setDropdownPos({ top: rect.bottom + 4, left, maxLeft: left });
    }
  }, [megaOpen, filteredCols.length]);

  const accentBg = _isAdmin ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' : 'bg-primary/8 dark:bg-primary/15 text-primary';
  const accentIcon = _isAdmin ? 'text-amber-600 dark:text-amber-400' : 'text-primary';

  const colWidth = filteredCols.length <= 3 ? 220 : 200;

  const dropdown = megaOpen && filteredCols.length > 0 && dropdownPos && mounted
    ? (createPortal(
        (<div
          className="fixed z-[9999] animate-slide-down"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: `${Math.min(filteredCols.length, 5) * colWidth + 32}px`,
            maxWidth: 'calc(100vw - 32px)',
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border) / 0.7)',
            borderRadius: '14px',
            boxShadow: 'var(--shadow-xl)',
          }}
          onMouseEnter={() => openMega(mod.id)}
          onMouseLeave={closeMega}
        >
          {/* Mega menu header with module name */}
          <div className="px-4 pt-3.5 pb-2.5 border-b border-border/50 flex items-center gap-2">
            <mod.icon className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{mod.label}</span>
          </div>
          <div className="p-4">
            <div className={`grid gap-5 ${filteredCols.length === 1 ? 'grid-cols-1' : filteredCols.length === 2 ? 'grid-cols-2' : filteredCols.length === 3 ? 'grid-cols-3' : filteredCols.length === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
              {filteredCols.map(col => (
                <div key={col.title}>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5 px-1">{col.title}</h4>
                  <div className="space-y-0.5">
                    {col.items.map(item => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-all group ${
                          isActive(item.href)
                            ? accentBg
                            : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        <item.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 transition-colors ${
                          isActive(item.href) ? accentIcon : 'text-muted-foreground group-hover:text-foreground'
                        }`} />
                        <div className="min-w-0">
                          <div className={`text-[13px] font-medium leading-tight ${isActive(item.href) ? 'text-primary' : ''}`}>{item.label}</div>
                          {item.description && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{item.description}</div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>) as any,
        document.body
      ) as any as React.ReactNode)
    : null;

  return (
    <div
      ref={btnRef}
      className="relative flex-shrink-0"
      onMouseEnter={() => openMega(mod.id)}
      onMouseLeave={closeMega}
    >
      <button
        onClick={() => setActiveMega((prev: string | null) => prev === mod.id ? null : mod.id)}
        className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap ${
          active || megaOpen ? accentCls : inactiveCls
        }`}
        aria-expanded={megaOpen}
      >
        <mod.icon className="w-3.5 h-3.5" />
        {mod.label}
        <ChevronDown className={`w-3 h-3 transition-transform ${megaOpen ? 'rotate-180' : ''}`} />
      </button>
      {dropdown}
    </div>
  );
}

/* ================================================================== */
/*  AppSidebar — Enterprise Top Nav with Mega Menus                    */
/* ================================================================== */
export default function AppSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession() || {};
  const { activeEnv, hasPJ, hasPF, switchEnv, companies, activeCompanyId, switchCompany } = usePJ();
  const { hideAmounts, toggleHideAmounts } = useHideAmounts();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [activeMega, setActiveMega] = useState<string | null>(null);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const megaTimeout = useRef<NodeJS.Timeout | null>(null);
  const companyRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const userRole = (session?.user as any)?.role;
  const isAdmin = userRole === 'admin';
  const modules = getModulesForContext(activeEnv);
  const adminMod = getAdminModule();

  // Keep company management visible to PJ users; item-level admin flags are filtered below.
  const visibleModules = modules;

  /* ---- Alert count ---- */
  useEffect(() => {
    apiFetch('/api/alerts')
      .then(r => r.json())
      .then(d => setAlertCount(d.unreadCount || 0))
      .catch(() => {});
  }, [pathname]);

  /* ---- Close on navigate ---- */
  useEffect(() => {
    setMobileOpen(false);
    setActiveMega(null);
    setCompanyOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  /* ---- Click outside ---- */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (companyRef.current && !companyRef.current.contains(e.target as Node)) setCompanyOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ---- Env switch ---- */
  const handleSwitchEnv = async (env: 'pf' | 'pj') => {
    await switchEnv(env);
    router.push(env === 'pj' ? '/pj/dashboard' : '/dashboard');
  };

  const handleSwitchCompany = async (companyId: string) => {
    await switchCompany(companyId);
    setCompanyOpen(false);
  };

  const activeCompanyName = companies.find(c => c.id === activeCompanyId)?.name || 'Selecionar empresa';

  /* ---- Mega menu hover ---- */
  const openMega = useCallback((id: string) => {
    if (megaTimeout.current) clearTimeout(megaTimeout.current);
    setActiveMega(id);
  }, []);

  const closeMega = useCallback(() => {
    megaTimeout.current = setTimeout(() => setActiveMega(null), 150);
  }, []);

  /* ---- Active module detection ---- */
  const isModuleActive = (mod: ModuleTab) => {
    if (mod.singleLink && mod.columns.length === 0) {
      return pathname === mod.singleLink || pathname?.startsWith(mod.singleLink + '/');
    }
    return mod.columns.some(col =>
      col.items.some(item => pathname === item.href || pathname?.startsWith(item.href + '/'))
    );
  };

  const isActive = (href: string) => pathname === href || pathname?.startsWith?.(href + '/');

  /* ---- Filter admin items from columns ---- */
  const filterColumns = (columns: MegaMenuColumn[]): MegaMenuColumn[] => {
    if (isAdmin) return columns;
    return columns
      .map(col => ({
        ...col,
        items: col.items.filter(item => !item.adminOnly),
      }))
      .filter(col => col.items.length > 0);
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ======== TOP NAV BAR ======== */}
      <header className="fixed top-0 left-0 right-0 z-50 safe-top"
        style={{
          height: 'var(--nav-height, 60px)',
          background: 'hsl(var(--background) / 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid hsl(var(--border) / 0.7)',
          boxShadow: '0 1px 3px rgb(0 0 0 / 0.04)',
        }}>
        <div className="flex items-center h-full px-4 gap-1 w-full">

          {/* Logo */}
          <Link href={activeEnv === 'pj' ? '/pj/dashboard' : '/dashboard'} className="flex items-center gap-2.5 mr-4 flex-shrink-0 group">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-all group-hover:scale-105"
              style={{ background: 'linear-gradient(135deg, hsl(221 83% 48%) 0%, hsl(240 80% 58%) 100%)' }}>
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="text-[15px] font-bold tracking-tight" style={{ background: 'linear-gradient(135deg, hsl(221 83% 45%) 0%, hsl(240 80% 55%) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                WNR Finance
              </span>
            </div>
          </Link>

          {/* Divider */}
          <div className="hidden lg:block w-px h-6 bg-border/60 mx-2" />

          {/* Environment Switcher — always visible */}
          <div className="flex items-center rounded-lg bg-muted p-0.5 mr-2 flex-shrink-0">
            <button
              onClick={() => handleSwitchEnv('pf')}
              className={`flex items-center gap-1 py-1 px-2.5 rounded-md text-xs font-semibold transition-all ${
                activeEnv === 'pf'
                  ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <User className="w-3 h-3" />
              <span className="hidden md:inline">PF</span>
            </button>
            <button
              onClick={() => hasPJ ? handleSwitchEnv('pj') : router.push('/pj/empresa')}
              className={`flex items-center gap-1 py-1 px-2.5 rounded-md text-xs font-semibold transition-all ${
                activeEnv === 'pj'
                  ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm'
                  : hasPJ
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-muted-foreground/50 hover:text-muted-foreground'
              }`}
              title={hasPJ ? 'Ambiente empresarial' : 'Cadastrar empresa'}
            >
              <Briefcase className="w-3 h-3" />
              <span className="hidden md:inline">PJ</span>
            </button>
          </div>

          {/* Monitor fiscal (badge SEFAZ — paridade BomControle) */}
          {activeEnv === 'pj' && (
            <div className="mr-1 flex-shrink-0 hidden md:block">
              <FiscalMonitorBadge />
            </div>
          )}

          {/* Company Selector */}
          {activeEnv === 'pj' && companies.length > 0 && (
            <div ref={companyRef} className="relative mr-2 flex-shrink-0 hidden md:block">
              <button
                onClick={() => setCompanyOpen(!companyOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-background text-sm hover:bg-muted transition-colors max-w-[200px]"
              >
                <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate text-xs font-medium">{activeCompanyName}</span>
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform flex-shrink-0 ${companyOpen ? 'rotate-180' : ''}`} />
              </button>
              {companyOpen && (
                <div className="absolute top-full left-0 mt-1.5 bg-popover border border-border rounded-xl shadow-xl z-50 min-w-[240px] py-1 animate-slide-down">
                  <div className="px-3 py-1.5 border-b border-border/60">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Empresas</span>
                  </div>
                  {companies.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleSwitchCompany(c.id)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-muted ${
                        c.id === activeCompanyId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <div className={`truncate font-medium ${c.id === activeCompanyId ? 'text-blue-700 dark:text-blue-400' : 'text-foreground'}`}>{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.cnpj}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ======== Module Tabs (Desktop) ======== */}
          <nav className="hidden lg:flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-hide" role="navigation" aria-label="Menu principal"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div className="flex items-center gap-0.5 flex-nowrap">
            {[...visibleModules, ...(isAdmin ? [{ ...adminMod, _isAdmin: true } as ModuleTab & { _isAdmin?: boolean }] : [])].map((mod) => {
              const _isAdmin = (mod as any)._isAdmin;
              const active = _isAdmin ? pathname?.startsWith('/admin') : isModuleActive(mod);
              const isSingle = mod.singleLink && mod.columns.length === 0;
              const hasMega = !isSingle;
              const megaOpen = activeMega === mod.id;
              const filteredCols = hasMega ? filterColumns(mod.columns) : [];
              const accentCls = _isAdmin ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 shadow-sm' : 'text-primary bg-primary/8 dark:bg-primary/15 font-semibold shadow-sm';
              const inactiveCls = _isAdmin ? 'text-amber-600/70 dark:text-amber-400/70 hover:bg-amber-50 dark:hover:bg-amber-900/10 hover:text-amber-700' : 'text-foreground/70 hover:text-foreground hover:bg-muted/80 font-medium';

              if (isSingle) {
                return (
                  <Link
                    key={mod.id}
                    href={mod.singleLink!}
                    className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                      active ? accentCls : inactiveCls
                    }`}
                  >
                    <mod.icon className="w-3.5 h-3.5" />
                    {mod.label}
                    {mod.id.includes('alertas') && alertCount > 0 && (
                      <span className="bg-red-500 text-white text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                        {alertCount}
                      </span>
                    )}
                  </Link>
                );
              }

              return (
                <MegaMenuTab
                  key={mod.id}
                  mod={mod}
                  megaOpen={megaOpen}
                  active={!!active}
                  accentCls={accentCls}
                  inactiveCls={inactiveCls}
                  filteredCols={filteredCols}
                  isAdmin={!!_isAdmin}
                  openMega={openMega}
                  closeMega={closeMega}
                  setActiveMega={setActiveMega}
                  isActive={isActive}
                />
              );
            })}
            </div>
          </nav>

          {/* ======== Right actions ======== */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            {/* Hide amounts */}
            <button
              onClick={toggleHideAmounts}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title={hideAmounts ? 'Mostrar valores' : 'Ocultar valores'}
            >
              {hideAmounts
                ? <EyeOff className="w-4 h-4 text-amber-500" />
                : <Eye className="w-4 h-4 text-muted-foreground" />
              }
            </button>

            {/* Alerts bell — context-aware */}
            <Link href={activeEnv === 'pj' ? '/pj/alertas' : '/alertas'} className="relative p-2 rounded-lg hover:bg-muted transition-colors">
              <Bell className="w-4 h-4 text-muted-foreground" />
              {alertCount > 0 && (
                <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {alertCount}
                </span>
              )}
            </Link>

            {/* Divider */}
            <div className="hidden lg:block w-px h-6 bg-border/60 mx-1" />

            {/* User menu */}
            <div ref={userMenuRef} className="relative hidden lg:block">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white flex items-center justify-center text-xs font-bold">
                  {session?.user?.name?.[0]?.toUpperCase?.() ?? 'U'}
                </div>
                <div className="hidden xl:block text-left">
                  <p className="text-xs font-medium text-foreground truncate max-w-[120px] leading-tight">{session?.user?.name ?? 'Usuário'}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{isAdmin ? 'Administrador' : 'Usuário'}</p>
                </div>
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {userMenuOpen && (
                <div className="absolute top-full right-0 mt-1.5 bg-popover border border-border rounded-xl shadow-xl z-50 min-w-[200px] py-1 animate-slide-down">
                  <div className="px-3 py-2 border-b border-border/60">
                    <p className="text-sm font-medium text-foreground">{session?.user?.name}</p>
                    <p className="text-[11px] text-muted-foreground">{session?.user?.email}</p>
                  </div>
                  <Link href={activeEnv === 'pj' ? '/pj/configuracoes' : '/configuracoes'} className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                    <span className="w-4 h-4 flex items-center justify-center text-muted-foreground">⚙</span>
                    Configurações
                  </Link>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sair
                  </button>
                </div>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* ======== MOBILE DRAWER ======== */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-background shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 overflow-hidden">
            {/* Drawer header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white flex items-center justify-center text-sm font-bold">
                  {session?.user?.name?.[0]?.toUpperCase?.() ?? 'U'}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{session?.user?.name ?? 'Usuário'}</p>
                  <p className="text-[10px] text-muted-foreground">{session?.user?.email ?? ''}</p>
                </div>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Env switcher — always visible */}
            <div className="px-4 py-3 border-b border-border">
              <div className="flex rounded-lg bg-muted p-1">
                <button
                  onClick={() => { handleSwitchEnv('pf'); setMobileOpen(false); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-all ${
                    activeEnv === 'pf' ? 'bg-white dark:bg-gray-800 text-blue-700 shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  <User className="w-3.5 h-3.5" /> Pessoal
                </button>
                <button
                  onClick={() => {
                    if (hasPJ) { handleSwitchEnv('pj'); setMobileOpen(false); }
                    else { router.push('/pj/empresa'); setMobileOpen(false); }
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-all ${
                    activeEnv === 'pj'
                      ? 'bg-white dark:bg-gray-800 text-blue-700 shadow-sm'
                      : hasPJ ? 'text-muted-foreground' : 'text-muted-foreground/50'
                  }`}
                  title={hasPJ ? undefined : 'Cadastrar empresa'}
                >
                  <Briefcase className="w-3.5 h-3.5" /> {hasPJ ? 'Empresa' : '+ Empresa'}
                </button>
              </div>
              {activeEnv === 'pj' && companies.length > 0 && (
                <div className="mt-2 space-y-1">
                  {companies.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { handleSwitchCompany(c.id); setMobileOpen(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        c.id === activeCompanyId
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <div className="truncate">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.cnpj}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile menu - module groups */}
            <nav className="flex-1 p-3 space-y-3 overflow-y-auto">
              {visibleModules.map(mod => {
                const isSingle = mod.singleLink && mod.columns.length === 0;
                if (isSingle) {
                  return (
                    <Link
                      key={mod.id}
                      href={mod.singleLink!}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        isActive(mod.singleLink!)
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <mod.icon className="w-5 h-5 flex-shrink-0" />
                      <span className="flex-1">{mod.label}</span>
                      {mod.id.includes('alertas') && alertCount > 0 && (
                        <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                          {alertCount}
                        </span>
                      )}
                    </Link>
                  );
                }

                const allItems = filterColumns(mod.columns).flatMap(c => c.items);
                return (
                  <div key={mod.id}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 mb-1 font-bold">{mod.label}</p>
                    {allItems.map(item => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          isActive(item.href)
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                            : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        <span className="flex-1">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                );
              })}
              {isAdmin && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-amber-600/70 px-3 mb-1 font-bold">Admin</p>
                  <Link
                    href="/admin"
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive('/admin')
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                        : 'text-amber-600/70 hover:bg-amber-50 dark:hover:bg-amber-900/10'
                    }`}
                  >
                    <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                    <span>Painel Admin</span>
                  </Link>
                </div>
              )}
            </nav>

            {/* Footer */}
            <div className="border-t border-border p-4 space-y-1">
              <button
                onClick={toggleHideAmounts}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors"
              >
                {hideAmounts ? <EyeOff className="w-4 h-4 text-amber-500" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                <span className="text-xs text-muted-foreground">{hideAmounts ? 'Valores ocultos' : 'Ocultar valores'}</span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10 justify-start"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* ======== MAIN CONTENT ======== */}
      <main className="flex-1" style={{ paddingTop: 'var(--nav-height, 60px)' }}>
        <div className="px-4 py-4 lg:px-6 lg:py-6">{children}</div>
      </main>

      {/* Mega menu backdrop */}
      {activeMega && (
        <div
          className="fixed inset-0 z-40 bg-black/5"
          onClick={() => setActiveMega(null)}
          style={{ top: 'var(--nav-height, 60px)' }}
        />
      )}
    </div>
  );
}
