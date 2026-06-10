'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Target, X } from 'lucide-react';

interface BudgetItem {
  id: string;
  categoryId: string | null;
  category?: { id: string; name: string; code: string | null };
  type: string;
  period: string;
  plannedAmount: number;
  actualAmount: number;
  variance: number;
  notes?: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
  code: string | null;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MONTHS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export default function OrcamentoPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BudgetItem | null>(null);

  const [form, setForm] = useState({
    categoryId: '',
    type: 'despesa',
    period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    plannedAmount: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ year: String(year) });
    if (month !== null) p.set('month', String(month));
    if (typeFilter) p.set('type', typeFilter);
    const [budgetRes, catRes] = await Promise.all([
      apiFetch(`/api/pj/budget?${p}`),
      apiFetch('/api/pj/categories'),
    ]);
    setItems(await budgetRes.json());
    const cats = await catRes.json();
    setCategories(Array.isArray(cats) ? cats : []);
    setLoading(false);
  }, [year, month, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({
      categoryId: '',
      type: 'despesa',
      period: `${year}-${String(month ?? now.getMonth() + 1).padStart(2, '0')}`,
      plannedAmount: '',
      notes: '',
    });
    setShowForm(true);
  };

  const openEdit = (item: BudgetItem) => {
    setEditing(item);
    setForm({
      categoryId: item.categoryId ?? '',
      type: item.type,
      period: item.period,
      plannedAmount: String(item.plannedAmount),
      notes: item.notes ?? '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.period || !form.plannedAmount) { toast.error('Período e valor obrigatórios'); return; }
    const res = await apiFetch('/api/pj/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, categoryId: form.categoryId || null }),
    });
    if (res.ok) {
      toast.success(editing ? 'Orçamento atualizado' : 'Orçamento criado');
      setShowForm(false);
      load();
    } else {
      const d = await res.json();
      toast.error(d.error || 'Erro ao salvar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este item do orçamento?')) return;
    const res = await apiFetch(`/api/pj/budget?id=${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Removido'); load(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };

  // Totals
  const totalPlanned = items.reduce((s, i) => {
    return i.type === 'receita' ? s + i.plannedAmount : s - i.plannedAmount;
  }, 0);
  const totalActual = items.reduce((s, i) => {
    return i.type === 'receita' ? s + i.actualAmount : s - i.actualAmount;
  }, 0);
  const totalReceita = items.filter((i) => i.type === 'receita');
  const totalDespesa = items.filter((i) => i.type === 'despesa');

  const receitaPlanned = totalReceita.reduce((s, i) => s + i.plannedAmount, 0);
  const receitaActual = totalReceita.reduce((s, i) => s + i.actualAmount, 0);
  const despesaPlanned = totalDespesa.reduce((s, i) => s + i.plannedAmount, 0);
  const despesaActual = totalDespesa.reduce((s, i) => s + i.actualAmount, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Previsão Orçamentária</h1>
          <p className="text-slate-400 text-sm mt-0.5">Compare planejado vs. realizado por período</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> Nova Previsão
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setYear((y) => y - 1)} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">‹</button>
          <span className="text-white font-medium text-sm px-2">{year}</span>
          <button onClick={() => setYear((y) => y + 1)} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">›</button>
        </div>
        <select value={month ?? ''} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
          <option value="">Todos os meses</option>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
          <option value="">Receitas e Despesas</option>
          <option value="receita">Somente Receitas</option>
          <option value="despesa">Somente Despesas</option>
        </select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <p className="text-slate-400 text-xs">Receita Prevista</p>
          </div>
          <p className="text-white font-bold text-lg">{fmt(receitaPlanned)}</p>
          <p className="text-green-400 text-xs mt-0.5">Realizado: {fmt(receitaActual)}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <p className="text-slate-400 text-xs">Despesa Prevista</p>
          </div>
          <p className="text-white font-bold text-lg">{fmt(despesaPlanned)}</p>
          <p className="text-red-400 text-xs mt-0.5">Realizado: {fmt(despesaActual)}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-blue-400" />
            <p className="text-slate-400 text-xs">Resultado Previsto</p>
          </div>
          <p className={`font-bold text-lg ${totalPlanned >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(totalPlanned)}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-purple-400" />
            <p className="text-slate-400 text-xs">Resultado Real</p>
          </div>
          <p className={`font-bold text-lg ${totalActual >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(totalActual)}</p>
          <p className={`text-xs mt-0.5 ${totalActual - totalPlanned >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            Variação: {fmt(totalActual - totalPlanned)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Período</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Categoria</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Previsto</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Realizado</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Variação</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium w-8">%</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  <Target className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p>Nenhuma previsão cadastrada</p>
                </td>
              </tr>
            ) : items.map((item) => {
              const pct = item.plannedAmount > 0 ? (item.actualAmount / item.plannedAmount) * 100 : 0;
              const varOk = item.type === 'receita' ? item.variance >= 0 : item.variance <= 0;
              return (
                <tr key={item.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-3 text-white font-mono text-xs">{item.period}</td>
                  <td className="px-4 py-3 text-slate-300 text-sm">
                    {item.category
                      ? <span>{item.category.code ? `${item.category.code} — ` : ''}{item.category.name}</span>
                      : <span className="text-slate-500 italic">Geral</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      item.type === 'receita' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                    }`}>
                      {item.type === 'receita' ? 'Receita' : 'Despesa'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white">{fmt(item.plannedAmount)}</td>
                  <td className="px-4 py-3 text-right text-white">{fmt(item.actualAmount)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${varOk ? 'text-green-400' : 'text-red-400'}`}>
                    {item.variance > 0 ? '+' : ''}{fmt(item.variance)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="w-full bg-slate-700 rounded-full h-1.5 min-w-[40px]">
                      <div
                        className={`h-1.5 rounded-full ${varOk ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, Math.abs(pct))}%` }}
                      />
                    </div>
                    <span className="text-slate-400 text-xs">{pct.toFixed(0)}%</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(item)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">{editing ? 'Editar Previsão' : 'Nova Previsão Orçamentária'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Período *</label>
                <input type="month" value={form.period} onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tipo *</label>
                <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm">
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Categoria</label>
                <select value={form.categoryId} onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm">
                  <option value="">— Geral (sem categoria) —</option>
                  {categories
                    .filter((c) => c.type === form.type || c.type === 'ambos')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code ? `${c.code} — ` : ''}{c.name}
                      </option>
                    ))
                  }
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Valor Previsto (R$) *</label>
                <input type="number" min="0" step="0.01" value={form.plannedAmount}
                  onChange={(e) => setForm((p) => ({ ...p, plannedAmount: e.target.value }))}
                  placeholder="0,00"
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Observações</label>
                <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={handleSave}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
