'use client';

import { useState, useEffect } from 'react';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePJ } from '@/lib/pj-context';
import { apiFetch } from '@/lib/fetch';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Legend } from 'recharts';


export default function FluxoCaixa() {
  const fmt = useFormatCurrency();
  const { activeCompanyId } = usePJ();
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompanyId) { setLoading(false); return; }
    setLoading(true);
    apiFetch(`/api/pj/cashflow?days=${days}`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [activeCompanyId, days]);

  if (!activeCompanyId) return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fluxo de Caixa</h1>
          <p className="text-muted-foreground">Projeção de entradas e saídas</p>
        </div>
        <div className="flex gap-2">
          {[30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                days === d ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
              }`}>
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : !data ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Sem dados disponíveis.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total a Receber</p>
                  <p className="text-xl font-bold text-green-600">{fmt(data.summary.totalReceivables)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total a Pagar</p>
                  <p className="text-xl font-bold text-red-600">{fmt(data.summary.totalPayables)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Projeção Líquida</p>
                  <p className={`text-xl font-bold ${data.summary.netProjection >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(data.summary.netProjection)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Fluxo Semanal</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.weeks}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="start" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => fmt(value)} labelFormatter={(l: string) => `Semana de ${l}`} />
                    <Legend />
                    <Bar dataKey="receivables" name="A Receber" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="payables" name="A Pagar" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Line dataKey="cumulative" name="Saldo Acumulado" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
