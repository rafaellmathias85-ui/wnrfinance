'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Search, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface CategoryRow {
  categoryId: string | null;
  name: string;
  amountA: number;
  amountB: number;
}

interface PeriodSummary {
  from: string;
  to: string;
  totalReceitas: number;
  totalDespesas: number;
  resultado: number;
}

interface CompareResult {
  periodA: PeriodSummary;
  periodB: PeriodSummary;
  receitaComparison: CategoryRow[];
  despesaComparison: CategoryRow[];
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (a: number, b: number) => {
  if (b === 0) return a > 0 ? '+∞%' : '—';
  const pct = ((a - b) / b) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
};

function DeltaBadge({ a, b, invert = false }: { a: number; b: number; invert?: boolean }) {
  const diff = a - b;
  const isPositive = invert ? diff < 0 : diff > 0;
  const isNeutral = diff === 0;
  if (isNeutral) return <span className="text-slate-500 text-xs flex items-center gap-0.5"><Minus className="w-3 h-3" />0%</span>;
  return (
    <span className={`text-xs flex items-center gap-0.5 font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {fmtPct(a, b)}
    </span>
  );
}

export default function ComparativoPeriodosPage() {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const toDateStr = (d: Date) => d.toISOString().split('T')[0];
  const lastDay = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

  const [aFrom, setAFrom] = useState(toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [aTo, setATo] = useState(toDateStr(lastDay(now)));
  const [bFrom, setBFrom] = useState(toDateStr(prevMonth));
  const [bTo, setBTo] = useState(toDateStr(lastDay(prevMonth)));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);

  const handleCompare = async () => {
    if (!aFrom || !aTo || !bFrom || !bTo) { toast.error('Preencha todos os campos de data'); return; }
    setLoading(true);
    const p = new URLSearchParams({ aFrom, aTo, bFrom, bTo });
    const res = await apiFetch(`/api/pj/relatorios/comparativo?${p}`);
    if (res.ok) {
      setResult(await res.json());
    } else {
      const d = await res.json();
      toast.error(d.error || 'Erro ao gerar comparativo');
    }
    setLoading(false);
  };

  const labelA = `${aFrom} — ${aTo}`;
  const labelB = `${bFrom} — ${bTo}`;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Comparativo de Períodos</h1>
        <p className="text-slate-400 text-sm mt-0.5">Compare receitas e despesas entre dois períodos</p>
      </div>

      {/* Period selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800 border border-blue-500/40 rounded-xl p-4 space-y-3">
          <h3 className="text-blue-400 font-medium text-sm">Período A</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">De</label>
              <input type="date" value={aFrom} onChange={(e) => setAFrom(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Até</label>
              <input type="date" value={aTo} onChange={(e) => setATo(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-purple-500/40 rounded-xl p-4 space-y-3">
          <h3 className="text-purple-400 font-medium text-sm">Período B</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">De</label>
              <input type="date" value={bFrom} onChange={(e) => setBFrom(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Até</label>
              <input type="date" value={bTo} onChange={(e) => setBTo(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleCompare} disabled={loading}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60">
        <Search className="w-4 h-4" />
        {loading ? 'Comparando...' : 'Gerar Comparativo'}
      </button>

      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Receitas', a: result.periodA.totalReceitas, b: result.periodB.totalReceitas, invert: false },
              { label: 'Total Despesas', a: result.periodA.totalDespesas, b: result.periodB.totalDespesas, invert: true },
              { label: 'Resultado', a: result.periodA.resultado, b: result.periodB.resultado, invert: false },
            ].map(({ label, a, b, invert }) => (
              <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <p className="text-slate-400 text-xs mb-2">{label}</p>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                      <span className="text-white font-bold text-sm">{fmt(a)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
                      <span className="text-slate-300 text-sm">{fmt(b)}</span>
                    </div>
                  </div>
                  <DeltaBadge a={a} b={b} invert={invert} />
                </div>
              </div>
            ))}
          </div>

          {/* Receitas comparison */}
          <CompareTable
            title="Receitas por Categoria"
            rows={result.receitaComparison}
            labelA={labelA}
            labelB={labelB}
            color="blue"
          />

          {/* Despesas comparison */}
          <CompareTable
            title="Despesas por Categoria"
            rows={result.despesaComparison}
            labelA={labelA}
            labelB={labelB}
            color="purple"
            invertDelta
          />
        </>
      )}
    </div>
  );
}

function CompareTable({
  title, rows, labelA, labelB, color, invertDelta,
}: {
  title: string;
  rows: CategoryRow[];
  labelA: string;
  labelB: string;
  color: 'blue' | 'purple';
  invertDelta?: boolean;
}) {
  const colorA = color === 'blue' ? 'text-blue-400' : 'text-purple-400';
  const totalA = rows.reduce((s, r) => s + r.amountA, 0);
  const totalB = rows.reduce((s, r) => s + r.amountB, 0);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-white font-medium">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-900/40">
          <tr>
            <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Categoria</th>
            <th className={`text-right px-4 py-2.5 font-medium ${colorA}`}>Período A</th>
            <th className="text-right px-4 py-2.5 text-purple-400 font-medium">Período B</th>
            <th className="text-right px-4 py-2.5 text-slate-400 font-medium">Variação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-700/20">
              <td className="px-4 py-2.5 text-slate-300">{row.name}</td>
              <td className={`px-4 py-2.5 text-right ${colorA} font-medium`}>{fmt(row.amountA)}</td>
              <td className="px-4 py-2.5 text-right text-purple-300">{fmt(row.amountB)}</td>
              <td className="px-4 py-2.5 text-right">
                <DeltaBadge a={row.amountA} b={row.amountB} invert={invertDelta} />
              </td>
            </tr>
          ))}
          <tr className="bg-slate-900/30 font-bold">
            <td className="px-4 py-2.5 text-white">Total</td>
            <td className={`px-4 py-2.5 text-right ${colorA}`}>{fmt(totalA)}</td>
            <td className="px-4 py-2.5 text-right text-purple-300">{fmt(totalB)}</td>
            <td className="px-4 py-2.5 text-right">
              <DeltaBadge a={totalA} b={totalB} invert={invertDelta} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
