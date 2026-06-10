'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import {
  TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle,
  ReceiptText, Target, RefreshCw, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface DashData {
  revenue: { current: number; previous: number; change: number | null };
  expenses: { current: number; previous: number; change: number | null };
  profit: { current: number; previous: number };
  receivables: { pending: number; pendingCount: number; overdue: number; overdueCount: number };
  payables: { pending: number; pendingCount: number; overdue: number; overdueCount: number };
  clients: { total: number; newThisMonth: number };
  nfe: { thisMonth: number; prevMonth: number; change: number | null };
  goals: { total: number; achieved: number; rate: number };
  charts: {
    receivedByMonth: { month: string; total: number }[];
    paidByMonth: { month: string; total: number }[];
  };
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtK = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : fmt(v);

const MONTH_LABELS: Record<string, string> = {
  '01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun',
  '07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez',
};

function shortMonth(m: string) { return MONTH_LABELS[m.slice(5)] ?? m; }

function ChangeBadge({ change, invert = false }: { change: number | null; invert?: boolean }) {
  if (change == null) return null;
  const positive = invert ? change < 0 : change > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-green-400' : change === 0 ? 'text-slate-400' : 'text-red-400'}`}>
      {change > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(change)}% vs mês ant.
    </span>
  );
}

function KpiCard({ title, value, sub, icon: Icon, color, change, invert }: {
  title: string; value: string; sub?: string; icon: any; color: string; change?: number | null; invert?: boolean;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <p className="text-slate-400 text-sm">{title}</p>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white mt-2">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
      {change !== undefined && <div className="mt-1"><ChangeBadge change={change ?? null} invert={invert} /></div>}
    </div>
  );
}

export default function DashboardExecutivoPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await apiFetch('/api/pj/dashboard-executivo');
    if (r.ok) setData(await r.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Build chart data merging receivedByMonth + paidByMonth
  const chartData = (() => {
    if (!data) return [];
    const months = new Set([
      ...data.charts.receivedByMonth.map(r => r.month),
      ...data.charts.paidByMonth.map(p => p.month),
    ]);
    return Array.from(months).sort().map(m => ({
      month: shortMonth(m),
      receita: Number(data.charts.receivedByMonth.find(r => r.month === m)?.total ?? 0),
      despesa: Number(data.charts.paidByMonth.find(p => p.month === m)?.total ?? 0),
    }));
  })();

  const nowLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard Executivo</h1>
          <p className="text-slate-400 text-sm mt-0.5 capitalize">{nowLabel}</p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading || !data ? (
        <div className="text-slate-500 text-sm">Carregando...</div>
      ) : (
        <>
          {/* KPI row 1 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Receita do Mês"
              value={fmt(data.revenue.current)}
              sub={`Mês ant: ${fmt(data.revenue.previous)}`}
              icon={TrendingUp}
              color="bg-green-500/20 text-green-400"
              change={data.revenue.change}
            />
            <KpiCard
              title="Despesas do Mês"
              value={fmt(data.expenses.current)}
              sub={`Mês ant: ${fmt(data.expenses.previous)}`}
              icon={TrendingDown}
              color="bg-red-500/20 text-red-400"
              change={data.expenses.change}
              invert
            />
            <KpiCard
              title="Lucro Líquido"
              value={fmt(data.profit.current)}
              sub={`Mês ant: ${fmt(data.profit.previous)}`}
              icon={DollarSign}
              color={data.profit.current >= 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}
            />
            <KpiCard
              title="Clientes Ativos"
              value={String(data.clients.total)}
              sub={`+${data.clients.newThisMonth} novos este mês`}
              icon={Users}
              color="bg-purple-500/20 text-purple-400"
            />
          </div>

          {/* KPI row 2 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="A Receber"
              value={fmt(data.receivables.pending)}
              sub={`${data.receivables.pendingCount} título(s)`}
              icon={TrendingUp}
              color="bg-green-500/20 text-green-400"
            />
            <KpiCard
              title="Vencidos (Receber)"
              value={fmt(data.receivables.overdue)}
              sub={`${data.receivables.overdueCount} título(s) em atraso`}
              icon={AlertTriangle}
              color="bg-red-500/20 text-red-400"
            />
            <KpiCard
              title="A Pagar"
              value={fmt(data.payables.pending)}
              sub={`${data.payables.pendingCount} título(s)`}
              icon={TrendingDown}
              color="bg-orange-500/20 text-orange-400"
            />
            <KpiCard
              title="NF-e Emitidas"
              value={String(data.nfe.thisMonth)}
              sub={`Mês ant: ${data.nfe.prevMonth}`}
              icon={ReceiptText}
              color="bg-slate-600 text-slate-300"
              change={data.nfe.change}
            />
          </div>

          {/* Goals */}
          {data.goals.total > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-400 text-sm font-medium">Metas do Mês</span>
                </div>
                <span className={`text-sm font-bold ${data.goals.rate >= 80 ? 'text-green-400' : data.goals.rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {data.goals.achieved}/{data.goals.total} atingidas ({data.goals.rate}%)
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${data.goals.rate >= 80 ? 'bg-green-500' : data.goals.rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${data.goals.rate}%` }}
                />
              </div>
            </div>
          )}

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <p className="text-white font-medium mb-4">Receita vs Despesa — Últimos 6 meses</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtK} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                      labelStyle={{ color: '#94a3b8' }}
                      formatter={(v: number) => fmt(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                    <Bar dataKey="receita" name="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
