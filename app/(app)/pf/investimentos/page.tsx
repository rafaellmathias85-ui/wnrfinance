'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, TrendingUp, TrendingDown, X, Clock, Calendar, Infinity } from 'lucide-react';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

const HORIZONS = [
  { key: 'curto', label: 'Curto Prazo', sublabel: 'Até 1 ano', icon: Clock,    color: 'text-amber-400',  bg: 'bg-amber-900/20 border-amber-700/40' },
  { key: 'medio', label: 'Médio Prazo', sublabel: '1 a 5 anos', icon: Calendar, color: 'text-blue-400',   bg: 'bg-blue-900/20 border-blue-700/40'  },
  { key: 'longo', label: 'Longo Prazo', sublabel: 'Acima de 5 anos', icon: Infinity,  color: 'text-green-400', bg: 'bg-green-900/20 border-green-700/40' },
];

const TYPES = ['CDB','LCI','LCA','Tesouro','Ações','FII','Fundos','Poupança','Cripto','Outros'];
const RATE_INDEXES = ['CDI','IPCA','Selic','Prefixado','Outro'];
const LIQUIDITY = [
  { value: 'diaria',        label: 'Liquidez Diária'  },
  { value: 'd1',            label: 'D+1'              },
  { value: 'd30',           label: 'D+30'             },
  { value: 'no_vencimento', label: 'No Vencimento'    },
];
const RISK = [
  { value: 'conservador', label: 'Conservador' },
  { value: 'moderado',    label: 'Moderado'    },
  { value: 'arrojado',    label: 'Arrojado'    },
];

const EMPTY_FORM = {
  name: '', institution: '', type: 'CDB', horizon: 'curto',
  amount: '', currentValue: '', rate: '', rateIndex: 'CDI',
  liquidity: 'no_vencimento', riskLevel: 'moderado',
  purchaseDate: new Date().toISOString().slice(0, 10), maturityDate: '', notes: '',
};

type Investment = {
  id: string; name: string; institution: string; type: string; horizon: string;
  amount: string; currentValue: string; rate: string | null; rateIndex: string | null;
  liquidity: string; riskLevel: string; purchaseDate: string; maturityDate: string | null; notes: string | null;
};

