'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Bell, CreditCard, LineChart, PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { KpiStrip, PageHeader, type KpiItem } from '@/components/enterprise';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import BankFilter from '@/components/bank-filter';
import BalanceOverview from '@/components/balance-overview';
import DashboardChart from '@/components/dashboard-chart';
import CategoryPieChart from '@/components/category-pie-chart';


interface DashboardData {
  balance: number;
  totalIncomes: number;
  totalExpenses: number;
  savings: number;
  investments: number;
  creditCardTotal: number;
  chartData: { name: string; receitas: number; despesas: number }[];
  alerts: { id: string; title: string; message: string; severity: string; type: string }[];
  categoryData: { category: string; amount: number }[];
  recentExpenses: { id: string; description: string; amount: number; category: string; date: string }[];
}

export default function DashboardPage() {
  const formatCurrency = useFormatCurrency();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterBank, setFilterBank] = useState('todos');

  useEffect(() => {
    async function load() {
      try {
        const bankParam = filterBank !== 'todos' ? `&bankId=${filterBank}` : '';
        const [dashRes, reportsRes, cardsRes, investRes, balanceRes] = await Promise.all([
          apiFetch(`/api/dashboard?bankId=${filterBank}`),
          apiFetch(`/api/reports?months=6${bankParam}`),
          apiFetch(`/api/cards?bankId=${filterBank}`),
          apiFetch(`/api/investments?bankId=${filterBank}`),
          apiFetch('/api/balance'),
        ]);
        const dash = await dashRes.json();
        const reports = await reportsRes.json();
        const cards = await cardsRes.json();
        const invest = await investRes.json();
        const balanceData = await balanceRes.json();

        const creditCardTotal = Array.isArray(cards)
          ? cards.reduce((s: number, c: any) => s + (c.currentInvoice || 0), 0)
          : 0;

        // Use real bank balance from /api/balance instead of receitas-despesas
        const realBalance = balanceData?.summary?.totalContaCorrente ?? dash.balance;

        setData({
          ...dash,
          balance: realBalance,
          investments: invest?.summary?.totalCurrent || 0,
          creditCardTotal,
          categoryData: reports?.spendingByCategory || [],
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    apiFetch('/api/alerts/generate', { method: 'POST' }).catch(() => {});
    load();
  }, [filterBank]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-20 text-muted-foreground">Erro ao carregar dashboard</div>;
  }

  const economy = data.totalIncomes - data.totalExpenses;

  const kpiItems: KpiItem[] = [
    {
      label: 'Saldo Atual',
      value: formatCurrency(data.balance),
      icon: <Wallet className="w-5 h-5" />,
      color: data.balance >= 0 ? 'default' : 'danger',
    },
    {
      label: 'Receitas do Mês',
      value: formatCurrency(data.totalIncomes),
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'success',
    },
    {
      label: 'Despesas do Mês',
      value: formatCurrency(data.totalExpenses),
      icon: <TrendingDown className="w-5 h-5" />,
      color: 'danger',
    },
    {
      label: 'Economia do Mês',
      value: formatCurrency(economy),
      icon: <PiggyBank className="w-5 h-5" />,
      color: economy >= 0 ? 'warning' : 'danger',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral das suas finanças pessoais"
        breadcrumbs={[{ label: 'Dashboard' }]}
        actions={
          <BankFilter value={filterBank} onChange={(v) => { setFilterBank(v); setLoading(true); }} />
        }
      />

      {/* KPI Strip */}
      <KpiStrip items={kpiItems} />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Investimentos', value: data.investments, icon: LineChart, href: '/investimentos', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Fatura Cartões', value: data.creditCardTotal, icon: CreditCard, href: '/cartoes', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
          { label: 'Caixinhas', value: data.savings, icon: PiggyBank, href: '/caixinhas', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
        ].map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <div className="bg-card border border-border/60 rounded-xl p-4 hover:shadow-md transition-all group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                    <p className={`text-lg font-bold ${stat.color}`}>{formatCurrency(stat.value)}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40">
            <h3 className="text-sm font-semibold text-foreground">Evolução Financeira</h3>
          </div>
          <div className="p-5">
            <DashboardChart data={data.chartData || []} />
          </div>
        </div>
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40">
            <h3 className="text-sm font-semibold text-foreground">Gastos por Categoria</h3>
          </div>
          <div className="p-5">
            <CategoryPieChart data={data.categoryData || []} />
          </div>
        </div>
      </div>

      {/* Balance Overview */}
      <BalanceOverview />

      {/* Alerts */}
      {data.alerts && data.alerts.length > 0 && (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Alertas</h3>
            <span className="ml-auto text-xs text-muted-foreground">{data.alerts.length}</span>
          </div>
          <div className="p-4 space-y-2">
            {data.alerts.slice(0, 5).map((alert: any, i: number) => (
              <div key={alert.id || i} className={`flex items-start gap-3 p-3 rounded-lg ${
                alert.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/10' :
                alert.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-900/10' : 'bg-blue-50 dark:bg-blue-900/10'
              }`}>
                <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                  alert.severity === 'critical' ? 'text-red-500' :
                  alert.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'
                }`} />
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Expenses */}
      {data.recentExpenses && data.recentExpenses.length > 0 && (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Últimas Despesas</h3>
            <Link href="/despesas" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Ver todas</Link>
          </div>
          <div className="divide-y divide-border/40">
            {data.recentExpenses.slice(0, 5).map((exp: any) => (
              <div key={exp.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{exp.description}</p>
                  <p className="text-[11px] text-muted-foreground">{exp.category}</p>
                </div>
                <span className="text-sm font-semibold text-red-600 dark:text-red-400 flex-shrink-0 ml-3">-{formatCurrency(exp.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
