'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePJ } from '@/lib/pj-context';
import { apiFetch } from '@/lib/fetch';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import { DollarSign, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle, BarChart3, PieChart as PieIcon, Users, Building2, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, ComposedChart, Line } from 'recharts';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];
const STATUS_COLORS: Record<string, string> = {
  pago: 'bg-emerald-100 text-emerald-700',
  recebido: 'bg-emerald-100 text-emerald-700',
  pendente: 'bg-amber-100 text-amber-700',
  vencido: 'bg-red-100 text-red-700',
  cancelado: 'bg-gray-100 text-gray-500',
};
const STATUS_LABELS: Record<string, string> = {
  pago: 'Pago', recebido: 'Recebido', pendente: 'Pendente', vencido: 'Vencido', cancelado: 'Cancelado',
};

export default function FaturamentoPJPage() {
  const fmt = useFormatCurrency();
  const fmtShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
    return fmt(v);
  };
  const { activeCompanyId } = usePJ();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filterPeriod, setFilterPeriod] = useState<'year' | 'month' | 'week'>('year');
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [activeTab, setActiveTab] = useState('visao-geral');

  useEffect(() => {
    if (!activeCompanyId) return;
    setLoading(true);
    let url = `/api/pj/faturamento?year=${year}`;
    if (filterPeriod === 'month') url += `&month=${filterMonth}`;
    if (filterPeriod === 'week') url += `&week=true`;
    apiFetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeCompanyId, year, filterPeriod, filterMonth]);

  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => cur - i);
  }, []);

  if (!activeCompanyId) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Card className="p-8 text-center"><CardContent><Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" /><p className="text-lg font-medium">Selecione uma empresa</p><p className="text-sm text-muted-foreground">Escolha uma empresa no menu lateral para ver o faturamento.</p></CardContent></Card>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const kpis = data?.kpis;
  const monthly = data?.monthlyData || [];
  const categories = data?.categories || { payable: [], receivable: [] };
  const topCustomers = data?.topCustomers || [];
  const topSuppliers = data?.topSuppliers || [];
  const recent = data?.recentTransactions || { payables: [], receivables: [] };
  const balance = (kpis?.totalReceivable || 0) - (kpis?.totalPayable || 0);
  const balancePositive = balance >= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Faturamento</h1>
          <p className="text-muted-foreground">Visão completa de receitas e despesas da empresa</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {(['year', 'month', 'week'] as const).map(p => (
              <button key={p} onClick={() => setFilterPeriod(p)}
                className={`px-3 py-1.5 transition-colors ${filterPeriod === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                {p === 'year' ? 'Ano' : p === 'month' ? 'Mes' : 'Semana'}
              </button>
            ))}
          </div>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          {filterPeriod === 'month' && (
            <Select value={String(filterMonth)} onValueChange={v => setFilterMonth(Number(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{new Date(2000, i).toLocaleString('pt-BR', { month: 'long' })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Total Receitas</p>
                <p className="text-2xl font-bold mt-1">{fmt(kpis?.totalReceivable || 0)}</p>
                <p className="text-xs opacity-75 mt-1">Recebido: {fmt(kpis?.totalReceived || 0)}</p>
              </div>
              <ArrowUpCircle className="h-10 w-10 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg bg-gradient-to-br from-red-500 to-red-600 text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Total Despesas</p>
                <p className="text-2xl font-bold mt-1">{fmt(kpis?.totalPayable || 0)}</p>
                <p className="text-xs opacity-75 mt-1">Pago: {fmt(kpis?.totalPaid || 0)}</p>
              </div>
              <ArrowDownCircle className="h-10 w-10 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-lg text-white ${balancePositive ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-gradient-to-br from-orange-500 to-orange-600'}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Saldo</p>
                <p className="text-2xl font-bold mt-1">{fmt(balance)}</p>
                <p className="text-xs opacity-75 mt-1">{balancePositive ? 'Positivo' : 'Negativo'}</p>
              </div>
              {balancePositive ? <TrendingUp className="h-10 w-10 opacity-80" /> : <TrendingDown className="h-10 w-10 opacity-80" />}
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Pendente</p>
                <p className="text-2xl font-bold mt-1">{fmt((kpis?.pendingReceivable || 0) + (kpis?.pendingPayable || 0))}</p>
                <p className="text-xs opacity-75 mt-1">A receber: {fmt(kpis?.pendingReceivable || 0)}</p>
              </div>
              <DollarSign className="h-10 w-10 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="visao-geral"><BarChart3 className="h-4 w-4 mr-2" />Visão Geral</TabsTrigger>
          <TabsTrigger value="categorias"><PieIcon className="h-4 w-4 mr-2" />Categorias</TabsTrigger>
          <TabsTrigger value="clientes-fornecedores"><Users className="h-4 w-4 mr-2" />Clientes / Fornecedores</TabsTrigger>
          <TabsTrigger value="transacoes"><DollarSign className="h-4 w-4 mr-2" />Transações</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="space-y-6 mt-4">
          <Card className="shadow-md">
            <CardHeader><CardTitle className="text-lg">Receitas vs Despesas — {year}</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="receivable" name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="payable" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Line dataKey="balance" name="Saldo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categorias" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-md">
              <CardHeader><CardTitle className="text-lg text-emerald-600">Receitas por Categoria</CardTitle></CardHeader>
              <CardContent>
                {categories.receivable.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem dados</p> : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categories.receivable} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {categories.receivable.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardHeader><CardTitle className="text-lg text-red-600">Despesas por Categoria</CardTitle></CardHeader>
              <CardContent>
                {categories.payable.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem dados</p> : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categories.payable} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {categories.payable.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clientes-fornecedores" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-md">
              <CardHeader><CardTitle className="text-lg">Top Clientes</CardTitle></CardHeader>
              <CardContent>
                {topCustomers.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem dados</p> : (
                  <div className="space-y-3">
                    {topCustomers.slice(0, 10).map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">{i + 1}</span>
                          <span className="font-medium text-sm">{c.name || 'Sem nome'}</span>
                        </div>
                        <span className="font-semibold text-emerald-600">{fmt(c.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardHeader><CardTitle className="text-lg">Top Fornecedores</CardTitle></CardHeader>
              <CardContent>
                {topSuppliers.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem dados</p> : (
                  <div className="space-y-3">
                    {topSuppliers.slice(0, 10).map((s: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700 text-sm font-bold">{i + 1}</span>
                          <span className="font-medium text-sm">{s.name || 'Sem nome'}</span>
                        </div>
                        <span className="font-semibold text-red-600">{fmt(s.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transacoes" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-md">
              <CardHeader><CardTitle className="text-lg text-emerald-600">Últimas Receitas</CardTitle></CardHeader>
              <CardContent>
                {recent.receivables.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem receitas recentes</p> : (
                  <div className="space-y-2">
                    {recent.receivables.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{r.description}</p>
                          <p className="text-xs text-muted-foreground">{new Date(r.dueDate).toLocaleDateString('pt-BR')} · {r.category}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <Badge className={`${STATUS_COLORS[r.status] || 'bg-gray-100'} text-xs`}>{STATUS_LABELS[r.status] || r.status}</Badge>
                          <span className="font-semibold text-sm whitespace-nowrap">{fmt(r.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardHeader><CardTitle className="text-lg text-red-600">Últimas Despesas</CardTitle></CardHeader>
              <CardContent>
                {recent.payables.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem despesas recentes</p> : (
                  <div className="space-y-2">
                    {recent.payables.map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{p.description}</p>
                          <p className="text-xs text-muted-foreground">{new Date(p.dueDate).toLocaleDateString('pt-BR')} · {p.category}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <Badge className={`${STATUS_COLORS[p.status] || 'bg-gray-100'} text-xs`}>{STATUS_LABELS[p.status] || p.status}</Badge>
                          <span className="font-semibold text-sm whitespace-nowrap">{fmt(p.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
