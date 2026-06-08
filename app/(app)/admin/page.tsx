'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, BarChart3, Crown, DollarSign, Loader2, Shield, ShieldCheck, Users } from 'lucide-react';
import { DataGrid, KpiStrip, PageHeader, type DataGridColumn, type KpiItem } from '@/components/enterprise';
import { Button } from '@/components/ui/button';
import { useFormatCurrency } from '@/hooks/use-format-currency';


export default function AdminPage() {
  const formatCurrency = useFormatCurrency();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin')
      .then(r => { if (!r.ok) throw new Error(r.status === 403 ? 'Acesso negado. Apenas administradores.' : 'Erro'); return r.json(); })
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="text-center py-20"><Shield className="w-16 h-16 text-red-300 mx-auto mb-4" /><p className="text-lg font-medium text-foreground">{error}</p></div>;

  const kpis: KpiItem[] = [
    { label: 'Usuários', value: data?.totalUsers || 0, icon: <Users className="w-5 h-5" />, color: 'default' },
    { label: 'Ativos 30d', value: data?.activeUsers30d || 0, icon: <Activity className="w-5 h-5" />, color: 'info' },
    { label: 'MRR', value: formatCurrency(data?.mrr), icon: <DollarSign className="w-5 h-5" />, color: 'success' },
    { label: 'Pagantes', value: data?.paidCount || 0, icon: <Crown className="w-5 h-5" />, color: 'warning' },
  ];

  const userColumns: DataGridColumn[] = [
    { key: 'name', header: 'Nome', render: (r: any) => <span className="font-medium text-foreground">{r.name || 'Sem nome'}</span> },
    { key: 'email', header: 'E-mail', render: (r: any) => <span className="text-muted-foreground">{r.email}</span> },
    { key: 'plan', header: 'Plano', render: (r: any) => (
      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
        r.subscription?.plan === 'premium' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' :
        r.subscription?.plan === 'pro' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
        'bg-muted text-muted-foreground'
      }`}>{r.subscription?.plan || 'free'}</span>
    )},
    { key: 'records', header: 'Registros', align: 'center', render: (r: any) => <span className="text-muted-foreground">{r._count.expenses + r._count.incomes}</span> },
    { key: 'banks', header: 'Bancos', align: 'center', render: (r: any) => <span className="text-muted-foreground">{r._count.bankConnections}</span> },
    { key: 'date', header: 'Cadastro', render: (r: any) => <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('pt-BR')}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel Administrativo"
        subtitle="Métricas SaaS do WNR Finance"
        breadcrumbs={[{ label: 'Admin' }]}
        badge={
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
            <Crown className="w-3 h-3" /> Owner
          </span>
        }
        actions={
          <Link href="/admin/permissoes">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Permissões
            </Button>
          </Link>
        }
      />

      <KpiStrip items={kpis} />

      {/* Visão Financeira + Uso */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold">Visão Financeira</h3>
          </div>
          <div className="p-4 space-y-2">
            {[
              { label: 'Total Receitas', value: formatCurrency(data?.totalIncomes), color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Total Despesas', value: formatCurrency(data?.totalExpenses), color: 'text-red-600 dark:text-red-400' },
              { label: 'Novos este mês', value: data?.newUsersThisMonth || 0, color: 'text-foreground' },
              { label: 'Novos mês anterior', value: data?.newUsersLastMonth || 0, color: 'text-foreground' },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center px-3 py-2.5 rounded-lg bg-muted/50">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className={`font-semibold text-sm ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold">Uso da Plataforma</h3>
          </div>
          <div className="p-4 space-y-2">
            {[
              { label: 'Transações importadas', value: data?.totalBankTx || 0 },
              { label: 'Conciliações realizadas', value: data?.totalReconciled || 0 },
              { label: 'Média lançamentos/usuário', value: data?.avgExpensesPerUser || 0 },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center px-3 py-2.5 rounded-lg bg-muted/50">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="font-semibold text-sm text-foreground">{item.value}</span>
              </div>
            ))}
            {data?.reconciliationStats?.length > 0 && (
              <div className="flex gap-2 flex-wrap px-3 pt-1">
                {data.reconciliationStats.map((s: any, i: number) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground">{s.status}: {s._count}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Growth Chart */}
      {data?.monthlyGrowth?.length > 0 && (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40">
            <h3 className="text-sm font-semibold">Crescimento Mensal de Usuários</h3>
          </div>
          <div className="p-5">
            <div className="flex items-end gap-3 h-32">
              {data.monthlyGrowth.map((m: any, i: number) => {
                const max = Math.max(...data.monthlyGrowth.map((g: any) => g.users), 1);
                const height = (m.users / max) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-foreground">{m.users}</span>
                    <div className="w-full bg-blue-500 rounded-t transition-all" style={{ height: `${Math.max(height, 4)}%` }} />
                    <span className="text-[10px] text-muted-foreground">{m.month}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Subscriptions */}
      {data?.subscriptions?.length > 0 && (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40">
            <h3 className="text-sm font-semibold">Assinaturas</h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.subscriptions.map((s: any, i: number) => (
                <div key={i} className="p-3 bg-muted/50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-foreground">{s._count}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{s.plan} • {s.status}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Users */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Usuários Recentes</h3>
        </div>
        <DataGrid
          columns={userColumns}
          data={data?.recentUsers || []}
          emptyMessage="Nenhum usuário encontrado"
        />
      </div>
    </div>
  );
}
