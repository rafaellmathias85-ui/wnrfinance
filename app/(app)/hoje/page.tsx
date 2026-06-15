'use client';
import { apiFetch } from '@/lib/fetch';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui/use-toast';
import { useFormatCurrency } from '@/hooks/use-format-currency';

import {
  ArrowDownCircle, ArrowUpCircle, AlertTriangle, CheckCircle2,
  Clock, TrendingUp, TrendingDown, RefreshCw, ExternalLink,
  ChevronDown, ChevronRight, Calendar, Zap,
  PiggyBank, Wallet, Target, LineChart, Tag,
} from 'lucide-react';

// ─── PJ types ───────────────────────────────────────────────────────────────

type Bill = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  status: string;
  category?: { name: string } | null;
  clientName?: string;
  supplierName?: string;
};

type Section = {
  payables: Bill[];
  receivables: Bill[];
  totalPayable: number;
  totalReceivable: number;
};

type HojeData = {
  today: Section;
  tomorrow: Section;
  thisWeek: Section;
  overdue: Section;
  completedToday: {
    received: { total: number; count: number };
    paid: { total: number; count: number };
  };
  projectedFlow: { date: string; inflow: number; outflow: number; balance: number }[];
};

// ─── PF types ───────────────────────────────────────────────────────────────

type PfSummary = {
  income: number; expenses: number; savings: number;
  resultado: number; pocketMargin: number; savingsRate: number;
};

type PfRecentTx = {
  id: string; date: string; group: string; subgroup: string;
  description: string | null; amount: number;
};

type PfHojeData = {
  year: number; month: number;
  summary: PfSummary;
  totalBuckets: number;
  recent: PfRecentTx[];
};

// ─── Shared helpers ──────────────────────────────────────────────────────────

function formatDateLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}

