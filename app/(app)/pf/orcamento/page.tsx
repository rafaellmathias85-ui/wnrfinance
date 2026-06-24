'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import {
  Target, TrendingUp, TrendingDown, Wallet, PiggyBank,
  ChevronDown, ChevronRight, Plus, Pencil, Check, X
} from 'lucide-react';
import Link from 'next/link';

const GROUPS_ORDER = ['Receita', 'Habitação', 'Filhos', 'Automóvel', 'Diversos', 'Poupança'];
const GROUP_TYPE: Record<string, 'income' | 'expense' | 'savings'> = {
  Receita: 'income', Habitação: 'expense', Filhos: 'expense',
  Automóvel: 'expense', Diversos: 'expense', Poupança: 'savings',
};
const SUBGROUPS: Record<string, string[]> = {
  Receita:   ['Salário','Pró-labore','Freelance','Aluguéis','Dividendos','Outros'],
  Habitação: ['Aluguel/Financiamento','Condomínio','IPTU','Água','Luz','Gás','Internet','Outros'],
  Filhos:    ['Escola','Material Escolar','Atividades','Saúde','Outros'],
  Automóvel: ['Combustível','IPVA','Seguro','Manutenção','Estacionamento','Outros'],
  Diversos:  ['Alimentação','Saúde','Lazer','Vestuário','Assinaturas','Educação','Viagem','Outros'],
  Poupança:  ['Longo Prazo','Curto Prazo','Filho','Emergência','Outros'],
};

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;

type Row = {
  id: string; group: string; subgroup: string; type: string;
  planned: number; realized: number; diff: number; diffPct: number;
};
type Kpis = {
  incomeRealized: number; incomePlanned: number;
  expenseRealized: number; expensePlanned: number;
  savingsRealized: number; savingsPlanned: number;
  resultado: number; pocketMargin: number; savingsRate: number;
};

const now = new Date();

