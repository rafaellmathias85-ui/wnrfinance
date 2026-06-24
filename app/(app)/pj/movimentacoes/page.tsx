'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/fetch';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  Download,
  Eye,
  Filter,
  GitMerge,
  HandCoins,
  Link2Off,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ThumbsUp,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Movement {
  id: string;
  date: string;
  dueDate: string;
  description: string;
  category: string | null;
  categoryId: string | null;
  tipo: 'entrada' | 'saida';
  amount: number;
  status: string;
  clienteFornecedor: string | null;
  notes: string | null;
  paymentMethod: string | null;
  launchType: string | null;
  isRecurring: boolean;
  recurrenceId: string | null;
  saldoAcumulado: number;
  isConciliado: boolean;
  reconciledAt: string | null;
}

interface Totals {
  totalEntradas: number;
  totalSaidas: number;
  resultado: number;
  saldoPeriodo: number;
  saldoHoje: number;
  totalPages: number;
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string) =>
  new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR');

const now = new Date();
// Default: current month only
const DEFAULT_START = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const DEFAULT_END = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-yellow-900/30 text-yellow-300' },
  pago: { label: 'Pago', cls: 'bg-green-900/30 text-green-300' },
  recebido: { label: 'Recebido', cls: 'bg-green-900/30 text-green-300' },
  cancelado: { label: 'Cancelado', cls: 'bg-red-900/30 text-red-300' },
  vencido: { label: 'Vencido', cls: 'bg-red-900/30 text-red-400' },
  aprovado: { label: 'Aprovado', cls: 'bg-blue-900/30 text-blue-300' },
};

const LAUNCH_TYPE_LABELS: Record<string, string> = {
  venda: 'Venda',
  contrato: 'Contrato',
  aporte: 'Aporte',
  outros: 'Outros Recebimentos',
  fornecedor: 'Fornecedor',
  funcionario: 'Funcionário',
  impostos: 'Impostos',
  transferencia: 'Transferência',
  lucros: 'Lucros',
};

