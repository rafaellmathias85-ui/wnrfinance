'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { usePJ } from '@/lib/pj-context';
import { apiFetch } from '@/lib/fetch';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import { Building2, Loader2, TrendingUp, TrendingDown, FileSpreadsheet, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from 'recharts';

const pct = (v: number, total: number) => total === 0 ? '0%' : `${((v / total) * 100).toFixed(1)}%`;

export default function DREPage() {
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

  useEffect(() => {
    if (!activeCompanyId) return;
    setLoading(true);
    apiFetch(`/api/pj/dre?year=${year}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeCompanyId, year]);

  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => cur - i);
  }, []);

  if (!activeCompanyId) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Card className="p-8 text-center"><CardContent><Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" /><p className="text-lg font-medium">Selecione uma empresa</p></CardContent></Card>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const months = data?.months || [];
  const revenueCategories = data?.revenueCategories || [];
  const expenseCategories = data?.expenseCategories || [];
  const totalRevenue = data?.totalRevenue || 0;
  const totalExpense = data?.totalExpenses || 0;
  const netResult = data?.netResult || 0;
  const isProfit = netResult >= 0;

  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const chartData = months.map((m: any) => ({ month: monthNames[m.month - 1] || m.month, receita: m.revenue, despesa: m.expense, resultado: m.net }));

  const handleExportCSV = () => {
    let csv = 'Conta;' + months.map((m: any) => monthNames[m.month - 1]).join(';') + ';Total\n';
    csv += '(+) RECEITAS;;;;\n';
    revenueCategories.forEach((cat: any) => {
      csv += `  ${cat.name};`;
      months.forEach((m: any) => {
        const val = cat.months?.[m.month] || 0;
        csv += `${val.toFixed(2)};`;
      });
      csv += `${cat.total.toFixed(2)}\n`;
    });
    csv += `TOTAL RECEITAS;${months.map((m: any) => m.revenue.toFixed(2)).join(';')};${totalRevenue.toFixed(2)}\n`;
    csv += '(-) DESPESAS;;;;\n';
    expenseCategories.forEach((cat: any) => {
      csv += `  ${cat.name};`;
      months.forEach((m: any) => {
        const val = cat.months?.[m.month] || 0;
        csv += `${val.toFixed(2)};`;
      });
      csv += `${cat.total.toFixed(2)}\n`;
    });
    csv += `TOTAL DESPESAS;${months.map((m: any) => m.expense.toFixed(2)).join(';')};${totalExpense.toFixed(2)}\n`;
    csv += `RESULTADO LÍQUIDO;${months.map((m: any) => m.net.toFixed(2)).join(';')};${netResult.toFixed(2)}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `DRE_${year}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="h-7 w-7 text-primary" />
            DRE — Demonstração do Resultado
          </h1>
          <p className="text-muted-foreground">Análise detalhada de receitas e despesas por período</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />Exportar CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div><p className="text-sm opacity-90">Receita Bruta</p><p className="text-2xl font-bold mt-1">{fmt(totalRevenue)}</p></div>
              <TrendingUp className="h-10 w-10 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg bg-gradient-to-br from-red-500 to-red-600 text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div><p className="text-sm opacity-90">Despesas Totais</p><p className="text-2xl font-bold mt-1">{fmt(totalExpense)}</p></div>
              <TrendingDown className="h-10 w-10 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-lg text-white ${isProfit ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-gradient-to-br from-orange-500 to-orange-600'}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div><p className="text-sm opacity-90">Resultado Líquido</p><p className="text-2xl font-bold mt-1">{fmt(netResult)}</p><p className="text-xs opacity-75 mt-1">Margem: {pct(netResult, totalRevenue)}</p></div>
              {isProfit ? <TrendingUp className="h-10 w-10 opacity-80" /> : <TrendingDown className="h-10 w-10 opacity-80" />}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md">
        <CardHeader><CardTitle className="text-lg">Evolução Mensal — {year}</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="receita" name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesa" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Line dataKey="resultado" name="Resultado" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader><CardTitle className="text-lg">Demonstrativo Detalhado</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-primary/20">
                <th className="text-left py-3 px-2 font-semibold min-w-[200px]">Conta</th>
                {months.map((m: any) => <th key={m.month} className="text-right py-3 px-2 font-semibold min-w-[90px]">{monthNames[m.month - 1]}</th>)}
                <th className="text-right py-3 px-2 font-bold min-w-[110px] bg-muted/30">Total</th>
                <th className="text-right py-3 px-2 font-bold min-w-[70px] bg-muted/30">%</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-emerald-50 dark:bg-emerald-950/20 font-semibold">
                <td className="py-2 px-2 text-emerald-700 dark:text-emerald-400">(+) RECEITAS</td>
                {months.map((m: any) => <td key={m.month} className="text-right py-2 px-2 text-emerald-700 dark:text-emerald-400">{fmt(m.revenue)}</td>)}
                <td className="text-right py-2 px-2 bg-emerald-100/50 dark:bg-emerald-900/30 font-bold text-emerald-700 dark:text-emerald-400">{fmt(totalRevenue)}</td>
                <td className="text-right py-2 px-2 bg-emerald-100/50 dark:bg-emerald-900/30 font-bold text-emerald-700 dark:text-emerald-400">100%</td>
              </tr>
              {revenueCategories.map((cat: any, i: number) => (
                <tr key={`r-${i}`} className="hover:bg-muted/30 transition">
                  <td className="py-2 px-2 pl-6 text-muted-foreground">{cat.name}</td>
                  {months.map((m: any) => <td key={m.month} className="text-right py-2 px-2">{fmt(cat.months?.[m.month] || 0)}</td>)}
                  <td className="text-right py-2 px-2 bg-muted/20 font-medium">{fmt(cat.total)}</td>
                  <td className="text-right py-2 px-2 bg-muted/20 text-muted-foreground">{pct(cat.total, totalRevenue)}</td>
                </tr>
              ))}
              <tr className="bg-red-50 dark:bg-red-950/20 font-semibold border-t-2 border-muted">
                <td className="py-2 px-2 text-red-700 dark:text-red-400">(-) DESPESAS</td>
                {months.map((m: any) => <td key={m.month} className="text-right py-2 px-2 text-red-700 dark:text-red-400">{fmt(m.expense)}</td>)}
                <td className="text-right py-2 px-2 bg-red-100/50 dark:bg-red-900/30 font-bold text-red-700 dark:text-red-400">{fmt(totalExpense)}</td>
                <td className="text-right py-2 px-2 bg-red-100/50 dark:bg-red-900/30 font-bold text-red-700 dark:text-red-400">{pct(totalExpense, totalRevenue)}</td>
              </tr>
              {expenseCategories.map((cat: any, i: number) => (
                <tr key={`e-${i}`} className="hover:bg-muted/30 transition">
                  <td className="py-2 px-2 pl-6 text-muted-foreground">{cat.name}</td>
                  {months.map((m: any) => <td key={m.month} className="text-right py-2 px-2">{fmt(cat.months?.[m.month] || 0)}</td>)}
                  <td className="text-right py-2 px-2 bg-muted/20 font-medium">{fmt(cat.total)}</td>
                  <td className="text-right py-2 px-2 bg-muted/20 text-muted-foreground">{pct(cat.total, totalRevenue)}</td>
                </tr>
              ))}
              <tr className={`font-bold text-base border-t-2 ${isProfit ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/20' : 'border-orange-300 bg-orange-50 dark:bg-orange-950/20'}`}>
                <td className="py-3 px-2">(=) RESULTADO LÍQUIDO</td>
                {months.map((m: any) => <td key={m.month} className={`text-right py-3 px-2 ${m.net >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(m.net)}</td>)}
                <td className={`text-right py-3 px-2 ${isProfit ? 'text-blue-700 bg-blue-100/50 dark:bg-blue-900/30' : 'text-orange-700 bg-orange-100/50 dark:bg-orange-900/30'}`}>{fmt(netResult)}</td>
                <td className={`text-right py-3 px-2 ${isProfit ? 'text-blue-700 bg-blue-100/50 dark:bg-blue-900/30' : 'text-orange-700 bg-orange-100/50 dark:bg-orange-900/30'}`}>{pct(netResult, totalRevenue)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