function daysDiff(iso: string) {
  const due = new Date(iso + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((due.getTime() - today.getTime()) / 86_400_000);
}

// ─── PJ sub-components ───────────────────────────────────────────────────────

type BillCardProps = {
  bill: Bill;
  type: 'payable' | 'receivable';
  onAction: (id: string, type: 'payable' | 'receivable', action: 'pay' | 'receive') => Promise<void>;
  loading: boolean;
};

function BillCard({ bill, type, onAction, loading }: BillCardProps) {
  const fmt = useFormatCurrency();
  const diff = daysDiff(bill.dueDate.split('T')[0]);
  const isOverdue = diff < 0;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
      isOverdue
        ? 'border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20'
        : 'border-border bg-card hover:bg-muted/40'
    }`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        type === 'payable'
          ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
      }`}>
        {type === 'payable' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{bill.description}</p>
        <p className="text-xs text-muted-foreground">
          {bill.category?.name || (type === 'payable' ? 'Fornecedor' : 'Cliente')}
          {isOverdue && <span className="ml-1 text-red-500 font-medium">• {Math.abs(diff)}d em atraso</span>}
          {diff === 0 && <span className="ml-1 text-amber-600 font-medium">• Vence hoje</span>}
          {diff === 1 && <span className="ml-1 text-amber-500 font-medium">• Vence amanhã</span>}
          {diff > 1 && <span className="ml-1">• {formatDateLabel(bill.dueDate.split('T')[0])}</span>}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-semibold ${type === 'payable' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
          {fmt(Number(bill.amount))}
        </p>
      </div>
      <button
        onClick={() => onAction(bill.id, type, type === 'payable' ? 'pay' : 'receive')}
        disabled={loading}
        className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          type === 'payable'
            ? 'bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-300'
            : 'bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-300'
        } disabled:opacity-50`}
      >
        {type === 'payable' ? 'Pagar' : 'Receber'}
      </button>
    </div>
  );
}

type CollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  accent: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: number;
  badgeColor?: string;
};

function CollapsibleSection({ title, subtitle, icon, accent, defaultOpen = true, children, badge, badgeColor }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 ${accent} text-left`}
      >
        {icon}
        <div className="flex-1">
          <span className="font-semibold text-sm">{title}</span>
          {subtitle && <span className="text-xs opacity-70 ml-2">{subtitle}</span>}
        </div>
        {badge !== undefined && badge > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badgeColor || 'bg-white/30'}`}>{badge}</span>
        )}
        {open ? <ChevronDown className="w-4 h-4 opacity-60" /> : <ChevronRight className="w-4 h-4 opacity-60" />}
      </button>
      {open && <div className="divide-y divide-border/50">{children}</div>}
    </div>
  );
}

// ─── PF "Hoje" view ──────────────────────────────────────────────────────────

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function PfHojeView() {
  const fmt = useFormatCurrency();
  const [data, setData] = useState<PfHojeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/pf/hoje');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const todayLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const s = data?.summary;
  const savingsRateFmt = s ? `${s.savingsRate.toFixed(1)}%` : '—';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold capitalize">{todayLabel}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Resumo pessoal — {data ? `${MONTHS[data.month - 1]} ${data.year}` : ''}
          </p>
        </div>
        <button
          onClick={() => { setRefreshing(true); fetchData(); }}
          disabled={refreshing}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title="Atualizar"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Receitas do mês</p>
          <p className="text-lg font-bold text-green-600 dark:text-green-400 mt-1">{fmt(s?.income || 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Despesas do mês</p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-1">{fmt(s?.expenses || 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pocket Margin</p>
          <p className={`text-lg font-bold mt-1 ${(s?.pocketMargin || 0) >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
            {fmt(s?.pocketMargin || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Taxa de Poupança</p>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">{savingsRateFmt}</p>
        </div>
      </div>

      {/* Savings buckets total */}
      {(data?.totalBuckets ?? 0) > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <PiggyBank className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Saldo total nas Caixinhas</p>
            <p className="text-xs text-muted-foreground">Soma de todas as reservas ativas</p>
          </div>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{fmt(data?.totalBuckets || 0)}</p>
        </div>
      )}

      {/* Recent transactions */}
      {(data?.recent.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Últimos lançamentos do mês</h3>
            <Link href="/pf/lancamentos" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              Ver todos <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border/50">
            {data?.recent.map(tx => {
              const isIncome = tx.amount > 0;
              const isSavings = tx.group === 'Poupança';
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isIncome ? 'bg-green-100 dark:bg-green-900/30' :
                    isSavings ? 'bg-blue-100 dark:bg-blue-900/30' :
                    'bg-red-100 dark:bg-red-900/30'
                  }`}>
                    {isIncome ? <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> :
                     isSavings ? <PiggyBank className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> :
                     <TrendingDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description || tx.subgroup}</p>
                    <p className="text-xs text-muted-foreground">{tx.group} · {new Date(tx.date).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <p className={`text-sm font-semibold flex-shrink-0 ${
                    isIncome ? 'text-green-600 dark:text-green-400' :
                    isSavings ? 'text-blue-600 dark:text-blue-400' :
                    'text-red-600 dark:text-red-400'
                  }`}>
                    {isIncome ? '+' : ''}{fmt(tx.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {(data?.recent.length ?? 0) === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <Wallet className="w-12 h-12 text-muted-foreground" />
          <h3 className="font-semibold text-lg">Nenhum lançamento ainda</h3>
          <p className="text-sm text-muted-foreground">Comece registrando suas receitas e despesas do mês.</p>
          <Link href="/pf/lancamentos" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500">
            Novo Lançamento
          </Link>
        </div>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Link href="/pf/orcamento" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors">
          <Target className="w-3.5 h-3.5" /> Orçamento <ExternalLink className="w-3 h-3 opacity-50" />
        </Link>
        <Link href="/pf/lancamentos" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors">
          <Wallet className="w-3.5 h-3.5" /> Lançamentos <ExternalLink className="w-3 h-3 opacity-50" />
        </Link>
        <Link href="/pf/poupanca" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors">
          <PiggyBank className="w-3.5 h-3.5" /> Poupança <ExternalLink className="w-3 h-3 opacity-50" />
        </Link>
        <Link href="/pf/investimentos" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors">
          <LineChart className="w-3.5 h-3.5" /> Investimentos <ExternalLink className="w-3 h-3 opacity-50" />
        </Link>
        <Link href="/bancos" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors">
          <Tag className="w-3.5 h-3.5" /> Meus Bancos <ExternalLink className="w-3 h-3 opacity-50" />
        </Link>
      </div>
    </div>
  );
}

// ─── PJ "Hoje" view ───────────────────────────────────────────────────────────

function PjHojeView() {
  const fmt = useFormatCurrency();
  const { activeCompanyId } = usePJ();
  const { toast } = useToast();
  const [data, setData] = useState<HojeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!activeCompanyId) { setLoading(false); return; }
    try {
      const res = await apiFetch('/api/pj/hoje');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = useCallback(async (id: string, type: 'payable' | 'receivable', action: 'pay' | 'receive') => {
    setActionLoading(id);
    try {
      const res = await apiFetch('/api/pj/hoje', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type, action }),
      });
      if (!res.ok) throw new Error('Erro ao atualizar');
      toast({ title: action === 'pay' ? 'Pagamento registrado!' : 'Recebimento registrado!', variant: 'default' });
      await fetchData();
    } catch {
      toast({ title: 'Erro ao registrar', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  }, [fetchData, toast]);

  if (!activeCompanyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Calendar className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Nenhuma empresa selecionada</h2>
        <Link href="/pj/empresa" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">
          Cadastrar Empresa
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d = data;
  const todayLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const totalOverdue = (d?.overdue.payables.length || 0) + (d?.overdue.receivables.length || 0);
  const totalToday = (d?.today.payables.length || 0) + (d?.today.receivables.length || 0);
  const maxFlow = d ? Math.max(...d.projectedFlow.map(p => Math.max(p.inflow, p.outflow)), 1) : 1;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold capitalize">{todayLabel}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Resumo financeiro do dia</p>
        </div>
        <button
          onClick={() => { setRefreshing(true); fetchData(); }}
          disabled={refreshing}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title="Atualizar"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pagar hoje</p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-1">{fmt(d?.today.totalPayable || 0)}</p>
          <p className="text-xs text-muted-foreground">{d?.today.payables.length || 0} conta(s)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Receber hoje</p>
          <p className="text-lg font-bold text-green-600 dark:text-green-400 mt-1">{fmt(d?.today.totalReceivable || 0)}</p>
          <p className="text-xs text-muted-foreground">{d?.today.receivables.length || 0} conta(s)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Em atraso</p>
          <p className={`text-lg font-bold mt-1 ${totalOverdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
            {fmt((d?.overdue.totalPayable || 0) + (d?.overdue.totalReceivable || 0))}
          </p>
          <p className="text-xs text-muted-foreground">{totalOverdue} conta(s)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Liquidado hoje</p>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">
            {fmt((d?.completedToday.received.total || 0) - (d?.completedToday.paid.total || 0))}
          </p>
          <p className="text-xs text-muted-foreground">
            {d?.completedToday.received.count || 0} rec. / {d?.completedToday.paid.count || 0} pag.
          </p>
        </div>
      </div>

      {/* Projected 7-day flow chart */}
      {d && d.projectedFlow.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold text-sm">Fluxo projetado — próximos 7 dias</h3>
          </div>
          <div className="flex items-end gap-2 h-24">
            {d.projectedFlow.map((day, i) => {
              const inflowH = Math.round((day.inflow / maxFlow) * 80);
              const outflowH = Math.round((day.outflow / maxFlow) * 80);
              const isToday = i === 0;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end gap-0.5 justify-center" style={{ height: 80 }}>
                    {day.inflow > 0 && (
                      <div
                        className={`w-1/2 rounded-t-sm ${isToday ? 'bg-green-500' : 'bg-green-300 dark:bg-green-700'}`}
                        style={{ height: inflowH || 2 }}
                        title={`Entrada: ${day.inflow.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                      />
                    )}
                    {day.outflow > 0 && (
                      <div
                        className={`w-1/2 rounded-t-sm ${isToday ? 'bg-red-500' : 'bg-red-300 dark:bg-red-700'}`}
                        style={{ height: outflowH || 2 }}
                        title={`Saída: ${day.outflow.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                      />
                    )}
                    {day.inflow === 0 && day.outflow === 0 && (
                      <div className="w-full h-0.5 bg-border rounded" />
                    )}
                  </div>
                  <span className={`text-[10px] ${isToday ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
                    {isToday ? 'Hoje' : formatDateLabel(day.date).split(',')[0]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-400 inline-block" /> Entradas</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" /> Saídas</span>
          </div>
        </div>
      )}

      {/* Overdue */}
      {totalOverdue > 0 && (
        <CollapsibleSection
          title="Em Atraso"
          subtitle={`${totalOverdue} item${totalOverdue > 1 ? 's' : ''}`}
          icon={<AlertTriangle className="w-4 h-4" />}
          accent="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
          badge={totalOverdue}
          badgeColor="bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-300"
          defaultOpen
        >
          <div className="p-3 space-y-2 bg-card">
            {d?.overdue.payables.map(b => (
              <BillCard key={b.id} bill={b} type="payable" onAction={handleAction} loading={actionLoading === b.id} />
            ))}
            {d?.overdue.receivables.map(b => (
              <BillCard key={b.id} bill={b} type="receivable" onAction={handleAction} loading={actionLoading === b.id} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Today */}
      {totalToday > 0 && (
        <CollapsibleSection
          title="Vence Hoje"
          subtitle={`${totalToday} item${totalToday > 1 ? 's' : ''}`}
          icon={<Clock className="w-4 h-4" />}
          accent="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
          badge={totalToday}
          badgeColor="bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-300"
          defaultOpen
        >
          <div className="p-3 space-y-2 bg-card">
            {d?.today.payables.map(b => (
              <BillCard key={b.id} bill={b} type="payable" onAction={handleAction} loading={actionLoading === b.id} />
            ))}
            {d?.today.receivables.map(b => (
              <BillCard key={b.id} bill={b} type="receivable" onAction={handleAction} loading={actionLoading === b.id} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Tomorrow */}
      {((d?.tomorrow.payables.length || 0) + (d?.tomorrow.receivables.length || 0)) > 0 && (
        <CollapsibleSection
          title="Vence Amanhã"
          subtitle={`${(d?.tomorrow.payables.length || 0) + (d?.tomorrow.receivables.length || 0)} item(s)`}
          icon={<Calendar className="w-4 h-4" />}
          accent="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"
          defaultOpen={false}
        >
          <div className="p-3 space-y-2 bg-card">
            {d?.tomorrow.payables.map(b => (
              <BillCard key={b.id} bill={b} type="payable" onAction={handleAction} loading={actionLoading === b.id} />
            ))}
            {d?.tomorrow.receivables.map(b => (
              <BillCard key={b.id} bill={b} type="receivable" onAction={handleAction} loading={actionLoading === b.id} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* This week */}
      {((d?.thisWeek.payables.length || 0) + (d?.thisWeek.receivables.length || 0)) > 0 && (
        <CollapsibleSection
          title="Esta Semana"
          subtitle={`${(d?.thisWeek.payables.length || 0) + (d?.thisWeek.receivables.length || 0)} item(s)`}
          icon={<Zap className="w-4 h-4" />}
          accent="bg-muted text-muted-foreground"
          defaultOpen={false}
        >
          <div className="p-3 space-y-2 bg-card">
            {d?.thisWeek.payables.map(b => (
              <BillCard key={b.id} bill={b} type="payable" onAction={handleAction} loading={actionLoading === b.id} />
            ))}
            {d?.thisWeek.receivables.map(b => (
              <BillCard key={b.id} bill={b} type="receivable" onAction={handleAction} loading={actionLoading === b.id} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Completed today */}
      {((d?.completedToday.received.count || 0) + (d?.completedToday.paid.count || 0)) > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-950/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">Concluído hoje</span>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">
              Recebido: <span className="font-medium text-green-600">{fmt(d?.completedToday.received.total || 0)}</span>
            </span>
            <span className="text-muted-foreground">
              Pago: <span className="font-medium text-red-600">{fmt(d?.completedToday.paid.total || 0)}</span>
            </span>
          </div>
        </div>
      )}

      {/* All clear */}
      {totalToday === 0 && totalOverdue === 0 && (d?.completedToday.received.count || 0) + (d?.completedToday.paid.count || 0) === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
          <h3 className="font-semibold text-lg">Tudo em dia!</h3>
          <p className="text-sm text-muted-foreground">Nenhum vencimento para hoje.</p>
        </div>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Link href="/pj/contas-pagar" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors">
          <TrendingDown className="w-3.5 h-3.5" /> Contas a Pagar <ExternalLink className="w-3 h-3 opacity-50" />
        </Link>
        <Link href="/pj/contas-receber" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors">
          <TrendingUp className="w-3.5 h-3.5" /> Contas a Receber <ExternalLink className="w-3 h-3 opacity-50" />
        </Link>
        <Link href="/pj/fluxo-caixa" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors">
          <TrendingUp className="w-3.5 h-3.5" /> Fluxo de Caixa <ExternalLink className="w-3 h-3 opacity-50" />
        </Link>
      </div>
    </div>
  );
}

// ─── Root page: branches on activeEnv ────────────────────────────────────────

export default function HojePage() {
  const { activeEnv } = usePJ();
  return activeEnv === 'pj' ? <PjHojeView /> : <PfHojeView />;
}
