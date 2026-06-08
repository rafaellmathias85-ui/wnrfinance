'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/fetch';

import { useFormatCurrency } from '@/hooks/use-format-currency';
import { BarChart3, TrendingUp, PiggyBank, Wallet, Building2 } from 'lucide-react';
import ReportsBarChart from '@/components/reports-bar-chart';
import CategoryPieChart from '@/components/category-pie-chart';
import BankFilter from '@/components/bank-filter';

export default function RelatoriosPage() {
  const formatCurrency = useFormatCurrency();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterBank, setFilterBank] = useState('todos');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ months: '6' });
    if (filterBank !== 'todos') params.set('bankId', filterBank);
    apiFetch(`/api/reports?${params.toString()}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterBank]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" /></div>;
  if (!data) return <div className="text-center py-20 text-muted-foreground">Erro ao carregar relatórios</div>;

  const evolution = data.monthlyEvolution || [];
  const categories = data.spendingByCategory || [];
  const patrimony = data.patrimony || {};
  const bankBreakdown = data.spendingByBank || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground mt-1">Análise completa das suas finanças</p>
        </div>
        <BankFilter value={filterBank} onChange={setFilterBank} />
      </div>

      {/* Patrimony */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-blue-100"><Wallet className="w-5 h-5 text-blue-600" /></div>
          <div><p className="text-sm text-gray-500">Patrimônio Total</p><p className="text-xl font-bold text-blue-600">{formatCurrency(patrimony.total)}</p></div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-blue-100"><TrendingUp className="w-5 h-5 text-blue-600" /></div>
          <div><p className="text-sm text-gray-500">Investimentos</p><p className="text-xl font-bold text-blue-600">{formatCurrency(patrimony.investments)}</p></div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-amber-100"><PiggyBank className="w-5 h-5 text-amber-600" /></div>
          <div><p className="text-sm text-gray-500">Caixinhas</p><p className="text-xl font-bold text-amber-600">{formatCurrency(patrimony.savings)}</p></div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-green-100"><BarChart3 className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-sm text-gray-500">Retorno Investimentos</p><p className={`text-xl font-bold ${(patrimony.investmentReturn || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(patrimony.investmentReturn)}</p></div>
        </CardContent></Card>
      </div>

      {/* Monthly evolution chart */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg">Evolução Mensal (Receitas vs Despesas)</CardTitle></CardHeader>
        <CardContent>
          <ReportsBarChart data={evolution} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending by category */}
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-lg">Gastos por Categoria (Mês Atual)</CardTitle></CardHeader>
          <CardContent>
            <CategoryPieChart data={categories} />
            {categories.length > 0 && (
              <div className="mt-4 space-y-2">
                {categories.map((cat: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{cat.category}</span>
                    <span className="font-medium text-foreground">{formatCurrency(cat.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly data table */}
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-lg">Fluxo de Caixa Mensal</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-2 text-gray-500">Mês</th><th className="text-right py-2 text-gray-500">Receitas</th><th className="text-right py-2 text-gray-500">Despesas</th><th className="text-right py-2 text-gray-500">Saldo</th></tr></thead>
                <tbody>
                  {evolution.map((m: any, i: number) => (
                    <tr key={i} className={`border-b ${m.isProjection ? 'opacity-60' : ''}`}>
                      <td className="py-2 text-gray-700">{m.label}{m.isProjection ? ' *' : ''}</td>
                      <td className="text-right text-blue-600 font-medium">{formatCurrency(m.receitas)}</td>
                      <td className="text-right text-red-600 font-medium">{formatCurrency(m.despesas)}</td>
                      <td className={`text-right font-bold ${m.saldo >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(m.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {evolution.some((m: any) => m.isProjection) && (
                <p className="text-xs text-gray-400 mt-2">* Meses futuros são projeções baseadas em receitas/despesas recorrentes</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Spending by bank */}
      {bankBreakdown.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Movimentação por Banco (Mês Atual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-gray-500">Banco</th>
                    <th className="text-right py-2 text-gray-500">Receitas</th>
                    <th className="text-right py-2 text-gray-500">Despesas</th>
                    <th className="text-right py-2 text-gray-500">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {bankBreakdown.map((b: any) => (
                    <tr key={b.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 text-gray-700 font-medium flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        {b.bankName}
                      </td>
                      <td className="text-right text-blue-600 font-medium">{formatCurrency(b.incomes)}</td>
                      <td className="text-right text-red-600 font-medium">{formatCurrency(b.expenses)}</td>
                      <td className={`text-right font-bold ${b.saldo >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(b.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
