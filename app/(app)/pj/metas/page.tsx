'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Target, Plus, Trash2, X, Edit2, Check, TrendingUp } from 'lucide-react';

interface Goal {
  id: string;
  title: string;
  description: string | null;
  type: string;
  metric: string;
  targetValue: number;
  currentValue: number;
  period: string;
  status: string;
  color: string;
}

const GOAL_TYPES = [
  { value: 'receita', label: 'Receita' },
  { value: 'despesa', label: 'Despesa' },
  { value: 'clientes', label: 'Novos Clientes' },
  { value: 'nfe', label: 'NF-e Emitidas' },
  { value: 'custom', label: 'Personalizada' },
];

const METRICS = [
  { value: 'valor', label: 'Valor (R$)' },
  { value: 'quantidade', label: 'Quantidade' },
  { value: 'percentual', label: 'Percentual (%)' },
];

const STATUS_STYLES: Record<string, string> = {
  em_andamento: 'text-blue-400',
  atingida: 'text-green-400',
  nao_atingida: 'text-red-400',
};

const COLOR_OPTIONS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777'];

function fmt(v: number, metric: string) {
  if (metric === 'valor') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (metric === 'percentual') return `${v.toFixed(1)}%`;
  return v.toLocaleString('pt-BR');
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function MetasPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(currentMonth());
  const [showForm, setShowForm] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingValue, setUpdatingValue] = useState('');

  // form state
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fType, setFType] = useState('receita');
  const [fMetric, setFMetric] = useState('valor');
  const [fTarget, setFTarget] = useState('');
  const [fColor, setFColor] = useState('#2563eb');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(`/api/pj/goals?period=${period}`);
    setGoals(await r.json());
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!fTitle.trim() || !fTarget) { toast.error('Título e valor alvo são obrigatórios'); return; }
    setSaving(true);
    const res = await apiFetch('/api/pj/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: fTitle, description: fDesc || null, type: fType, metric: fMetric, targetValue: parseFloat(fTarget), period, color: fColor }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Meta criada');
      setShowForm(false);
      setFTitle(''); setFDesc(''); setFTarget(''); setFType('receita'); setFMetric('valor'); setFColor('#2563eb');
      load();
    } else {
      const d = await res.json();
      toast.error(d.error || 'Erro');
    }
  };

  const saveProgress = async (goal: Goal) => {
    const v = parseFloat(updatingValue);
    if (isNaN(v)) { setUpdatingId(null); return; }
    const res = await apiFetch(`/api/pj/goals?id=${goal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentValue: v }),
    });
    if (res.ok) { toast.success('Progresso atualizado'); load(); }
    setUpdatingId(null);
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir esta meta?')) return;
    const res = await apiFetch(`/api/pj/goals?id=${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Meta removida'); load(); }
  };

  const markStatus = async (id: string, status: string) => {
    const res = await apiFetch(`/api/pj/goals?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-700 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-slate-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Metas & OKRs</h1>
            <p className="text-slate-400 text-sm mt-0.5">Defina e acompanhe as metas da empresa</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Nova Meta
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && goals.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total', count: goals.length, color: 'text-white' },
            { label: 'Atingidas', count: goals.filter(g => g.status === 'atingida').length, color: 'text-green-400' },
            { label: 'Em andamento', count: goals.filter(g => g.status === 'em_andamento').length, color: 'text-blue-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-slate-400 text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-sm">Carregando...</div>
      ) : goals.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center">
          <Target className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhuma meta para {period}</p>
          <button onClick={() => setShowForm(true)}
            className="mt-4 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">
            Criar primeira meta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map(goal => {
            const pct = goal.targetValue > 0 ? Math.min((goal.currentValue / goal.targetValue) * 100, 100) : 0;
            return (
              <div key={goal.id} className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0" style={{ background: goal.color }} />
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{goal.title}</p>
                      {goal.description && <p className="text-slate-400 text-xs mt-0.5 truncate">{goal.description}</p>}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-slate-500">
                          {GOAL_TYPES.find(t => t.value === goal.type)?.label}
                        </span>
                        <span className={`text-xs font-medium ${STATUS_STYLES[goal.status] ?? 'text-slate-400'}`}>
                          {goal.status === 'em_andamento' ? 'Em andamento' : goal.status === 'atingida' ? 'Atingida ✓' : 'Não atingida'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => markStatus(goal.id, goal.status === 'atingida' ? 'em_andamento' : 'atingida')}
                      className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-green-900/20 rounded">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => remove(goal.id)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-400">{fmt(goal.currentValue, goal.metric)}</span>
                    <span className="text-slate-500">de {fmt(goal.targetValue, goal.metric)}</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: goal.color }}
                    />
                  </div>
                  <p className="text-right text-xs text-slate-500 mt-1">{pct.toFixed(0)}%</p>
                </div>

                {/* Update progress inline */}
                {updatingId === goal.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={updatingValue}
                      onChange={e => setUpdatingValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveProgress(goal); if (e.key === 'Escape') setUpdatingId(null); }}
                      placeholder="Valor atual"
                      className="flex-1 bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 text-sm"
                      autoFocus
                    />
                    <button onClick={() => saveProgress(goal)} className="text-green-400 hover:text-green-300 p-1">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setUpdatingId(null)} className="text-slate-400 hover:text-white p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setUpdatingId(goal.id); setUpdatingValue(String(goal.currentValue)); }}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    <TrendingUp className="w-3.5 h-3.5" /> Atualizar progresso
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Nova Meta</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Título *</label>
                <input value={fTitle} onChange={e => setFTitle(e.target.value)}
                  placeholder="ex: Receita mensal de R$ 50.000"
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Descrição</label>
                <input value={fDesc} onChange={e => setFDesc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Tipo</label>
                  <select value={fType} onChange={e => setFType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm">
                    {GOAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Métrica</label>
                  <select value={fMetric} onChange={e => setFMetric(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm">
                    {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Valor alvo *</label>
                <input type="number" value={fTarget} onChange={e => setFTarget(e.target.value)}
                  placeholder="50000"
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Cor</label>
                <div className="flex gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c} onClick={() => setFColor(c)}
                      className={`w-7 h-7 rounded-full border-2 ${fColor === c ? 'border-white' : 'border-transparent'}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={create} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-60">
                {saving ? 'Salvando...' : 'Criar Meta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
