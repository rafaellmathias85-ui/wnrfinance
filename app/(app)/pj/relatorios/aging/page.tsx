'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';

interface AgingItem {
  id: string;
  description: string;
  customerName?: string;
  supplierName?: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  category: { name: string } | null;
}

interface Bucket {
  label: string;
  count: number;
  total: number;
  items: AgingItem[];
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const BUCKET_COLORS = [
  'bg-blue-500/20 text-blue-400 border-blue-700',
  'bg-yellow-500/20 text-yellow-400 border-yellow-700',
  'bg-orange-500/20 text-orange-400 border-orange-700',
  'bg-red-500/20 text-red-400 border-red-700',
  'bg-red-600/30 text-red-300 border-red-800',
  'bg-red-700/30 text-red-200 border-red-900',
  'bg-purple-600/30 text-purple-300 border-purple-800',
];

export default function AgingPage() {
  const [type, setType] = useState<'receivable' | 'payable'>('receivable');
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(`/api/pj/relatorios/aging?type=${type}`);
    const data = await r.json();
    setBuckets(data.buckets ?? []);
    setLoading(false);
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const grand = buckets.reduce((s, b) => s + b.total, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Aging — Análise de Vencimentos</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Distribuição de títulos em aberto por faixa de atraso</p>
          </div>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-border">
          {(['receivable', 'payable'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setType(t); setExpanded(null); }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                type === t ? 'bg-blue-600 text-white' : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'receivable' ? 'Contas a Receber' : 'Contas a Pagar'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      {!loading && buckets.length > 0 && grand > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex h-8 rounded-lg overflow-hidden gap-0.5">
            {buckets.filter(b => b.total > 0).map((b, i) => (
              <div
                key={b.label}
                title={`${b.label}: ${fmt(b.total)}`}
                className={`transition-all ${BUCKET_COLORS[i]?.split(' ')[0] ?? 'bg-slate-600'}`}
                style={{ width: `${(b.total / grand) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {buckets.filter(b => b.total > 0).map((b, i) => (
              <div key={b.label} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${BUCKET_COLORS[i]?.split(' ')[0] ?? 'bg-slate-600'}`} />
                <span className="text-muted-foreground text-xs">{b.label}: <strong className="text-foreground">{fmt(b.total)}</strong></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm">Carregando...</div>
      ) : (
        <div className="space-y-3">
          {buckets.map((bucket, i) => (
            <div key={bucket.label} className={`border rounded-xl overflow-hidden ${BUCKET_COLORS[i]?.split(' ').slice(2).join(' ') ?? 'border-border'}`}>
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/20"
                onClick={() => setExpanded(expanded === bucket.label ? null : bucket.label)}
              >
                <div className="flex items-center gap-3">
                  {expanded === bucket.label
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  }
                  <span className={`text-sm font-medium px-2 py-0.5 rounded-full border ${BUCKET_COLORS[i] ?? ''}`}>
                    {bucket.label}
                  </span>
                  <span className="text-muted-foreground text-sm">{bucket.count} título{bucket.count !== 1 ? 's' : ''}</span>
                </div>
                <span className="text-white font-bold">{fmt(bucket.total)}</span>
              </div>

              {expanded === bucket.label && bucket.items.length > 0 && (
                <div className="border-t border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2 text-left text-muted-foreground font-medium text-xs">Descrição</th>
                        <th className="px-4 py-2 text-left text-muted-foreground font-medium text-xs hidden md:table-cell">
                          {type === 'receivable' ? 'Cliente' : 'Fornecedor'}
                        </th>
                        <th className="px-4 py-2 text-left text-muted-foreground font-medium text-xs hidden lg:table-cell">Categoria</th>
                        <th className="px-4 py-2 text-right text-muted-foreground font-medium text-xs">Vencimento</th>
                        <th className="px-4 py-2 text-right text-muted-foreground font-medium text-xs">Dias</th>
                        <th className="px-4 py-2 text-right text-muted-foreground font-medium text-xs">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {bucket.items.map(item => (
                        <tr key={item.id} className="hover:bg-muted/20">
                          <td className="px-4 py-2 text-foreground">{item.description}</td>
                          <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">
                            {type === 'receivable' ? (item.customerName ?? '—') : (item.supplierName ?? '—')}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground hidden lg:table-cell text-xs">{item.category?.name ?? '—'}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground text-xs">
                            {new Date(item.dueDate).toLocaleDateString('pt-BR')}
                          </td>
                          <td className={`px-4 py-2 text-right text-xs font-medium ${item.daysOverdue > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                            {item.daysOverdue > 0 ? `+${item.daysOverdue}` : item.daysOverdue === 0 ? 'Hoje' : `${Math.abs(item.daysOverdue)}d`}
                          </td>
                          <td className="px-4 py-2 text-right text-foreground font-medium">{fmt(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