export default function PfInvestimentosPage() {
  const [data, setData] = useState<{ investments: Investment[]; byHorizon: any; summary: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/pf/investimentos');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  const handleSubmit = async () => {
    if (!form.name || !form.institution || !form.amount || !form.purchaseDate) {
      toast.error('Preencha nome, instituição, valor e data de aplicação');
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/pf/investimentos/${editing}` : '/api/pf/investimentos';
      const method = editing ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          currentValue: form.currentValue ? Number(form.currentValue) : Number(form.amount),
          rate: form.rate ? Number(form.rate) : null,
          maturityDate: form.maturityDate || null,
        }),
      });
      if (res.ok) {
        toast.success(editing ? 'Investimento atualizado!' : 'Investimento cadastrado!');
        setForm(EMPTY_FORM); setEditing(null); setShowForm(false); load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Erro ao salvar');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (inv: Investment) => {
    setForm({
      name: inv.name, institution: inv.institution, type: inv.type, horizon: inv.horizon,
      amount: Number(inv.amount).toFixed(2),
      currentValue: Number(inv.currentValue).toFixed(2),
      rate: inv.rate ?? '', rateIndex: inv.rateIndex ?? 'CDI',
      liquidity: inv.liquidity, riskLevel: inv.riskLevel,
      purchaseDate: inv.purchaseDate.slice(0, 10),
      maturityDate: inv.maturityDate ? inv.maturityDate.slice(0, 10) : '',
      notes: inv.notes ?? '',
    });
    setEditing(inv.id); setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Arquivar este investimento?')) return;
    const res = await apiFetch(`/api/pf/investimentos/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Arquivado'); load(); }
    else toast.error('Erro ao arquivar');
  };

  const inputCls = 'w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500';
  const labelCls = 'block text-xs text-muted-foreground mb-1';

  const summary = data?.summary;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investimentos PF</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Curto, médio e longo prazo — totalmente separado do PJ</p>
        </div>
        <button onClick={() => { setForm(EMPTY_FORM); setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> Novo Investimento
        </button>
      </div>

      {/* Resumo total */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Aplicado</p>
            <p className="text-xl font-bold">{fmt(summary.totalApplied)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Valor Atual</p>
            <p className="text-xl font-bold">{fmt(summary.totalCurrent)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Rentabilidade</p>
            <div className="flex items-center gap-2">
              {summary.totalReturn >= 0
                ? <TrendingUp className="w-4 h-4 text-green-400" />
                : <TrendingDown className="w-4 h-4 text-red-400" />}
              <p className={`text-xl font-bold ${summary.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmtPct(summary.totalReturn)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Formulário */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-medium">{editing ? 'Editar Investimento' : 'Novo Investimento'}</h3>
            <button onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); }}>
              <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Nome</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: CDB Banco XP 13% a.a." className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Instituição</label>
              <input value={form.institution} onChange={e => set('institution', e.target.value)} placeholder="Ex: XP Investimentos" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Tipo</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className={inputCls}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Horizonte</label>
              <select value={form.horizon} onChange={e => set('horizon', e.target.value)} className={inputCls}>
                <option value="curto">Curto Prazo (até 1 ano)</option>
                <option value="medio">Médio Prazo (1 a 5 anos)</option>
                <option value="longo">Longo Prazo (acima de 5 anos)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Risco</label>
              <select value={form.riskLevel} onChange={e => set('riskLevel', e.target.value)} className={inputCls}>
                {RISK.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Valor Aplicado (R$)</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Valor Atual (R$)</label>
              <input type="number" min="0" step="0.01" value={form.currentValue} onChange={e => set('currentValue', e.target.value)} placeholder="Mesmo do aplicado se não souber" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Taxa % a.a. (opcional)</label>
              <input type="number" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)} placeholder="Ex: 13.5" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Indexador</label>
              <select value={form.rateIndex} onChange={e => set('rateIndex', e.target.value)} className={inputCls}>
                {RATE_INDEXES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Liquidez</label>
              <select value={form.liquidity} onChange={e => set('liquidity', e.target.value)} className={inputCls}>
                {LIQUIDITY.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Data de Aplicação</label>
              <input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Vencimento (opcional)</label>
              <input type="date" value={form.maturityDate} onChange={e => set('maturityDate', e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-3">
              <label className={labelCls}>Observações</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Opcional" className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSubmit} disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Salvando...' : (editing ? 'Atualizar' : 'Cadastrar')}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); }}
              className="text-muted-foreground hover:text-foreground px-4 py-2 text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {/* Horizonte cards */}
      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Carregando...</div>
      ) : (
        <div className="space-y-4">
          {HORIZONS.map(({ key, label, sublabel, icon: Icon, color, bg }) => {
            const items: Investment[] = data?.byHorizon?.[key] ?? [];
            const total = items.reduce((s, i) => s + Number(i.currentValue), 0);
            const applied = items.reduce((s, i) => s + Number(i.amount), 0);
            const ret = applied > 0 ? ((total - applied) / applied) * 100 : 0;

            return (
              <div key={key} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className={`flex items-center justify-between px-5 py-4 border-b border-border/60`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg border ${bg}`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <div>
                      <p className={`font-semibold ${color}`}>{label}</p>
                      <p className="text-xs text-muted-foreground">{sublabel} · {items.length} ativo{items.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Aplicado</p>
                      <p className="text-foreground font-medium">{fmt(applied)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Atual</p>
                      <p className={`font-bold ${color}`}>{fmt(total)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Retorno</p>
                      <p className={`font-medium text-xs ${ret >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtPct(ret)}</p>
                    </div>
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="px-5 py-4 text-muted-foreground text-sm text-center">
                    Nenhum investimento de {label.toLowerCase()}.{' '}
                    <button onClick={() => { setForm({ ...EMPTY_FORM, horizon: key }); setEditing(null); setShowForm(true); }}
                      className="text-blue-400 hover:underline">Adicionar</button>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left px-5 py-2.5 text-muted-foreground text-xs font-medium">Nome</th>
                        <th className="text-left px-4 py-2.5 text-muted-foreground text-xs font-medium">Tipo</th>
                        <th className="text-left px-4 py-2.5 text-muted-foreground text-xs font-medium">Taxa</th>
                        <th className="text-left px-4 py-2.5 text-muted-foreground text-xs font-medium">Liquidez</th>
                        <th className="text-right px-4 py-2.5 text-muted-foreground text-xs font-medium">Aplicado</th>
                        <th className="text-right px-4 py-2.5 text-muted-foreground text-xs font-medium">Atual</th>
                        <th className="text-right px-4 py-2.5 text-muted-foreground text-xs font-medium">Retorno</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((inv) => {
                        const amt = Number(inv.amount);
                        const cur = Number(inv.currentValue);
                        const invRet = amt > 0 ? ((cur - amt) / amt) * 100 : 0;
                        const liq = LIQUIDITY.find(l => l.value === inv.liquidity)?.label ?? inv.liquidity;
                        return (
                          <tr key={inv.id} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="px-5 py-3">
                              <p className="text-foreground font-medium">{inv.name}</p>
                              <p className="text-xs text-muted-foreground">{inv.institution}</p>
                            </td>
                            <td className="px-4 py-3 text-foreground">{inv.type}</td>
                            <td className="px-4 py-3 text-foreground text-xs">
                              {inv.rate ? `${Number(inv.rate).toFixed(2)}% ${inv.rateIndex ?? ''}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{liq}</td>
                            <td className="px-4 py-3 text-right text-foreground">{fmt(amt)}</td>
                            <td className={`px-4 py-3 text-right font-medium ${color}`}>{fmt(cur)}</td>
                            <td className={`px-4 py-3 text-right text-xs font-medium ${invRet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {fmtPct(invRet)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 justify-end">
                                <button onClick={() => handleEdit(inv)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDelete(inv.id)} className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-muted rounded">
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
            );
          })}
        </div>
      )}
    </div>
  );
}