export default function OrcamentoPage() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<Row[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newSubgroup, setNewSubgroup] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/pf/orcamento/summary?year=${year}&month=${month}`);
      if (res.ok) {
        const d = await res.json();
        setRows(d.rows);
        setKpis(d.kpis);
      }
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const toggleGroup = (g: string) =>
    setCollapsed((p) => ({ ...p, [g]: !p[g] }));

  const startEdit = (row: Row) => {
    setEditingCell(`${row.group}||${row.subgroup}`);
    setEditValue(row.planned > 0 ? row.planned.toFixed(2) : '');
  };

  const saveEdit = async (row: Row) => {
    const planned = parseFloat(editValue.replace(',', '.'));
    if (isNaN(planned)) { toast.error('Valor inválido'); return; }

    const res = await apiFetch('/api/pf/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year, month, group: row.group, subgroup: row.subgroup,
        planned, type: GROUP_TYPE[row.group] ?? 'expense',
      }),
    });
    if (res.ok) { toast.success('Planejado atualizado!'); setEditingCell(null); load(); }
    else toast.error('Erro ao salvar');
  };

  const addSubgroup = async (group: string) => {
    const subgroup = newSubgroup[group]?.trim();
    if (!subgroup) return;

    const res = await apiFetch('/api/pf/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year, month, group, subgroup, planned: 0,
        type: GROUP_TYPE[group] ?? 'expense',
      }),
    });
    if (res.ok) {
      toast.success(`${subgroup} adicionado!`);
      setNewSubgroup((p) => ({ ...p, [group]: '' }));
      load();
    } else toast.error('Erro ao adicionar');
  };

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  const groupedRows = GROUPS_ORDER.reduce<Record<string, Row[]>>((acc, g) => {
    acc[g] = rows.filter((r) => r.group === g);
    return acc;
  }, {});

  // Inclui grupos com dados mas sem orçamento
  rows.forEach((r) => {
    if (!GROUPS_ORDER.includes(r.group)) {
      if (!groupedRows[r.group]) groupedRows[r.group] = [];
      if (!groupedRows[r.group].find((x) => x.subgroup === r.subgroup)) {
        groupedRows[r.group].push(r);
      }
    }
  });

  const groupColor: Record<string, string> = {
    Receita: 'text-green-400', Poupança: 'text-blue-400',
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orçamento Mensal</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Planejado vs Realizado — clique no valor planejado para editar</p>
        </div>
        <Link href="/pf/lancamentos"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> Lançar
        </Link>
      </div>

      {/* Navegação mês */}
      <div className="flex items-center gap-3">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="bg-card border border-border text-foreground rounded-lg px-3 py-1.5 text-sm">
          {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
        </select>
        <div className="flex gap-1">
          {months.map((m, i) => (
            <button key={i} onClick={() => setMonth(i + 1)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${month === i + 1 ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-xs text-muted-foreground">Receita Realizada</span>
            </div>
            <p className="text-xl font-bold text-green-400">{fmt(kpis.incomeRealized)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Planejado: {fmt(kpis.incomePlanned)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-red-400" />
              <span className="text-xs text-muted-foreground">Despesas Realizadas</span>
            </div>
            <p className="text-xl font-bold text-red-400">{fmt(kpis.expenseRealized)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Planejado: {fmt(kpis.expensePlanned)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">Pocket Margin</span>
            </div>
            <p className={`text-xl font-bold ${kpis.pocketMargin >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
              {fmt(kpis.pocketMargin)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Resultado - Poupança</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Taxa de Poupança</span>
            </div>
            <p className="text-xl font-bold text-blue-400">{kpis.savingsRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Aportado: {fmt(kpis.savingsRealized)}</p>
          </div>
        </div>
      )}

      {/* Resultado */}
      {kpis && (
        <div className={`rounded-xl border p-4 flex items-center justify-between ${kpis.resultado >= 0 ? 'bg-green-900/20 border-green-700/40' : 'bg-red-900/20 border-red-700/40'}`}>
          <div className="flex items-center gap-2">
            <Target className={`w-5 h-5 ${kpis.resultado >= 0 ? 'text-green-400' : 'text-red-400'}`} />
            <span className="text-foreground font-medium">Resultado do Mês</span>
            <span className="text-muted-foreground text-sm">(Receita − Despesas)</span>
          </div>
          <span className={`text-2xl font-bold ${kpis.resultado >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmt(kpis.resultado)}
          </span>
        </div>
      )}

      {/* Tabela por grupo */}
      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Carregando...</div>
      ) : (
        <div className="space-y-3">
          {GROUPS_ORDER.map((group) => {
            const gRows = groupedRows[group] ?? [];
            const plannedTotal = gRows.reduce((s, r) => s + r.planned, 0);
            const realizedTotal = gRows.reduce((s, r) => s + Math.abs(r.realized), 0);
            const isOpen = !collapsed[group];
            const colorClass = groupColor[group] ?? 'text-foreground';

            return (
              <div key={group} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <span className={`font-semibold ${colorClass}`}>{group}</span>
                    <span className="text-xs text-muted-foreground">({gRows.length} itens)</span>
                  </div>
                  <div className="flex gap-8 text-sm">
                    <span className="text-muted-foreground">Plan: <span className="text-foreground">{fmt(plannedTotal)}</span></span>
                    <span className="text-muted-foreground">Real: <span className={colorClass}>{fmt(realizedTotal)}</span></span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/60">
                          <th className="text-left px-5 py-2.5 text-muted-foreground font-medium text-xs w-1/3">Subgrupo</th>
                          <th className="text-right px-4 py-2.5 text-muted-foreground font-medium text-xs">Planejado</th>
                          <th className="text-right px-4 py-2.5 text-muted-foreground font-medium text-xs">Realizado</th>
                          <th className="text-right px-4 py-2.5 text-muted-foreground font-medium text-xs">Diferença</th>
                          <th className="text-right px-4 py-2.5 text-muted-foreground font-medium text-xs">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gRows.map((row) => {
                          const cellKey = `${row.group}||${row.subgroup}`;
                          const isEditing = editingCell === cellKey;
                          const isOverBudget = row.type !== 'income' && row.realized < 0 && Math.abs(row.realized) > row.planned && row.planned > 0;
                          const realAbs = Math.abs(row.realized);

                          return (
                            <tr key={cellKey} className="border-b border-border/30 hover:bg-muted/20">
                              <td className="px-5 py-2.5 text-foreground">{row.subgroup}</td>
                              <td className="px-4 py-2.5 text-right">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <input
                                      autoFocus
                                      type="number" min="0" step="0.01"
                                      value={editValue}
                                      onChange={e => setEditValue(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(row); if (e.key === 'Escape') setEditingCell(null); }}
                                      className="w-28 bg-muted border border-blue-500 text-white rounded px-2 py-1 text-xs text-right focus:outline-none"
                                    />
                                    <button onClick={() => saveEdit(row)} className="p-1 text-green-400 hover:text-green-300"><Check className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setEditingCell(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                ) : (
                                  <button onClick={() => startEdit(row)}
                                    className="text-foreground hover:text-foreground flex items-center gap-1 ml-auto group">
                                    {fmt(row.planned)}
                                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                                  </button>
                                )}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-medium ${colorClass}`}>
                                {fmt(realAbs)}
                              </td>
                              <td className={`px-4 py-2.5 text-right text-xs ${row.planned === 0 ? 'text-muted-foreground' : isOverBudget ? 'text-red-400' : 'text-muted-foreground'}`}>
                                {row.planned === 0 ? '—' : fmt(Math.abs(row.diff))}
                              </td>
                              <td className={`px-4 py-2.5 text-right text-xs ${isOverBudget ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                                {row.planned === 0 ? '—' : fmtPct(row.diffPct)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Adicionar subgrupo */}
                    <div className="px-5 py-3 border-t border-border/40 flex items-center gap-2">
                      <select
                        value={newSubgroup[group] ?? ''}
                        onChange={e => setNewSubgroup(p => ({ ...p, [group]: e.target.value }))}
                        className="bg-muted border border-border text-foreground rounded px-2 py-1.5 text-xs flex-1 max-w-[200px]"
                      >
                        <option value="">— Adicionar subgrupo —</option>
                        {(SUBGROUPS[group] ?? [])
                          .filter(s => !gRows.find(r => r.subgroup === s))
                          .map(s => <option key={s}>{s}</option>)}
                        <option value="__custom">Outro (personalizado)</option>
                      </select>
                      <button onClick={() => addSubgroup(group)}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2 py-1.5">
                        <Plus className="w-3.5 h-3.5" /> Adicionar
                      </button>
                    </div>
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
