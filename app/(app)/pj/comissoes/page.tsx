'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { DollarSign, Plus, Trash2, X, Check, Banknote } from 'lucide-react';

interface Commission {
  id: string;
  agentName: string;
  description: string | null;
  saleAmount: number;
  rate: number;
  amount: number;
  period: string;
  status: string;
  referenceType: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface Totals {
  pendente: number;
  aprovada: number;
  paga: number;
}

const STATUS_STYLES: Record<string, string> = {
  pendente: 'bg-yellow-500/20 text-yellow-400',
  aprovada: 'bg-blue-500/20 text-blue-400',
  paga: 'bg-green-500/20 text-green-400',
  cancelada: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  paga: 'Paga',
  cancelada: 'Cancelada',
};

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default function ComissoesPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [totals, setTotals] = useState<Totals>({ pendente: 0, aprovada: 0, paga: 0 });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(currentMonth());
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);

  // form
  const [fAgent, setFAgent] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fSale, setFSale] = useState('');
  const [fRate, setFRate] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fNotes, setFNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ period });
    if (filterStatus) params.set('status', filterStatus);
    const r = await apiFetch(`/api/pj/commissions?${params}`);
    const data = await r.json();
    setCommissions(data.commissions ?? []);
    setTotals(data.totals ?? { pendente: 0, aprovada: 0, paga: 0 });
    setLoading(false);
  }, [period, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const calcAmount = () => {
    const sale = parseFloat(fSale) || 0;
    const rate = parseFloat(fRate) || 0;
    if (sale && rate) setFAmount(((sale * rate) / 100).toFixed(2));
  };

  const create = async () => {
    if (!fAgent.trim() || !fAmount) { toast.error('Agente e valor são obrigatórios'); return; }
    const res = await apiFetch('/api/pj/commissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentName: fAgent,
        description: fDesc || null,
        saleAmount: parseFloat(fSale) || 0,
        rate: parseFloat(fRate) || 0,
        amount: parseFloat(fAmount),
        period,
        notes: fNotes || null,
      }),
    });
    if (res.ok) {
      toast.success('Comissão registrada');
      setShowForm(false);
      setFAgent(''); setFDesc(''); setFSale(''); setFRate(''); setFAmount(''); setFNotes('');
      load();
    } else {
      const d = await res.json();
      toast.error(d.error || 'Erro');
    }
  };

  const changeStatus = async (id: string, status: string) => {
    const res = await apiFetch(`/api/pj/commissions?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(status === 'paga' ? { paidAt: new Date().toISOString() } : {}) }),
    });
    if (res.ok) load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir esta comissão?')) return;
    const res = await apiFetch(`/api/pj/commissions?id=${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Removida'); load(); }
  };

  const nextStatus: Record<string, string> = { pendente: 'aprovada', aprovada: 'paga' };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Comissões</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Controle de comissões de vendedores e agentes</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            className="bg-card border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-card border border-border text-foreground rounded-lg px-3 py-2 text-sm">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Registrar
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'A pagar', value: totals.pendente + totals.aprovada, color: 'text-yellow-400' },
          { label: 'Aprovadas', value: totals.aprovada, color: 'text-blue-400' },
          { label: 'Pagas', value: totals.paga, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className={`text-xl font-bold ${s.color}`}>{fmt(s.value)}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : commissions.length === 0 ? (
          <div className="p-12 text-center">
            <Banknote className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-muted-foreground">Nenhuma comissão registrada para {period}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-muted-foreground font-medium">Agente</th>
                <th className="px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">Descrição</th>
                <th className="px-4 py-3 text-muted-foreground font-medium hidden lg:table-cell">Venda</th>
                <th className="px-4 py-3 text-muted-foreground font-medium hidden lg:table-cell">Taxa</th>
                <th className="px-4 py-3 text-muted-foreground font-medium">Comissão</th>
                <th className="px-4 py-3 text-muted-foreground font-medium">Status</th>
                <th className="px-4 py-3 text-muted-foreground font-medium w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {commissions.map(c => (
                <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-foreground font-medium">{c.agentName}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.description ?? '—'}</td>
                  <td className="px-4 py-3 text-foreground hidden lg:table-cell">{c.saleAmount > 0 ? fmt(c.saleAmount) : '—'}</td>
                  <td className="px-4 py-3 text-foreground hidden lg:table-cell">{c.rate > 0 ? `${c.rate}%` : '—'}</td>
                  <td className="px-4 py-3 text-foreground font-semibold">{fmt(c.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[c.status] ?? 'bg-muted text-foreground'}`}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {nextStatus[c.status] && (
                        <button onClick={() => changeStatus(c.id, nextStatus[c.status])}
                          title={nextStatus[c.status] === 'aprovada' ? 'Aprovar' : 'Marcar como paga'}
                          className="p-1.5 text-muted-foreground hover:text-green-400 hover:bg-green-900/20 rounded">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => remove(c.id)}
                        className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-900/20 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Registrar Comissão</h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Agente / Vendedor *</label>
                <input value={fAgent} onChange={e => setFAgent(e.target.value)}
                  placeholder="Nome do vendedor"
                  className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Descrição</label>
                <input value={fDesc} onChange={e => setFDesc(e.target.value)}
                  placeholder="ex: Venda contrato #123"
                  className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Valor da venda</label>
                  <input type="number" value={fSale} onChange={e => setFSale(e.target.value)} onBlur={calcAmount}
                    placeholder="0,00"
                    className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Taxa (%)</label>
                  <input type="number" value={fRate} onChange={e => setFRate(e.target.value)} onBlur={calcAmount}
                    placeholder="5"
                    className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Valor da comissão *</label>
                <input type="number" value={fAmount} onChange={e => setFAmount(e.target.value)}
                  placeholder="Calculado automaticamente ou manual"
                  className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Observações</label>
                <input value={fNotes} onChange={e => setFNotes(e.target.value)}
                  className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-muted hover:bg-muted text-foreground py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={create}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium">
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
