'use client';
import { apiFetch } from '@/lib/fetch';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { usePJ } from '@/lib/pj-context';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, DollarSign, FileCheck, LineChart } from 'lucide-react';
import { KpiStrip, PageHeader, type KpiItem } from '@/components/enterprise';
import { useFormatCurrency } from '@/hooks/use-format-currency';


interface DashboardData {
  month: {
    payables: { total: number; count: number };
    receivables: { total: number; count: number };
    paid: number;
    received: number;
    balance: number;
  };
  overdue: {
    payables: { total: number; count: number };
    receivables: { total: number; count: number };
  };
  recent: {
    payables: any[];
    receivables: any[];
  };
  investments?: {
    totalInvested: number;
    currentValue: number;
    count: number;
    byType: { type: string; value: number; count: number }[];
  };
  reconciliation?: Record<string, number>;
  banking?: { realBalance: number; forecastBalance30d: number; manualAccounts: number; connectedAccounts: number };
  fiscal?: { activeServiceRules: number; notesPending: number; notesAuthorized: number; notesRejected: number };
  charges?: { pending: { total: number; count: number }; overdue: { total: number; count: number } };
  operations?: { pendingReconciliation: number; divergentReconciliation: number };
  dre?: { revenue: number; expenses: number; operatingResult: number; margin: number };
  cashflow30d?: { date: string; receivable: number; payable: number; balance: number }[];
  payablesByCategory?: { category: string; total: number; count: number }[];
}

