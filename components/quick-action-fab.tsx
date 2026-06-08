'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, X, ArrowDownCircle, ArrowUpCircle, FileText, QrCode,
  MessageCircle, Calendar, TrendingUp, TrendingDown, Target,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { usePJ } from '@/lib/pj-context';

type Action = {
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  color: string;
};

const PF_ACTIONS: Action[] = [
  {
    label: 'Nova Receita',
    icon: <TrendingUp className="w-4 h-4" />,
    href: '/receitas?new=1',
    color: 'bg-green-500 hover:bg-green-600 text-white',
  },
  {
    label: 'Nova Despesa',
    icon: <TrendingDown className="w-4 h-4" />,
    href: '/despesas?new=1',
    color: 'bg-red-500 hover:bg-red-600 text-white',
  },
  {
    label: 'Nova Meta',
    icon: <Target className="w-4 h-4" />,
    href: '/metas?new=1',
    color: 'bg-blue-500 hover:bg-blue-600 text-white',
  },
  {
    label: 'Ver Hoje',
    icon: <Calendar className="w-4 h-4" />,
    href: '/hoje',
    color: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
];

const PJ_ACTIONS: Action[] = [
  {
    label: 'Conta a Pagar',
    icon: <ArrowDownCircle className="w-4 h-4" />,
    href: '/pj/contas-pagar?new=1',
    color: 'bg-red-500 hover:bg-red-600 text-white',
  },
  {
    label: 'Conta a Receber',
    icon: <ArrowUpCircle className="w-4 h-4" />,
    href: '/pj/contas-receber?new=1',
    color: 'bg-green-500 hover:bg-green-600 text-white',
  },
  {
    label: 'Nota Fiscal',
    icon: <FileText className="w-4 h-4" />,
    href: '/pj/nfe?new=1',
    color: 'bg-blue-500 hover:bg-blue-600 text-white',
  },
  {
    label: 'Boleto / PIX',
    icon: <QrCode className="w-4 h-4" />,
    href: '/pj/cobrancas?new=1',
    color: 'bg-purple-500 hover:bg-purple-600 text-white',
  },
  {
    label: 'Ver Hoje',
    icon: <Calendar className="w-4 h-4" />,
    href: '/hoje',
    color: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  {
    label: 'WhatsApp',
    icon: <MessageCircle className="w-4 h-4" />,
    href: '/configuracoes/whatsapp',
    color: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  },
];

export function QuickActionFAB() {
  const router = useRouter();
  const { activeEnv } = usePJ();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Close when env changes
  useEffect(() => { setOpen(false); }, [activeEnv]);

  const actions = activeEnv === 'pj' ? PJ_ACTIONS : PF_ACTIONS;

  const handleAction = (action: Action) => {
    setOpen(false);
    if (action.href) router.push(action.href);
    else action.onClick?.();
  };

  if (!mounted) return null;

  const fab = (
    <div
      ref={containerRef}
      className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2"
    >
      {open && (
        <div className="flex flex-col items-end gap-2 mb-1">
          {actions.map((action, i) => (
            <div
              key={action.label}
              className="flex items-center gap-2"
              style={{ animation: `slideUpFade 0.15s ease-out ${i * 0.04}s both` }}
            >
              <span className="text-xs font-medium bg-popover text-popover-foreground shadow-md border border-border px-2.5 py-1 rounded-lg whitespace-nowrap">
                {action.label}
              </span>
              <button
                onClick={() => handleAction(action)}
                className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110 ${action.color}`}
                title={action.label}
              >
                {action.icon}
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen(v => !v)}
        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 ${
          open
            ? 'bg-foreground text-background rotate-45'
            : 'bg-primary text-primary-foreground hover:scale-105'
        }`}
        aria-label={open ? 'Fechar menu' : 'Ações rápidas'}
        title={open ? 'Fechar' : 'Ações rápidas'}
      >
        {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>
    </div>
  );

  return createPortal(fab, document.body);
}
