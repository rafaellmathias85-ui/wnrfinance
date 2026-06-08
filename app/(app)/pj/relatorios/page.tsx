'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, FileText, QrCode, AlertTriangle, Users, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePJ } from '@/lib/pj-context';
import { apiFetch } from '@/lib/fetch';
import { useFormatCurrency } from '@/hooks/use-format-currency';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316','#84cc16'];

function BarMini({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden w-full">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export default function PJRelatoriosPage() {
  const { activeCompanyId } = usePJ();
  const formatCurrency = useFormatCurrency();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/pj/relatorios?months=${months}`);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, [activeCompanyId, months]);

  useEffect(() => { load(); }, [load]);

  const maxBar = data?.monthlyEvolution ? Math.max(...data.monthlyEvolution.map((m: any) => Math.max(m.receitas, m.despesas, 0.01))) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" />Relatorios PJ</h1>
          <p className="text-muted-foreground mt-1">Visao consolidada do desempenho financeiro</p>
        </div>
        <select value={months} onChange={e => setMonths(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg text-sm bg-background">
          <option value="3">Ultimos 3 meses</option>
          <option value="6">Ultimos 6 meses</option>
          <option value="12">Ultimos 12 meses</option>
        </select>
      </div>

      {/* KPIs do mes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Receitas (Mes)', value: formatCurrency(data?.currentMonth?.receitas ?? 0), icon: TrendingUp, color: 'text-green-600' },
          { label: 'Despesas (Mes)', value: formatCurrency(data?.currentMonth?.despesas ?? 0), icon: TrendingDown, color: 'text-red-600' },
          { label: 'Lucro (Mes)', value: formatCurrency(data?.currentMonth?.lucro ?? 0), icon: DollarSign, color: (data?.currentMonth?.lucro ?? 0) >= 0 ? 'text-green-600' : 'text-red-600' },
          { label: 'NF-e Emitidas', value: String(data?.currentMonth?.nfes ?? 0), icon: FileText, color: 'text-blue-600' },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <k.icon className={`w-4 h-4 ${k.color}`} />
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <p className={`text-xl font-bold ${k.color}`}>{loading ? '—' : k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alertas */}
      {!loading && ((data?.overduePayables?.count ?? 0) > 0 || (data?.pendingReceivables?.count ?? 0) > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(data?.overduePayables?.count ?? 0) > 0 && (
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="text-red-700 dark:text-red-400 text-sm font-medium">Contas a Pagar Vencidas</p>
                <p className="text-red-600 dark:text-red-500 text-xs">{data.overduePayables.count} conta{data.overduePayables.count > 1 ? 's' : ''} — {formatCurrency(data.overduePayables.total)}</p>
              </div>
            </div>
          )}
          {(data?.pendingReceivables?.count ?? 0) > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
              <DollarSign className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-amber-700 dark:text-amber-400 text-sm font-medium">A Receber Pendente</p>
                <p className="text-amber-600 dark:text-amber-500 text-xs">{data.pendingReceivables.count} conta{data.pendingReceivables.count > 1 ? 's' : ''} — {formatCurrency(data.pendingReceivables.total)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evolucao mensal */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4">Evolucao Mensal</h3>
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}</div>
          ) : !data?.monthlyEvolution?.length ? (
            <p className="text-muted-foreground text-sm">Sem dados para o periodo selecionado.</p>
          ) : (
            <div className="space-y-4">
              {data.monthlyEvolution.map((m: any, i: number) => (
                <div key={i}>
                  <div className="flex justify-between text-xs text-muted-foreground mb-2">
                    <span className="font-medium text-foreground">{m.label}</span>
                    <span className={m.lucro >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {m.lucro >= 0 ? '+' : ''}{formatCurrency(m.lucro)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-green-600">Receitas</span>
                      <div className="flex-1"><BarMini value={m.receitas} max={maxBar} color="#10b981" /></div>
                      <span className="w-20 text-right font-medium">{formatCurrency(m.receitas)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-red-600">Despesas</span>
                      <div className="flex-1"><BarMini value={m.despesas} max={maxBar} color="#ef4444" /></div>
                      <span className="w-20 text-right font-medium">{formatCurrency(m.despesas)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Receitas por categoria */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-600" />Receitas por Categoria</h3>
            {loading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div>
            : !data?.receitasByCategory?.length ? <p className="text-muted-foreground text-sm">Sem dados.</p>
            : (() => {
              const maxR = Math.max(...data.receitasByCategory.map((r: any) => r.total), 0.01);
              return (
                <div className="space-y-3">
                  {data.receitasByCategory.map((r: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="truncate">{r.category}</span>
                        <span className="font-medium ml-4 flex-shrink-0">{formatCurrency(r.total)}</span>
                      </div>
                      <BarMini value={r.total} max={maxR} color={COLORS[i % COLORS.length]} />
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Despesas por categoria */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><TrendingDown className="w-5 h-5 text-red-600" />Despesas por Categoria</h3>
            {loading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div>
            : !data?.despesasByCategory?.length ? <p className="text-muted-foreground text-sm">Sem dados.</p>
            : (() => {
              const maxD = Math.max(...data.despesasByCategory.map((d: any) => d.total), 0.01);
              return (
                <div className="space-y-3">
                  {data.despesasByCategory.map((d: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="truncate">{d.category}</span>
                        <span className="font-medium ml-4 flex-shrink-0">{formatCurrency(d.total)}</span>
                      </div>
                      <BarMini value={d.total} max={maxD} color={COLORS[i % COLORS.length]} />
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Top clientes */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" />Top Clientes (12 meses)</h3>
            {loading ? <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            : !data?.topClients?.length ? <p className="text-muted-foreground text-sm">Sem dados de clientes.</p>
            : (
              <div className="space-y-3">
                {data.topClients.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="text-sm font-medium truncate">{c.name || '—'}</span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-sm font-semibold">{formatCurrency(c.total)}</p>
                      <p className="text-xs text-muted-foreground">{c.count} fatura{c.count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top fornecedores */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Building2 className="w-5 h-5 text-purple-600" />Top Fornecedores (12 meses)</h3>
            {loading ? <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            : !data?.topSuppliers?.length ? <p className="text-muted-foreground text-sm">Sem dados de fornecedores.</p>
            : (
              <div className="space-y-3">
                {data.topSuppliers.map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="text-sm font-medium truncate">{s.name || '—'}</span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-sm font-semibold">{formatCurrency(s.total)}</p>
                      <p className="text-xs text-muted-foreground">{s.count} lanc.</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