// ─── Criar Dropdown ───────────────────────────────────────────────────────────
function CriarDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navigate = (path: string, launchType: string) => {
    setOpen(false);
    router.push(`${path}?novo=true&launchType=${launchType}`);
  };

  const entradas = [
    { key: 'venda', label: 'Venda' },
    { key: 'contrato', label: 'Contrato' },
    { key: 'outros', label: 'Outros Recebimentos' },
    { key: 'aporte', label: 'Aporte' },
  ];
  const saidas = [
    { key: 'fornecedor', label: 'Fornecedor' },
    { key: 'funcionario', label: 'Funcionário' },
    { key: 'impostos', label: 'Impostos' },
    { key: 'transferencia', label: 'Transferência' },
    { key: 'lucros', label: 'Distribuição de Lucros' },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
      >
        <Plus className="w-4 h-4" />
        Criar
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-52 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider border-b border-border">
            Receitas
          </div>
          {entradas.map((e) => (
            <button
              key={e.key}
              onClick={() => navigate('/pj/contas-receber', e.key)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted text-left"
            >
              <ArrowUpCircle className="w-4 h-4 text-green-400" />
              {e.label}
            </button>
          ))}
          <div className="px-3 py-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider border-t border-b border-border">
            Despesas
          </div>
          {saidas.map((s) => (
            <button
              key={s.key}
              onClick={() => navigate('/pj/contas-pagar', s.key)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted text-left"
            >
              <ArrowDownCircle className="w-4 h-4 text-red-400" />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Row Actions Dropdown ─────────────────────────────────────────────────────
function RowMoreMenu({
  item,
  onDuplicate,
  onEstornar,
  onDelete,
}: {
  item: Movement;
  onDuplicate: () => void;
  onEstornar: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        title="Mais opções"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-44 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          <button
            onClick={() => { onDuplicate(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted"
          >
            <Copy className="w-4 h-4" /> Duplicar
          </button>
          <button
            onClick={() => { onEstornar(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-yellow-600 dark:text-yellow-300 hover:bg-muted"
          >
            <RotateCcw className="w-4 h-4" /> Estornar
          </button>
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 dark:text-red-400 hover:bg-muted"
          >
            <Trash2 className="w-4 h-4" /> Excluir
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Batch Bar ────────────────────────────────────────────────────────────────
function BatchBar({
  count,
  onClear,
  onAction,
}: {
  count: number;
  onClear: () => void;
  onAction: (a: string) => void;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border px-6 py-3 flex items-center gap-3 shadow-2xl">
      <span className="text-sm text-muted-foreground mr-2">
        <span className="text-foreground font-semibold">{count}</span> selecionado(s)
      </span>
      <div className="h-4 w-px bg-border" />
      <button
        onClick={() => onAction('export')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/70 text-foreground text-sm"
      >
        <Download className="w-4 h-4" /> Exportar
      </button>
      <button
        onClick={() => onAction('import')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/70 text-foreground text-sm"
      >
        <Upload className="w-4 h-4" /> Importar
      </button>
      <button
        onClick={() => onAction('desconciliar')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/70 text-foreground text-sm"
      >
        <Link2Off className="w-4 h-4" /> Desconciliar
      </button>
      <button
        onClick={() => onAction('estornar')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white text-sm"
      >
        <RotateCcw className="w-4 h-4" /> Estornar
      </button>
      <button
        onClick={() => onAction('conciliar')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-sm"
      >
        <GitMerge className="w-4 h-4" /> Conciliar
      </button>
      <button
        onClick={() => onAction('quitar')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm"
      >
        <HandCoins className="w-4 h-4" /> Quitar
      </button>
      <button
        onClick={() => onAction('delete')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm"
      >
        <Trash2 className="w-4 h-4" /> Excluir
      </button>
      <button onClick={onClear} className="ml-auto p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MovimentacoesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<Totals>({
    totalEntradas: 0,
    totalSaidas: 0,
    resultado: 0,
    saldoPeriodo: 0,
    saldoHoje: 0,
    totalPages: 1,
    total: 0,
  });

  // Filters
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [tipoData, setTipoData] = useState('vencimento');
  const [tipo, setTipo] = useState('all');
  const [busca, setBusca] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [status, setStatus] = useState('');
  const [especie, setEspecie] = useState('');
  const [tipoValor, setTipoValor] = useState('');
  const [clienteFornecedor, setClienteFornecedor] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(1);

  // Saldo popup
  const [showSaldoPopup, setShowSaldoPopup] = useState(false);
  const [saldoTab, setSaldoTab] = useState<'bancaria' | 'credito'>('bancaria');
  const [bancoSaldos, setBancoSaldos] = useState<any>(null);
  const [loadingSaldo, setLoadingSaldo] = useState(false);

  const openSaldoPopup = async () => {
    setShowSaldoPopup(true);
    setLoadingSaldo(true);
    try {
      const r = await apiFetch('/api/pj/bancos/saldo');
      if (r.ok) setBancoSaldos(await r.json());
    } finally { setLoadingSaldo(false); }
  };

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))
    );

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({
      startDate,
      endDate,
      tipoData,
      tipo,
      page: String(page),
      ...(busca ? { busca } : {}),
      ...(categoriaId ? { categoriaId } : {}),
      ...(status ? { status } : {}),
      ...(especie ? { especie } : {}),
      ...(tipoValor ? { tipoValor } : {}),
      ...(clienteFornecedor ? { clienteFornecedor } : {}),
    });
    const r = await apiFetch(`/api/pj/movimentacoes?${p}`);
    const d = await r.json();
    setItems(d.items || []);
    setTotals({
      totalEntradas: d.totalEntradas || 0,
      totalSaidas: d.totalSaidas || 0,
      resultado: d.resultado || 0,
      saldoPeriodo: d.saldoPeriodo || 0,
      saldoHoje: d.saldoHoje || 0,
      totalPages: d.totalPages || 1,
      total: d.total || 0,
    });
    setLoading(false);
  }, [startDate, endDate, tipoData, tipo, busca, categoriaId, status, especie, tipoValor, clienteFornecedor, page]);

  useEffect(() => { load(); }, [load]);

  // KPI card click: filter by tipo
  const handleCardFilter = (cardTipo: string) => {
    setTipo((prev) => (prev === cardTipo ? 'all' : cardTipo));
    setPage(1);
  };

  const exportCSV = () => {
    const header = 'Data,Vencimento,Descrição,Cliente/Fornecedor,Categoria,Tipo,Status,Valor,Saldo Acumulado';
    const rows = items.map((m) =>
      `${fmtDate(m.date)},${fmtDate(m.dueDate)},"${m.description}","${m.clienteFornecedor || ''}","${m.category || ''}",${m.tipo},${m.status},${m.amount.toFixed(2)},${m.saldoAcumulado.toFixed(2)}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimentacoes_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBatchAction = async (action: string) => {
    if (action === 'export') { exportCSV(); return; }
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      await apiFetch('/api/pj/movimentacoes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      });
      setSelected(new Set());
      load();
    } catch {
      // silent
    }
  };

  const handleRowAction = async (rowId: string, action: string) => {
    try {
      await apiFetch('/api/pj/movimentacoes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [rowId], action }),
      });
      load();
    } catch {
      // silent
    }
  };

  const CARDS = [
    {
      label: 'Total Saídas',
      value: totals.totalSaidas,
      icon: TrendingDown,
      color: 'text-red-500 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/40',
      ring: tipo === 'saida' ? 'ring-2 ring-red-500' : '',
      filterKey: 'saida',
    },
    {
      label: 'Total Entradas',
      value: totals.totalEntradas,
      icon: TrendingUp,
      color: 'text-green-500 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700/40',
      ring: tipo === 'entrada' ? 'ring-2 ring-green-500' : '',
      filterKey: 'entrada',
    },
    {
      label: 'Resultado',
      value: totals.resultado,
      icon: ChevronsUpDown,
      color: totals.resultado >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/40',
      ring: '',
      filterKey: '',
    },
    {
      label: 'Saldo Hoje',
      value: totals.saldoHoje,
      icon: Wallet,
      color: totals.saldoHoje >= 0 ? 'text-foreground' : 'text-red-500 dark:text-red-400',
      bg: 'bg-muted/60 border-border',
      ring: '',
      filterKey: '',
      onClick: openSaldoPopup,
    },
  ];

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="p-6 space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Movimentação Financeira</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Entradas e saídas consolidadas da empresa</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-muted hover:bg-muted/70 text-foreground px-4 py-2 rounded-lg text-sm"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          <CriarDropdown />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {CARDS.map((c) => (
          <div
            key={c.label}
            onClick={() => { if ((c as any).onClick) (c as any).onClick(); else if (c.filterKey) handleCardFilter(c.filterKey); }}
            className={`border rounded-xl p-4 transition-all ${c.bg} ${c.ring} ${c.filterKey || (c as any).onClick ? 'cursor-pointer hover:opacity-90' : ''}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <p className="text-muted-foreground text-xs">{c.label}</p>
            </div>
            <p className={`text-xl font-bold ${c.color}`}>{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Saldo Popup */}
      {showSaldoPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowSaldoPopup(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <span className="font-semibold text-foreground text-base">Posição de Caixa</span>
                <span className="text-muted-foreground text-xs ml-2">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              </div>
              <button onClick={() => setShowSaldoPopup(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-border">
              {(['bancaria', 'credito'] as const).map(t => (
                <button key={t} onClick={() => setSaldoTab(t)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${saldoTab === t ? 'text-foreground border-b-2 border-blue-500' : 'text-muted-foreground hover:text-foreground/80'}`}>
                  {t === 'bancaria' ? 'Contas Bancárias' : 'Cartão de Crédito'}
                </button>
              ))}
            </div>
            {/* Body */}
            <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
              {loadingSaldo ? (
                <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : !bancoSaldos ? (
                <p className="text-muted-foreground text-sm text-center py-4">Não foi possível carregar os saldos.</p>
              ) : (() => {
                const list: any[] = saldoTab === 'bancaria' ? bancoSaldos.bancaria?.accounts ?? [] : bancoSaldos.credito?.accounts ?? [];
                const total: number = saldoTab === 'bancaria' ? bancoSaldos.bancaria?.total ?? 0 : bancoSaldos.credito?.total ?? 0;
                if (!list.length) return <p className="text-muted-foreground text-sm text-center py-4">Nenhuma conta cadastrada nesta categoria.</p>;
                return (
                  <>
                    {list.map((acc: any) => {
                      const balance = acc.calculatedBalance ?? acc.openingBalance ?? 0;
                      const positive = balance >= 0;
                      return (
                        <div key={acc.id} className="bg-muted/40 rounded-xl border border-border overflow-hidden">
                          {/* Bank header */}
                          <div className="flex items-center justify-between px-4 py-3 bg-muted/60">
                            <div>
                              <p className="font-semibold text-foreground text-sm">{acc.bankName}</p>
                              {acc.accountNumber && <p className="text-muted-foreground text-xs">cc {acc.accountNumber}{acc.agency ? ` · ag ${acc.agency}` : ''}</p>}
                            </div>
                            <span className={`text-lg font-bold ${positive ? 'text-green-400' : 'text-red-400'}`}>
                              {fmt(balance)}
                            </span>
                          </div>
                          {/* Running balance detail */}
                          <div className="grid grid-cols-3 divide-x divide-border text-xs">
                            <div className="px-3 py-2">
                              <p className="text-muted-foreground/60 mb-0.5">Saldo inicial</p>
                              <p className="text-foreground/80 font-medium">{fmt(acc.openingBalance ?? 0)}</p>
                            </div>
                            <div className="px-3 py-2">
                              <p className="text-green-500/70 mb-0.5">+ Entradas</p>
                              <p className="text-green-400 font-medium">{fmt(acc.totalCredits ?? 0)}</p>
                            </div>
                            <div className="px-3 py-2">
                              <p className="text-red-500/70 mb-0.5">− Saídas</p>
                              <p className="text-red-400 font-medium">{fmt(acc.totalDebits ?? 0)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Total */}
                    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border font-bold text-sm ${total >= 0 ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
                      <span className="text-foreground/80">Total {saldoTab === 'bancaria' ? 'Bancário' : 'Crédito'}</span>
                      <span className={total >= 0 ? 'text-green-400' : 'text-red-400'}>{fmt(total)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        {/* Basic row */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tipo data</label>
            <select
              value={tipoData}
              onChange={(e) => { setTipoData(e.target.value); setPage(1); }}
              className="bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm"
            >
              <option value="pagamento">Data Pagamento</option>
              <option value="vencimento">Data Vencimento</option>
              <option value="emissao">Data Emissão</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">De</label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Mês anterior"
                onClick={() => {
                  const d = new Date(startDate + 'T00:00:00');
                  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
                  const lastDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
                  const pad = (n: number) => String(n).padStart(2, '0');
                  setStartDate(`${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-01`);
                  setEndDate(`${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(lastDay)}`);
                  setPage(1);
                }}
                className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                className="bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Até</label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                className="bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="button"
                title="Próximo mês"
                onClick={() => {
                  const d = new Date(startDate + 'T00:00:00');
                  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
                  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                  const pad = (n: number) => String(n).padStart(2, '0');
                  setStartDate(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`);
                  setEndDate(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(lastDay)}`);
                  setPage(1);
                }}
                className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-foreground"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => { setTipo(e.target.value); setPage(1); }}
              className="bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="saida">Saídas</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-muted-foreground mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Descrição ou cliente..."
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPage(1); }}
                className="w-full bg-background border border-border text-foreground rounded-lg pl-8 pr-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${showAdvanced ? 'bg-blue-600 dark:bg-blue-700 border-blue-500 text-white' : 'bg-background border-border text-muted-foreground hover:text-foreground'}`}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
          <span className="text-muted-foreground/60 text-sm ml-auto">{totals.total} registros</span>
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="flex flex-wrap gap-3 pt-3 border-t border-border">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Cliente / Fornecedor</label>
              <input
                type="text"
                placeholder="Nome..."
                value={clienteFornecedor}
                onChange={(e) => { setClienteFornecedor(e.target.value); setPage(1); }}
                className="bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm w-44"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago / Recebido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Espécie</label>
              <select
                value={especie}
                onChange={(e) => { setEspecie(e.target.value); setPage(1); }}
                className="bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todas</option>
                <option value="PIX">PIX</option>
                <option value="BOLETO">Boleto</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Tipo Valor</label>
              <select
                value={tipoValor}
                onChange={(e) => { setTipoValor(e.target.value); setPage(1); }}
                className="bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="positivo">Positivo (Entradas)</option>
                <option value="negativo">Negativo (Saídas)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setClienteFornecedor('');
                  setStatus('');
                  setEspecie('');
                  setTipoValor('');
                  setCategoriaId('');
                  setPage(1);
                }}
                className="flex items-center gap-1 px-3 py-2 bg-muted hover:bg-muted/80 text-muted-foreground text-sm rounded-lg"
              >
                <X className="w-3.5 h-3.5" /> Limpar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                  className="accent-blue-500"
                />
              </th>
              <th className="text-left px-3 py-3 text-muted-foreground font-medium w-20">Parcela</th>
              <th className="text-left px-3 py-3 text-muted-foreground font-medium">Data</th>
              <th className="text-left px-3 py-3 text-muted-foreground font-medium">Vencimento</th>
              <th className="text-left px-3 py-3 text-muted-foreground font-medium">Descrição</th>
              <th className="text-left px-3 py-3 text-muted-foreground font-medium">Cliente / Fornecedor</th>
              <th className="text-left px-3 py-3 text-muted-foreground font-medium">Categoria</th>
              <th className="text-center px-3 py-3 text-muted-foreground font-medium w-28">Pago</th>
              <th className="text-center px-3 py-3 text-muted-foreground font-medium w-28">Conciliado</th>
              <th className="text-right px-3 py-3 text-muted-foreground font-medium">Valor</th>
              <th className="px-3 py-3 w-32 text-muted-foreground font-medium text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma movimentação no período
                </td>
              </tr>
            ) : (
              items.map((m) => {
                const isSelected = selected.has(m.id);
                const isVencido = m.status === 'pendente' && new Date(m.dueDate) < now;

                return (
                  <tr
                    key={m.id}
                    className={`hover:bg-muted/30 transition-colors ${isSelected ? 'bg-blue-500/10' : ''}`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(m.id)}
                        className="accent-blue-500"
                      />
                    </td>

                    {/* Parcela badge */}
                    <td className="px-3 py-3">
                      {m.recurrenceId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-900/30 text-purple-300">
                          <RefreshCw className="w-3 h-3" />
                          Recor.
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                          Avulso
                        </span>
                      )}
                    </td>

                    {/* Data paga/recebida */}
                    <td className="px-3 py-3 text-foreground/80 whitespace-nowrap">{fmtDate(m.date)}</td>

                    {/* Vencimento */}
                    <td className={`px-3 py-3 whitespace-nowrap text-sm ${isVencido ? 'text-red-500 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                      {fmtDate(m.dueDate)}
                    </td>

                    {/* Descrição */}
                    <td className="px-3 py-3">
                      <div className="text-foreground font-medium max-w-[200px] truncate">{m.description}</div>
                      {m.launchType && (
                        <div className="text-xs text-muted-foreground/60 mt-0.5">
                          {LAUNCH_TYPE_LABELS[m.launchType] || m.launchType}
                        </div>
                      )}
                    </td>

                    {/* Cliente/Fornecedor */}
                    <td className="px-3 py-3">
                      {m.clienteFornecedor ? (
                        <div>
                          <div className="text-foreground/90 max-w-[160px] truncate">{m.clienteFornecedor}</div>
                          {m.notes && (
                            <div className="text-xs text-orange-400 max-w-[160px] truncate mt-0.5">
                              {m.notes}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* Categoria */}
                    <td className="px-3 py-3 text-muted-foreground max-w-[140px] truncate">
                      {m.category || '—'}
                    </td>

                    {/* Pago */}
                    <td className="px-3 py-3 text-center">
                      {m.status === 'pago' || m.status === 'recebido' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700/40">
                          <Check className="w-3 h-3" />
                          {m.tipo === 'entrada' ? 'Recebido' : 'Pago'}
                        </span>
                      ) : isVencido ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700/40">
                          <ArrowDownCircle className="w-3 h-3" /> Vencido
                        </span>
                      ) : m.status === 'cancelado' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                          Cancelado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700/40">
                          <ArrowUpCircle className="w-3 h-3" /> Pendente
                        </span>
                      )}
                    </td>

                    {/* Conciliado */}
                    <td className="px-3 py-3 text-center">
                      {m.isConciliado ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700/40">
                          <GitMerge className="w-3 h-3" /> Conciliado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-muted/50 text-muted-foreground border border-border">
                          <GitMerge className="w-3 h-3" /> Pendente
                        </span>
                      )}
                    </td>

                    {/* Valor */}
                    <td className={`px-3 py-3 text-right font-semibold whitespace-nowrap ${m.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                      {m.tipo === 'saida' ? '-' : '+'}{fmt(m.amount)}
                    </td>

                    {/* Ações */}
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          title="Visualizar"
                          onClick={() => {
                            const path = m.tipo === 'entrada' ? '/pj/contas-receber' : '/pj/contas-pagar';
                            router.push(`${path}?id=${m.id}`);
                          }}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          title={m.status === 'pago' || m.status === 'recebido' ? 'Quitado' : 'Quitar'}
                          onClick={() => handleRowAction(m.id, 'quitar')}
                          className={`p-1.5 rounded hover:bg-emerald-600 ${m.status === 'pago' || m.status === 'recebido' ? 'text-green-500' : 'text-muted-foreground'} hover:text-white`}
                        >
                          <HandCoins className="w-4 h-4" />
                        </button>
                        <button
                          title={m.isConciliado ? 'Desconciliar' : 'Conciliar'}
                          onClick={() => handleRowAction(m.id, m.isConciliado ? 'desconciliar' : 'conciliar')}
                          className={`p-1.5 rounded hover:bg-blue-600 ${m.isConciliado ? 'text-blue-400' : 'text-muted-foreground'} hover:text-white`}
                        >
                          <GitMerge className="w-4 h-4" />
                        </button>
                        <button
                          title="Aprovar"
                          onClick={() => handleRowAction(m.id, 'aprovar')}
                          className="p-1.5 rounded hover:bg-green-600 text-muted-foreground hover:text-white"
                        >
                          <ThumbsUp className="w-4 h-4" />
                        </button>
                        <RowMoreMenu
                          item={m}
                          onDuplicate={() => handleRowAction(m.id, 'duplicate')}
                          onEstornar={() => handleRowAction(m.id, 'estornar')}
                          onDelete={async () => {
                            if (!confirm('Excluir este lançamento?')) return;
                            handleRowAction(m.id, 'delete');
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totals.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 bg-muted hover:bg-muted/70 text-foreground text-sm rounded-lg disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-muted-foreground text-sm">
            Página {page} de {totals.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totals.totalPages, p + 1))}
            disabled={page === totals.totalPages}
            className="px-3 py-1.5 bg-muted hover:bg-muted/70 text-foreground text-sm rounded-lg disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}

      {/* Batch Action Bar */}
      <BatchBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onAction={handleBatchAction}
      />
    </div>
  );
}
