'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { DollarSign, TrendingUp, Users, ChevronDown, ChevronRight } from 'lucide-react';

interface Commission {
  id: string;
  agentName: string;
  description: string | null;
  saleAmount: number;
  rate: number;
  amount: number;
  period: string;
  status: string;
}

interface AgentSummary {
  agentName: string;
  totalSale: number;
  totalCommission: number;
  pendente: number;
  aprovada: number;
  paga: number;
  count: number;
  commissions: Commission[];
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_BADGE: Record<string, string> = {
  pendente: 'bg-yellow-500/20 text-yellow-400',
  aprovada: 'bg-blue-500/20 text-blue-400',
  paga: 'bg-green-500/20 text-green-400',
  cancelada: 'bg-slate-700 text-slate-400',
};

function currentYear() { return new Date().getFullYear(); }

export default function RelatorioComissoesPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(currentYear());
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/api/pj/commissions?period=${year}`);
    const data = await res.json();
    setCommissions(data.commissions ?? []);
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  // Group by agent
  const agentMap: Record<string, AgentSummary> = {};
  commissions.forEach(c => {
    if (!agentMap[c.agentName]) {
      agentMap[c.agentName] = {
        agentName: c.agentName,
        totalSale: 0, totalCommission: 0,
        pendente: 0, aprovada: 0, paga: 0,
        count: 0, commissions: [],
      };
    }
    const a = agentMap[c.agentName];
    a.totalSale += c.saleAmount;
    a.totalCommission += c.amount;
    a.count += 1;
    a.commissions.push(c);
    if (c.status === 'pendente') a.pendente += c.amount;
    else if (c.status === 'aprovada') a.aprovada += c.amount;
    else if (c.status === 'paga') a.paga += c.amount;
  });

  const agents = Object.values(agentMap).sort((a, b) => b.totalCommission - a.totalCommission);
  const grandTotal = agents.reduce((s, a) => s + a.totalCommission, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-700 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-slate-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Relatório de Comissões</h1>
            <p className="text-slate-400 text-sm mt-0.5">Comissões agrupadas por vendedor</p>
          </div>
        </div>
        <select
          value={year}
          onChange={e => setYear(parseInt(e.target.value))}
          className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
        >
          {[currentYear(), currentYear() - 1, currentYear() - 2].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Summary */}
      {!loading && agents.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
            <Users className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-white font-bold text-lg">{agents.length}</p>
              <p className="text-slate-400 text-xs">Agentes ativos</p>
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-blue-400 font-bold text-lg">{fmt(grandTotal)}</p>
              <p className="text-slate-400 text-xs">Total de comissões</p>
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-green-400 font-bold text-lg">
                {fmt(agents.reduce((s, a) => s + a.paga, 0))}
              </p>
              <p className="text-slate-400 text-xs">Total pago</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-sm">Carregando...</div>
      ) : agents.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center">
          <DollarSign className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400">Nenhuma comissão registrada em {year}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent, idx) => {
            const pct = grandTotal > 0 ? (agent.totalCommission / grandTotal) * 100 : 0;
            const isExpanded = expanded === agent.agentName;

            return (
              <div key={agent.agentName} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : agent.agentName)}
                >
                  <div className="w-8 h-8 bg-blue-600/20 rounded-full flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-white font-medium">{agent.agentName}</p>
                      <span className="text-slate-500 text-xs">{agent.count} lançamento{agent.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden w-full max-w-xs">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white font-bold">{fmt(agent.totalCommission)}</p>
                    <p className="text-slate-500 text-xs">{pct.toFixed(1)}% do total</p>
                  </div>
                  <div className="hidden md:flex gap-2 flex-shrink-0">
                    {agent.pendente > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">{fmt(agent.pendente)}</span>}
                    {agent.paga > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">{fmt(agent.paga)}</span>}
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700 bg-slate-900/30">
                          <th className="px-4 py-2 text-left text-slate-400 font-medium text-xs">Descrição</th>
                          <th className="px-4 py-2 text-right text-slate-400 font-medium text-xs hidden md:table-cell">Venda</th>
                          <th className="px-4 py-2 text-right text-slate-400 font-medium text-xs hidden md:table-cell">Taxa</th>
                          <th className="px-4 py-2 text-right text-slate-400 font-medium text-xs">Comissão</th>
                          <th className="px-4 py-2 text-center text-slate-400 font-medium text-xs">Status</th>
                          <th className="px-4 py-2 text-right text-slate-400 font-medium text-xs hidden lg:table-cell">Período</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {agent.commissions.map(c => (
                          <tr key={c.id} className="hover:bg-slate-700/20">
                            <td className="px-4 py-2 text-slate-300">{c.description ?? '—'}</td>
                            <td className="px-4 py-2 text-right text-slate-400 hidden md:table-cell">{c.saleAmount > 0 ? fmt(c.saleAmount) : '—'}</td>
                            <td className="px-4 py-2 text-right text-slate-400 hidden md:table-cell">{c.rate > 0 ? `${c.rate}%` : '—'}</td>
                            <td className="px-4 py-2 text-right text-white font-medium">{fmt(c.amount)}</td>
                            <td className="px-4 py-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[c.status] ?? ''}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-slate-500 text-xs hidden lg:table-cell">{c.period}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
