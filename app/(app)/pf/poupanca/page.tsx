'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Plus, Trash2, PiggyBank, TrendingUp, ArrowDownLeft, ArrowUpRight, Pencil, X } from 'lucide-react';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const COLORS = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#EC4899'];

type Entry = { id: string; date: string; type: string; amount: string; notes: string | null };
type Bucket = {
  id: string; name: string; description: string | null;
  balance: string; color: string; entries: Entry[];
};

const EMPTY_BUCKET = { name: '', description: '', color: '#3B82F6' };
const ENTRY_TYPES = [
  { value: 'aporte',     label: 'Aporte',     icon: ArrowUpRight,   color: 'text-green-400' },
  { value: 'rendimento', label: 'Rendimento',  icon: TrendingUp,     color: 'text-blue-400' },
  { value: 'resgate',    label: 'Resgate',     icon: ArrowDownLeft,  color: 'text-red-400' },
];

export default function PoupancaPage() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewBucket, setShowNewBucket] = useState(false);
  const [bucketForm, setBucketForm] = useState(EMPTY_BUCKET);
  const [savingBucket, setSavingBucket] = useState(false);
  const [activeEntry, setActiveEntry] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState({ date: new Date().toISOString().slice(0, 10), type: 'aporte', amount: '', notes: '' });
  const [savingEntry, setSavingEntry] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/pf/poupanca');
      if (res.ok) setBuckets(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreateBucket = async () => {
    if (!bucketForm.name.trim()) { toast.error('Nome é obrigatório'); return; }
    setSavingBucket(true);
    try {
      const res = await apiFetch('/api/pf/poupanca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bucketForm),
      });
      if (res.ok) { toast.success('Bucket criado!'); setShowNewBucket(false); setBucketForm(EMPTY_BUCKET); load(); }
      else toast.error('Erro ao criar bucket');
    } finally {
      setSavingBucket(false);
    }
  };

  const handleDeleteBucket = async (id: string) => {
    if (!confirm('Desativar este bucket?')) return;
    const res = await apiFetch(`/api/pf/poupanca/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Bucket desativado'); load(); }
    else toast.error('Erro ao desativar');
  };

  const handleAddEntry = async (bucketId: string) => {
    if (!entryForm.amount) { toast.error('Valor é obrigatório'); return; }
    setSavingEntry(true);
    try {
      const res = await apiFetch(`/api/pf/poupanca/${bucketId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...entryForm,
          amount: parseFloat(entryForm.amount.replace(',', '.')),
        }),
      });
      if (res.ok) {
        toast.success('Lançamento registrado!');
        setActiveEntry(null);
        setEntryForm({ date: new Date().toISOString().slice(0, 10), type: 'aporte', amount: '', notes: '' });
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Erro ao salvar');
      }
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDeleteEntry = async (bucketId: string, entryId: string) => {
    if (!confirm('Excluir este lançamento?')) return;
    const res = await apiFetch(`/api/pf/poupanca/${bucketId}/entries?entryId=${entryId}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Lançamento excluído'); load(); }
    else toast.error('Erro ao excluir');
  };

  const totalBalance = buckets.reduce((s, b) => s + Number(b.balance), 0);

  const inputCls = 'w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500';

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Poupança</h1>
          <p className="text-slate-400 text-sm mt-0.5">Buckets de poupança com aportes, rendimentos e resgates</p>
        </div>
        <button onClick={() => setShowNewBucket(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> Novo Bucket
        </button>
      </div>

      {/* Total */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex items-center gap-4">
        <div className="p-3 bg-blue-600/20 rounded-xl">
          <PiggyBank className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <p className="text-slate-400 text-sm">Total em Poupança</p>
          <p className="text-2xl font-bold text-white">{fmt(totalBalance)}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-slate-400 text-sm">{buckets.length} bucket{buckets.length !== 1 ? 's' : ''} ativos</p>
        </div>
      </div>

      {/* Formulário novo bucket */}
      {showNewBucket && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-medium">Novo Bucket</h3>
            <button onClick={() => setShowNewBucket(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nome</label>
              <input value={bucketForm.name} onChange={e => setBucketForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Longo Prazo" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cor</label>
              <div className="flex gap-2 mt-1.5">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setBucketForm(p => ({ ...p, color: c }))}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full transition-transform ${bucketForm.color === c ? 'scale-125 ring-2 ring-white' : ''}`} />
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Descrição (opcional)</label>
              <input value={bucketForm.description} onChange={e => setBucketForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Finalidade do bucket" className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleCreateBucket} disabled={savingBucket}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
              {savingBucket ? 'Criando...' : 'Criar Bucket'}
            </button>
          </div>
        </div>
      )}

      {/* Buckets */}
      {loading ? (
        <div className="p-8 text-center text-slate-400">Carregando...</div>
      ) : buckets.length === 0 ? (
        <div className="p-8 text-center text-slate-400 bg-slate-800 border border-slate-700 rounded-xl">
          Nenhum bucket criado ainda.{' '}
          <button onClick={() => setShowNewBucket(true)} className="text-blue-400 hover:underline">Criar primeiro bucket</button>
        </div>
      ) : (
        <div className="space-y-4">
          {buckets.map((bucket) => {
            const isAddingEntry = activeEntry === bucket.id;
            const entries = bucket.entries ?? [];

            return (
              <div key={bucket.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                {/* Bucket header */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-10 rounded-full" style={{ backgroundColor: bucket.color }} />
                    <div>
                      <p className="text-white font-semibold">{bucket.name}</p>
                      {bucket.description && <p className="text-slate-400 text-xs">{bucket.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Saldo</p>
                      <p className="text-lg font-bold text-white">{fmt(Number(bucket.balance))}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setActiveEntry(isAddingEntry ? null : bucket.id); setEntryForm(p => ({ ...p, amount: '', notes: '' })); }}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-900/20 hover:bg-blue-900/40 px-3 py-1.5 rounded-lg transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Lançar
                      </button>
                      <button onClick={() => handleDeleteBucket(bucket.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Formulário de lançamento */}
                {isAddingEntry && (
                  <div className="border-t border-slate-700 px-5 py-4 bg-slate-700/20">
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Data</label>
                        <input type="date" value={entryForm.date} onChange={e => setEntryForm(p => ({ ...p, date: e.target.value }))}
                          className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Tipo</label>
                        <select value={entryForm.type} onChange={e => setEntryForm(p => ({ ...p, type: e.target.value }))} className={inputCls}>
                          {ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Valor (R$)</label>
                        <input type="number" min="0" step="0.01" value={entryForm.amount}
                          onChange={e => setEntryForm(p => ({ ...p, amount: e.target.value }))} placeholder="0,00" className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Obs</label>
                        <input value={entryForm.notes} onChange={e => setEntryForm(p => ({ ...p, notes: e.target.value }))}
                          placeholder="Opcional" className={inputCls} />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleAddEntry(bucket.id)} disabled={savingEntry}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60">
                        {savingEntry ? 'Salvando...' : 'Registrar'}
                      </button>
                      <button onClick={() => setActiveEntry(null)} className="text-slate-400 hover:text-white px-3 py-1.5 text-sm">Cancelar</button>
                    </div>
                  </div>
                )}

                {/* Extrato */}
                {entries.length > 0 && (
                  <div className="border-t border-slate-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/60">
                          <th className="text-left px-5 py-2 text-slate-500 text-xs font-medium">Data</th>
                          <th className="text-left px-4 py-2 text-slate-500 text-xs font-medium">Tipo</th>
                          <th className="text-left px-4 py-2 text-slate-500 text-xs font-medium">Obs</th>
                          <th className="text-right px-4 py-2 text-slate-500 text-xs font-medium">Valor</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e) => {
                          const entryType = ENTRY_TYPES.find(t => t.value === e.type);
                          const Icon = entryType?.icon ?? TrendingUp;
                          const color = entryType?.color ?? 'text-slate-400';
                          const isResgate = e.type === 'resgate';

                          return (
                            <tr key={e.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                              <td className="px-5 py-2.5 text-slate-300">
                                {new Date(e.date).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className={`flex items-center gap-1.5 ${color}`}>
                                  <Icon className="w-3.5 h-3.5" />
                                  <span className="text-xs capitalize">{e.type}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-slate-400 text-xs max-w-[180px] truncate">{e.notes ?? '—'}</td>
                              <td className={`px-4 py-2.5 text-right font-medium ${isResgate ? 'text-red-400' : color}`}>
                                {isResgate ? '−' : '+'}{fmt(Math.abs(Number(e.amount)))}
                              </td>
                              <td className="px-4 py-2.5">
                                <button onClick={() => handleDeleteEntry(bucket.id, e.id)}
                                  className="p-1 text-slate-400 hover:text-red-400 rounded">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
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
