'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, ArrowLeft, TrendingUp, TrendingDown, Repeat } from 'lucide-react';
import Link from 'next/link';

const GROUPS: Record<string, { type: 'income' | 'expense' | 'savings'; subgroups: string[] }> = {
  Receita:    { type: 'income',   subgroups: ['Salário', 'Pró-labore', 'Freelance', 'Aluguéis', 'Dividendos', 'Outros'] },
  Habitação:  { type: 'expense',  subgroups: ['Aluguel/Financiamento', 'Condomínio', 'IPTU', 'Água', 'Luz', 'Gás', 'Internet', 'Outros'] },
  Filhos:     { type: 'expense',  subgroups: ['Escola', 'Material Escolar', 'Atividades', 'Saúde', 'Outros'] },
  Automóvel:  { type: 'expense',  subgroups: ['Combustível', 'IPVA', 'Seguro', 'Manutenção', 'Estacionamento', 'Outros'] },
  Diversos:   { type: 'expense',  subgroups: ['Alimentação', 'Saúde', 'Lazer', 'Vestuário', 'Assinaturas', 'Educação', 'Viagem', 'Outros'] },
  Poupança:   { type: 'savings',  subgroups: ['Longo Prazo', 'Curto Prazo', 'Filho', 'Emergência', 'Outros'] },
};

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const now = new Date();
const EMPTY_FORM = {
  date: now.toISOString().slice(0, 10),
  group: 'Receita',
  subgroup: 'Salário',
  amount: '',
  description: '',
  isRecurring: false,
};

type Tx = {
  id: string;
  date: string;
  group: string;
  subgroup: string;
  amount: string;
  description: string | null;
  isRecurring: boolean;
};

export default function LancamentosPage() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/pf/transactions?year=${year}&month=${month}`);
      if (res.ok) setTxs(await res.json());
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const set = (f: string, v: any) => setForm((p) => ({ ...p, [f]: v }));

  const handleGroupChange = (g: string) => {
    setForm((p) => ({ ...p, group: g, subgroup: GROUPS[g]?.subgroups[0] ?? '' }));
  };

  const handleSubmit = async () => {
    if (!form.amount || !form.date) { toast.error('Preencha data e valor'); return; }
    setSaving(true);
    try {
      const amountNum = parseFloat(form.amount.replace(',', '.'));
      const type = GROUPS[form.group]?.type ?? 'expense';
      const signedAmount = type === 'income' ? Math.abs(amountNum) : -Math.abs(amountNum);

      const url = editing ? `/api/pf/transactions/${editing}` : '/api/pf/transactions';
      const method = editing ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: signedAmount }),
      });

      if (res.ok) {
        toast.success(editing ? 'Lançamento atualizado!' : 'Lançamento registrado!');
        setForm(EMPTY_FORM);
        setEditing(null);
        setShowForm(false);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Erro ao salvar');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (tx: Tx) => {
    setForm({
      date: tx.date.slice(0, 10),
      group: tx.group,
      subgroup: tx.subgroup,
      amount: Math.abs(Number(tx.amount)).toFixed(2),
      description: tx.description ?? '',
      isRecurring: tx.isRecurring,
    });
    setEditing(tx.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este lançamento?')) return;
    const res = await apiFetch(`/api/pf/transactions/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Lançamento excluído'); load(); }
    else toast.error('Erro ao excluir');
  };

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  const inputCls = 'w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500';
  const labelCls = 'block text-xs text-slate-400 mb-1';

  const incomeTotal = txs.filter(t => t.group === 'Receita').reduce((s, t) => s + Number(t.amount), 0);
  const expenseTotal = txs.filter(t => t.group !== 'Receita' && t.group !== 'Poupança').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const savingsTotal = txs.filter(t => t.group === 'Poupança').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/pf/orcamento" className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Lançamentos PF</h1>
          <p className="text-slate-400 text-sm mt-0.5">Registre receitas, despesas e poupança</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Novo Lançamento
        </button>
      </div>

      {/* Navegação mês */}
      <div className="flex items-center gap-3">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm">
          {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
        </select>
        <div className="flex gap-1">
          {months.map((m, i) => (
            <button key={i} onClick={() => setMonth(i + 1)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${month === i + 1 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-xs text-slate-400">Receitas</span>
          </div>
          <p className="text-lg font-bold text-green-400">{fmt(incomeTotal)}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span className="text-xs text-slate-400">Despesas</span>
          </div>
          <p className="text-lg font-bold text-red-400">{fmt(expenseTotal)}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Repeat className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-400">Poupança</span>
          </div>
          <p className="text-lg font-bold text-blue-400">{fmt(savingsTotal)}</p>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
          <h3 className="text-white font-medium">{editing ? 'Editar Lançamento' : 'Novo Lançamento'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Data</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Valor (R$)</label>
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={e => set('amount', e.target.value)} placeholder="0,00" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Grupo</label>
              <select value={form.group} onChange={e => handleGroupChange(e.target.value)} className={inputCls}>
                {Object.keys(GROUPS).map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Subgrupo</label>
              <select value={form.subgroup} onChange={e => set('subgroup', e.target.value)} className={inputCls}>
                {(GROUPS[form.group]?.subgroups ?? []).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Descrição (opcional)</label>
              <input value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="Ex: Salário empresa X" className={inputCls} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="recurring" checked={form.isRecurring}
                onChange={e => set('isRecurring', e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <label htmlFor="recurring" className="text-sm text-slate-300">Lançamento recorrente</label>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSubmit} disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Salvando...' : (editing ? 'Atualizar' : 'Registrar')}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); }}
              className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Carregando...</div>
        ) : txs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            Nenhum lançamento em {months[month - 1]}/{year}.{' '}
            <button onClick={() => setShowForm(true)} className="text-blue-400 hover:underline">Adicionar</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Data</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Grupo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Subgrupo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Descrição</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Valor</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => {
                const amt = Number(tx.amount);
                const isIncome = amt > 0;
                const isSavings = tx.group === 'Poupança';
                return (
                  <tr key={tx.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-slate-300">
                      {new Date(tx.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        isIncome ? 'bg-green-900/40 text-green-400' :
                        isSavings ? 'bg-blue-900/40 text-blue-400' :
                        'bg-red-900/40 text-red-400'
                      }`}>{tx.group}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{tx.subgroup}</td>
                    <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate">{tx.description ?? '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${isIncome ? 'text-green-400' : isSavings ? 'text-blue-400' : 'text-red-400'}`}>
                      {isIncome ? '+' : ''}{fmt(amt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleEdit(tx)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-600 rounded">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(tx.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