export default function PJDashboard() {
  const fmt = useFormatCurrency();
  const { activeCompanyId } = usePJ();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompanyId) { setLoading(false); return; }
    apiFetch('/api/pj/dashboard')
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [activeCompanyId]);

  if (!activeCompanyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-xl font-semibold">Nenhuma empresa selecionada</h2>
        <p className="text-muted-foreground">Cadastre ou selecione uma empresa para começar.</p>
        <Link href="/pj/empresa" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">Cadastrar Empresa</Link>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  const d = data?.month;
  const o = data?.overdue;

  const kpiItems: KpiItem[] = [
    {
      label: 'Contas a Pagar',
      value: fmt(d?.payables.total || 0),
      icon: <ArrowDownCircle className="w-5 h-5" />,
      color: 'danger',
    },
    {
      label: 'Contas a Receber',
      value: fmt(d?.receivables.total || 0),
      icon: <ArrowUpCircle className="w-5 h-5" />,
      color: 'success',
    },
    {
      label: 'Saldo do Mês',
      value: fmt(d?.balance || 0),
      icon: <DollarSign className="w-5 h-5" />,
      color: (d?.balance || 0) >= 0 ? 'default' : 'danger',
    },
    {
      label: 'Vencidas',
      value: fmt(o?.payables.total || 0),
      icon: <AlertTriangle className="w-5 h-5" />,
      color: (o?.payables.count || 0) > 0 ? 'warning' : 'default',
    },
  ];
  const operationalItems: KpiItem[] = [
    {
      label: 'Saldo Real',
      value: fmt(data?.banking?.realBalance || 0),
      icon: <DollarSign className="w-5 h-5" />,
      color: (data?.banking?.realBalance || 0) >= 0 ? 'success' : 'danger',
    },
    {
      label: 'Saldo Previsto 30d',
      value: fmt(data?.banking?.forecastBalance30d || 0),
      icon: <LineChart className="w-5 h-5" />,
      color: (data?.banking?.forecastBalance30d || 0) >= 0 ? 'info' : 'warning',
    },
    {
      label: 'Notas Pendentes',
      value: String(data?.fiscal?.notesPending || 0),
      icon: <FileCheck className="w-5 h-5" />,
      color: (data?.fiscal?.notesPending || 0) > 0 ? 'warning' : 'success',
    },
    {
      label: 'Boletos Vencidos',
      value: fmt(data?.charges?.overdue.total || 0),
      icon: <AlertTriangle className="w-5 h-5" />,
      color: (data?.charges?.overdue.count || 0) > 0 ? 'danger' : 'default',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Empresarial"
        subtitle="Visão geral do mês atual"
        breadcrumbs={[{ label: 'Dashboard' }]}
      />

      <KpiStrip items={kpiItems} />
      <KpiStrip items={operationalItems} />

      {/* Investment & Reconciliation Row */}
      {(data?.investments?.count || 0) > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: 'Investimentos Ativos',
              value: fmt(data?.investments?.currentValue || 0),
              sub: `${data?.investments?.count || 0} investimento(s)`,
              icon: LineChart,
              color: 'text-purple-600 dark:text-purple-400',
              bg: 'bg-purple-50 dark:bg-purple-900/20',
              href: '/pj/investimentos',
            },
            {
              label: 'Rendimento',
              value: fmt((data?.investments?.currentValue || 0) - (data?.investments?.totalInvested || 0)),
              sub: `${data?.investments?.totalInvested ? (((data.investments.currentValue - data.investments.totalInvested) / data.investments.totalInvested) * 100).toFixed(2) : '0.00'}%`,
              icon: DollarSign,
              color: ((data?.investments?.currentValue || 0) - (data?.investments?.totalInvested || 0)) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
              bg: 'bg-emerald-50 dark:bg-emerald-900/20',
              href: '/pj/investimentos',
            },
            {
              label: 'Conciliação',
              value: '',
              icon: FileCheck,
              color: 'text-cyan-600 dark:text-cyan-400',
              bg: 'bg-cyan-50 dark:bg-cyan-900/20',
              href: '/pj/conciliacao',
              custom: true,
            },
          ].map(stat => (
            <Link key={stat.label} href={stat.href}>
              <div className="bg-card border border-border/60 rounded-xl p-4 hover:shadow-md transition-all group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                      <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                      {(stat as any).custom ? (
                        <div className="flex gap-2 mt-0.5">
                          <span className="text-xs"><span className="font-bold text-emerald-600">{data?.reconciliation?.RECONCILED || 0}</span> ok</span>
                          <span className="text-xs"><span className="font-bold text-amber-600">{data?.reconciliation?.PENDING || 0}</span> pend.</span>
                          <span className="text-xs"><span className="font-bold text-red-600">{data?.reconciliation?.DIVERGENT || 0}</span> div.</span>
                        </div>
                      ) : (
                        <>
                          <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                          {stat.sub && <p className="text-[11px] text-muted-foreground">{stat.sub}</p>}
                        </>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Category Breakdown */}
      {(data?.payablesByCategory?.length || 0) > 0 && (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40">
            <h3 className="text-sm font-semibold text-foreground">Despesas por Categoria (mês atual)</h3>
          </div>
          <div className="p-5 space-y-3">
            {data!.payablesByCategory!.sort((a, b) => b.total - a.total).slice(0, 8).map((cat, i) => {
              const maxVal = data!.payablesByCategory![0]?.total || 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm w-32 truncate text-foreground">{cat.category}</span>
                  <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                    <div className="bg-red-500/70 h-full rounded-full transition-all" style={{ width: `${(cat.total / maxVal) * 100}%` }} />
                  </div>
                  <span className="text-sm font-semibold w-28 text-right text-foreground">{fmt(cat.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-semibold text-foreground">Últimas Contas a Pagar</h3>
            </div>
            <Link href="/pj/contas-pagar" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Ver todas</Link>
          </div>
          {data?.recent.payables.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Nenhuma conta a pagar registrada.</div>
          ) : (
            <div className="divide-y divide-border/40">
              {data?.recent.payables.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.description}</p>
                    <p className="text-[11px] text-muted-foreground">{p.supplierName || 'Sem fornecedor'} • {new Date(p.dueDate).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">{fmt(Number(p.amount))}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      p.status === 'pago' ? 'status-success' : p.status === 'vencido' ? 'status-danger' : 'status-warning'
                    }`}>{p.status === 'pago' ? 'Pago' : p.status === 'vencido' ? 'Vencido' : 'Pendente'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-foreground">Últimas Contas a Receber</h3>
            </div>
            <Link href="/pj/contas-receber" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Ver todas</Link>
          </div>
          {data?.recent.receivables.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Nenhuma conta a receber registrada.</div>
          ) : (
            <div className="divide-y divide-border/40">
              {data?.recent.receivables.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.description}</p>
                    <p className="text-[11px] text-muted-foreground">{r.customerName || 'Sem cliente'} • {new Date(r.dueDate).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fmt(Number(r.amount))}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      r.status === 'recebido' ? 'status-success' : r.status === 'vencido' ? 'status-danger' : 'status-warning'
                    }`}>{r.status === 'recebido' ? 'Recebido' : r.status === 'vencido' ? 'Vencido' : 'Pendente'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
