'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/fetch';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  ChevronDown,
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
// Default: last 24 months so historical data is immediately visible
const DEFAULT_START = `${now.getFullYear() - 2}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
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
        <div className="absolute right-0 top-10 z-50 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-700">
            Receitas
          </div>
          {entradas.map((e) => (
            <button
              key={e.key}
              onClick={() => navigate('/pj/contas-receber', e.key)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
            >
              <ArrowUpCircle className="w-4 h-4 text-green-400" />
              {e.label}
            </button>
          ))}
          <div className="px-3 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wider border-t border-b border-slate-700">
            Despesas
          </div>
          {saidas.map((s) => (
            <button
              key={s.key}
              onClick={() => navigate('/pj/contas-pagar', s.key)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
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
        className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-white"
        title="Mais opções"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-44 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
          <button
            onClick={() => { onDuplicate(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            <Copy className="w-4 h-4" /> Duplicar
          </button>
          <button
            onClick={() => { onEstornar(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-yellow-300 hover:bg-slate-700"
          >
            <RotateCcw className="w-4 h-4" /> Estornar
          </button>
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-slate-700"
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
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-700 px-6 py-3 flex items-center gap-3 shadow-2xl">
      <span className="text-sm text-slate-400 mr-2">
        <span className="text-white font-semibold">{count}</span> selecionado(s)
      </span>
      <div className="h-4 w-px bg-slate-600" />
      <button
        onClick={() => onAction('export')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm"
      >
        <Download className="w-4 h-4" /> Exportar
      </button>
      <button
        onClick={() => onAction('import')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm"
      >
        <Upload className="w-4 h-4" /> Importar
      </button>
      <button
        onClick={() => onAction('desconciliar')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm"
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
      <button onClick={onClear} className="ml-auto p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MovimentacoesPage() {
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
  const [tipoData, setTipoData] = useState('pagamento');
  const [tipo, setTipo] = useState('all');
  const [busca, setBusca] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [status, setStatus] = useState('');
  const [especie, setEspecie] = useState('');
  const [tipoValor, setTipoValor] = useState('');
  const [clienteFornecedor, setClienteFornecedor] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(1);

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

  const CARDS = [
    {
      label: 'Total Saídas',
      value: totals.totalSaidas,
      icon: TrendingDown,
      color: 'text-red-400',
      bg: 'bg-red-900/20 border-red-700/40',
      ring: tipo === 'saida' ? 'ring-2 ring-red-500' : '',
      filterKey: 'saida',
    },
    {
      label: 'Total Entradas',
      value: totals.totalEntradas,
      icon: TrendingUp,
      color: 'text-green-400',
      bg: 'bg-green-900/20 border-green-700/40',
      ring: tipo === 'entrada' ? 'ring-2 ring-green-500' : '',
      filterKey: 'entrada',
    },
    {
      label: 'Resultado',
      value: totals.resultado,
      icon: ChevronsUpDown,
      color: totals.resultado >= 0 ? 'text-blue-400' : 'text-orange-400',
      bg: 'bg-blue-900/20 border-blue-700/40',
      ring: '',
      filterKey: '',
    },
    {
      label: 'Saldo Hoje',
      value: totals.saldoHoje,
      icon: Wallet,
      color: totals.saldoHoje >= 0 ? 'text-white' : 'text-red-400',
      bg: 'bg-slate-700/60 border-slate-600',
      ring: '',
      filterKey: '',
    },
  ];

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="p-6 space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Movimentação Financeira</h1>
          <p className="text-slate-400 text-sm mt-0.5">Entradas e saídas consolidadas da empresa</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm"
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
            onClick={() => c.filterKey && handleCardFilter(c.filterKey)}
            className={`border rounded-xl p-4 transition-all ${c.bg} ${c.ring} ${c.filterKey ? 'cursor-pointer hover:opacity-90' : ''}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <p className="text-slate-400 text-xs">{c.label}</p>
            </div>
            <p className={`text-xl font-bold ${c.color}`}>{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
        {/* Basic row */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tipo data</label>
            <select
              value={tipoData}
              onChange={(e) => { setTipoData(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
            >
              <option value="pagamento">Data Pagamento</option>
              <option value="vencimento">Data Vencimento</option>
              <option value="emissao">Data Emissão</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">De</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Até</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => { setTipo(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="saida">Saídas</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-slate-400 mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Descrição ou cliente..."
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPage(1); }}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg pl-8 pr-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${showAdvanced ? 'bg-blue-700 border-blue-600 text-white' : 'bg-slate-900 border-slate-600 text-slate-400 hover:text-white'}`}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
          <span className="text-slate-500 text-sm ml-auto">{totals.total} registros</span>
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-700">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cliente / Fornecedor</label>
              <input
                type="text"
                placeholder="Nome..."
                value={clienteFornecedor}
                onChange={(e) => { setClienteFornecedor(e.target.value); setPage(1); }}
                className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm w-44"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago / Recebido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Espécie</label>
              <select
                value={especie}
                onChange={(e) => { setEspecie(e.target.value); setPage(1); }}
                className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todas</option>
                <option value="PIX">PIX</option>
                <option value="BOLETO">Boleto</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tipo Valor</label>
              <select
                value={tipoValor}
                onChange={(e) => { setTipoValor(e.target.value); setPage(1); }}
                className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
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
                className="flex items-center gap-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg"
              >
                <X className="w-3.5 h-3.5" /> Limpar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
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
              <th className="text-left px-3 py-3 text-slate-400 font-medium w-20">Parcela</th>
              <th className="text-left px-3 py-3 text-slate-400 font-medium">Data</th>
              <th className="text-left px-3 py-3 text-slate-400 font-medium">Vencimento</th>
              <th className="text-left px-3 py-3 text-slate-400 font-medium">Descrição</th>
              <th className="text-left px-3 py-3 text-slate-400 font-medium">Cliente / Fornecedor</th>
              <th className="text-left px-3 py-3 text-slate-400 font-medium">Categoria</th>
              <th className="text-center px-3 py-3 text-slate-400 font-medium w-24">Tipo</th>
              <th className="text-center px-3 py-3 text-slate-400 font-medium w-24">Status</th>
              <th className="text-right px-3 py-3 text-slate-400 font-medium">Valor</th>
              <th className="text-right px-3 py-3 text-slate-400 font-medium">Saldo</th>
              <th className="px-3 py-3 w-32 text-slate-400 font-medium text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {loading ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                  Carregando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma movimentação no período
                </td>
              </tr>
            ) : (
              items.map((m) => {
                const isSelected = selected.has(m.id);
                const statusInfo = STATUS_LABELS[m.status] || { label: m.status, cls: 'bg-slate-700 text-slate-300' };
                const isVencido = m.status === 'pendente' && new Date(m.dueDate) < now;

                return (
                  <tr
                    key={m.id}
                    className={`hover:bg-slate-700/30 transition-colors ${isSelected ? 'bg-blue-900/10' : ''}`}
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
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-400">
                          Avulso
                        </span>
                      )}
                    </td>

                    {/* Data paga/recebida */}
                    <td className="px-3 py-3 text-slate-300 whitespace-nowrap">{fmtDate(m.date)}</td>

                    {/* Vencimento */}
                    <td className={`px-3 py-3 whitespace-nowrap text-sm ${isVencido ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
                      {fmtDate(m.dueDate)}
                    </td>

                    {/* Descrição */}
                    <td className="px-3 py-3">
                      <div className="text-white font-medium max-w-[200px] truncate">{m.description}</div>
                      {m.launchType && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {LAUNCH_TYPE_LABELS[m.launchType] || m.launchType}
                        </div>
                      )}
                    </td>

                    {/* Cliente/Fornecedor */}
                    <td className="px-3 py-3">
                      {m.clienteFornecedor ? (
                        <div>
                          <div className="text-slate-200 max-w-[160px] truncate">{m.clienteFornecedor}</div>
                          {m.notes && (
                            <div className="text-xs text-orange-400 max-w-[160px] truncate mt-0.5">
                              {m.notes}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Categoria */}
                    <td className="px-3 py-3 text-slate-400 max-w-[140px] truncate">
                      {m.category || '—'}
                    </td>

                    {/* Tipo badge */}
                    <td className="px-3 py-3 text-center">
                      {m.tipo === 'entrada' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-300">
                          <ArrowUpCircle className="w-3 h-3" /> Entrada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-900/30 text-red-300">
                          <ArrowDownCircle className="w-3 h-3" /> Saída
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${isVencido ? 'bg-red-900/30 text-red-400' : statusInfo.cls}`}>
                        {isVencido ? 'Vencido' : statusInfo.label}
                      </span>
                    </td>

                    {/* Valor */}
                    <td className={`px-3 py-3 text-right font-semibold whitespace-nowrap ${m.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                      {m.tipo === 'saida' ? '-' : '+'}{fmt(m.amount)}
                    </td>

                    {/* Saldo acumulado */}
                    <td className={`px-3 py-3 text-right font-medium whitespace-nowrap ${m.saldoAcumulado >= 0 ? 'text-white' : 'text-red-400'}`}>
                      {fmt(m.saldoAcumulado)}
                    </td>

                    {/* Ações */}
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          title="Visualizar"
                          className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-white"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          title="Quitar"
                          className="p-1.5 rounded hover:bg-emerald-600 text-slate-400 hover:text-white"
                        >
                          <HandCoins className="w-4 h-4" />
                        </button>
                        <button
                          title="Conciliar"
                          className="p-1.5 rounded hover:bg-blue-600 text-slate-400 hover:text-white"
                        >
                          <GitMerge className="w-4 h-4" />
                        </button>
                        <button
                          title="Aprovar"
                          className="p-1.5 rounded hover:bg-green-600 text-slate-400 hover:text-white"
                        >
                          <ThumbsUp className="w-4 h-4" />
                        </button>
                        <RowMoreMenu
                          item={m}
                          onDuplicate={() => {}}
                          onEstornar={() => {}}
                          onDelete={() => {}}
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
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-slate-400 text-sm">
            Página {page} de {totals.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totals.totalPages, p + 1))}
            disabled={page === totals.totalPages}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg disabled:opacity-40"
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
