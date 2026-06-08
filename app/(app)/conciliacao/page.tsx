'use client';
import { apiFetch } from '@/lib/fetch';
import { EXPENSE_CATEGORIES, INCOME_TYPES, formatDate, toInputDate } from '@/lib/format';
import { BankImportDialog } from '@/components/bank-import-dialog';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import BankFilter from '@/components/bank-filter';

import {
  ArrowDownCircle, ArrowUpCircle, CheckCircle2, AlertTriangle, HelpCircle,
  Eye, EyeOff, Play, Upload, Search, RefreshCw, FileText, XCircle, Pencil,
  CheckSquare, Square, SquareCheck, ListChecks, Zap, PlusCircle, ArrowLeftRight,
  Link2, ChevronDown, ChevronRight, Package, Calendar, Building2,
} from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  RECONCILED: { label: 'Conciliado', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: CheckCircle2 },
  DIVERGENT: { label: 'Divergente', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertTriangle },
  BANK_ONLY: { label: 'Só no Banco', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: HelpCircle },
  PENDING: { label: 'Pendente', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', icon: RefreshCw },
  IGNORED: { label: 'Ignorado', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500', icon: EyeOff },
  NOT_FOUND: { label: 'Não Encontrado', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

export default function ConciliacaoPage() {
  const formatCurrency = useFormatCurrency();
  const [bankId, setBankId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState<'ofx' | 'manual'>('ofx');
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<any>(null);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState('');
  // Edit states
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ description: '', amount: '', date: '' });
  const [editSaving, setEditSaving] = useState(false);
  // Batch selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  // Force reconciliation
  const [forceItem, setForceItem] = useState<any>(null);
  const [forceReason, setForceReason] = useState('');
  // Link entry dialog (replaces create entry)
  const [linkItem, setLinkItem] = useState<any>(null);
  const [linkTab, setLinkTab] = useState<'link' | 'create'>('link');
  const [linkSearch, setLinkSearch] = useState('');
  const [linkMonth, setLinkMonth] = useState(''); // YYYY-MM format for month filter
  const [linkResults, setLinkResults] = useState<{ expenses: any[]; incomes: any[] }>({ expenses: [], incomes: [] });
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkActionLoading, setLinkActionLoading] = useState('');
  // Create entry form (secondary in link dialog)
  const [createEntryForm, setCreateEntryForm] = useState({
    type: 'expense' as 'expense' | 'income',
    description: '',
    amount: '',
    date: '',
    category: '',
  });
  const [createEntryLoading, setCreateEntryLoading] = useState(false);
  // Batch view
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'batches' | 'flat'>('batches');
  // File upload
  const [fileLoading, setFileLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (bankId) params.set('bankId', bankId);
    if (statusFilter) params.set('status', statusFilter);
    const res = await apiFetch(`/api/reconciliation?${params}`).then(r => r.json());
    setData(res);
    setLoading(false);
    setSelected(new Set());
  }, [bankId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Load unlinked entries when link dialog opens
  const loadUnlinked = useCallback(async (search?: string, month?: string) => {
    setLinkLoading(true);
    const params = new URLSearchParams({ unlinked: 'true' });
    if (search) params.set('search', search);
    if (month) {
      const [y, m] = month.split('-');
      params.set('startDate', `${y}-${m}-01`);
      const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
      params.set('endDate', `${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    }
    const res = await apiFetch(`/api/reconciliation?${params}`).then(r => r.json());
    setLinkResults({ expenses: res.expenses || [], incomes: res.incomes || [] });
    setLinkLoading(false);
  }, []);

  const runEngine = async () => {
    setRunning(true);
    await apiFetch('/api/reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankConnectionId: bankId || undefined }),
    });
    await load();
    setRunning(false);
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ''));
    return lines.slice(1).map(line => {
      const vals = line.split(sep).map(v => v.trim().replace(/"/g, ''));
      const obj: any = {};
      header.forEach((h, i) => {
        if (h.includes('descri') || h === 'memo' || h === 'name') obj.description = vals[i];
        else if (h.includes('valor') || h.includes('amount') || h === 'value') obj.amount = vals[i]?.replace(',', '.');
        else if (h.includes('data') || h.includes('date')) obj.date = vals[i];
        else if (h.includes('tipo') || h.includes('type')) obj.type = vals[i];
      });
      if (!obj.type && obj.amount) obj.type = parseFloat(obj.amount) < 0 ? 'debit' : 'credit';
      return obj;
    }).filter(t => t.description && t.amount && t.date);
  };

  const parseOFX = (text: string): any[] & { closingBalance?: number } => {
    const transactions: any[] & { closingBalance?: number } = [];
    const stmtTrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let match;
    while ((match = stmtTrnRegex.exec(text)) !== null) {
      const block = match[1];
      const get = (tag: string) => { const m = new RegExp(`<${tag}>([^<\\n]+)`, 'i').exec(block); return m ? m[1].trim() : ''; };
      const amt = parseFloat(get('TRNAMT') || '0');
      const dateStr = get('DTPOSTED');
      let date = '';
      if (dateStr.length >= 8) {
        date = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }
      const desc = get('MEMO') || get('NAME') || get('FITID') || 'Sem descricao';
      if (date) {
        transactions.push({ description: desc, amount: String(amt), date, type: amt < 0 ? 'debit' : 'credit' });
      }
    }
    // Extract closing balance from LEDGERBAL or AVAILBAL
    const ledgerMatch = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>)/i.exec(text);
    if (ledgerMatch) {
      const balAmtMatch = /<BALAMT>([^<\n]+)/i.exec(ledgerMatch[1]);
      if (balAmtMatch) transactions.closingBalance = parseFloat(balAmtMatch[1].trim());
    }
    if (transactions.closingBalance == null) {
      const availMatch = /<AVAILBAL>([\s\S]*?)(<\/AVAILBAL>|$)/i.exec(text);
      if (availMatch) {
        const balAmtMatch = /<BALAMT>([^<\n]+)/i.exec(availMatch[1]);
        if (balAmtMatch) transactions.closingBalance = parseFloat(balAmtMatch[1].trim());
      }
    }
    return transactions;
  };

  const parseExcel = async (file: File): Promise<any[]> => {
    const XLSX = (await import('xlsx')).default;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return rows.map(r => {
      const keys = Object.keys(r);
      const findKey = (patterns: string[]) => keys.find(k => patterns.some(p => k.toLowerCase().includes(p))) || '';
      const descKey = findKey(['descri', 'memo', 'name', 'historico', 'lancamento']);
      const amtKey = findKey(['valor', 'amount', 'value', 'quantia']);
      const dateKey = findKey(['data', 'date', 'vencimento']);
      const typeKey = findKey(['tipo', 'type']);
      const amt = String(r[amtKey] || '').replace(',', '.');
      const type = r[typeKey] || (parseFloat(amt) < 0 ? 'debit' : 'credit');
      let date = r[dateKey] || '';
      if (typeof date === 'number') {
        const d = XLSX.SSF.parse_date_code(date);
        date = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
      } else if (typeof date === 'string' && date.includes('/')) {
        const parts = date.split('/');
        if (parts.length === 3) {
          date = parts[2].length === 4
            ? `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
            : `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
      return { description: r[descKey] || '', amount: amt, date: String(date), type };
    }).filter(t => t.description && t.amount && t.date);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileLoading(true);
    setImportResult(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let transactions: any[] = [];
      if (ext === 'pdf') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'extrato');
        const pdfRes = await apiFetch('/api/parse-pdf', { method: 'POST', body: formData });
        const pdfData = await pdfRes.json();
        if (pdfData.error) { setImportResult({ error: pdfData.error }); setFileLoading(false); return; }
        transactions = (pdfData.transactions || []).map((t: any) => ({
          description: t.description || '', amount: Math.abs(parseFloat(t.amount) || 0),
          date: t.date || '', type: t.type === 'credit' ? 'credit' : 'debit',
        })).filter((t: any) => t.description && t.amount && t.date);
      } else if (ext === 'xlsx' || ext === 'xls') {
        transactions = await parseExcel(file);
      } else {
        const text = await file.text();
        if (ext === 'ofx' || ext === 'qfx') { transactions = parseOFX(text); }
        else { transactions = parseCSV(text); }
      }
      if (transactions.length === 0) { setImportResult({ error: 'Nenhuma transação encontrada no arquivo.' }); setFileLoading(false); return; }
      const closingBalance = (transactions as any).closingBalance;
      const res = await apiFetch('/api/bank-transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions, bankConnectionId: bankId || undefined, ...(closingBalance != null && { closingBalance }) }),
      }).then(r => r.json());
      setImportResult(res);
      if (res.imported > 0) setTimeout(() => load(), 500);
    } catch (err: any) { setImportResult({ error: err.message }); }
    finally { setFileLoading(false); }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    try {
      let transactions: any[];
      try {
        transactions = JSON.parse(importText);
        if (!Array.isArray(transactions)) transactions = [transactions];
      } catch {
        if (importText.includes('<OFX>') || importText.includes('<STMTTRN>')) { transactions = parseOFX(importText); }
        else { transactions = parseCSV(importText); }
      }
      if (transactions.length === 0) { setImportResult({ error: 'Nenhuma transação encontrada.' }); return; }
      const closingBal = (transactions as any).closingBalance;
      const res = await apiFetch('/api/bank-transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions, bankConnectionId: bankId || undefined, ...(closingBal != null && { closingBalance: closingBal }) }),
      }).then(r => r.json());
      setImportResult(res);
      if (res.imported > 0) setTimeout(() => load(), 500);
    } catch (e: any) { setImportResult({ error: e.message }); }
  };

  const handleAction = async (reconId: string, action: string, extra?: any) => {
    setActionLoading(reconId);
    await apiFetch('/api/reconciliation', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reconciliationId: reconId, action, ...extra }),
    });
    await load();
    setActionLoading('');
    setShowDetail(null);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setEditForm({
      description: item.internal?.description || '',
      amount: String(item.internal?.amount || ''),
      date: item.internal?.date ? toInputDate(item.internal.date) : '',
    });
  };

  const saveEdit = async () => {
    if (!editItem) return;
    setEditSaving(true);
    await apiFetch('/api/reconciliation', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reconciliationId: editItem.id, action: 'edit', editData: editForm }),
    });
    setEditSaving(false);
    setEditItem(null);
    await load();
  };

  // Batch handlers
  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (!data?.items) return;
    const allIds = data.items.map((i: any) => i.id);
    setSelected(selected.size === allIds.length ? new Set() : new Set(allIds));
  };
  const handleBatch = async (batchAction: string) => {
    if (!selected.size) return;
    setBatchLoading(true);
    await apiFetch('/api/reconciliation', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'batch', ids: Array.from(selected), batchAction }),
    });
    setBatchLoading(false);
    await load();
  };

  // === Link Entry Logic ===
  const openLinkDialog = (item: any) => {
    const bankTx = item.bankTransaction;
    const isDebit = bankTx?.type === 'debit';
    setLinkItem(item);
    setLinkTab('link');
    setLinkSearch('');
    // Pre-select the month of the bank transaction
    const txDate = bankTx?.date ? new Date(bankTx.date) : new Date();
    const monthStr = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
    setLinkMonth(monthStr);
    setLinkResults({ expenses: [], incomes: [] });
    loadUnlinked('', monthStr);
    // Pre-fill create form as fallback
    setCreateEntryForm({
      type: isDebit ? 'expense' : 'income',
      description: bankTx?.description || '',
      amount: String(Math.abs(bankTx?.amount || 0)),
      date: bankTx?.date ? toInputDate(bankTx.date) : '',
      category: 'Outros',
    });
  };

  const handleLinkSearch = useCallback((search: string) => {
    setLinkSearch(search);
    // Debounce not needed here, loadUnlinked is fast
  }, []);

  // Reload unlinked whenever search or month changes
  useEffect(() => {
    if (linkItem) {
      const timer = setTimeout(() => loadUnlinked(linkSearch, linkMonth), 300);
      return () => clearTimeout(timer);
    }
  }, [linkSearch, linkMonth, linkItem, loadUnlinked]);

  const submitLink = async (entryId: string, entryType: 'expense' | 'income') => {
    if (!linkItem) return;
    setLinkActionLoading(entryId);
    try {
      await apiFetch('/api/reconciliation', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reconciliationId: linkItem.id, action: 'link_entry', linkId: entryId, linkType: entryType }),
      });
      setLinkItem(null);
      await load();
    } catch (e) { console.error('Erro ao vincular:', e); }
    finally { setLinkActionLoading(''); }
  };

  const submitCreateEntry = async () => {
    if (!linkItem) return;
    setCreateEntryLoading(true);
    try {
      await apiFetch('/api/reconciliation', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reconciliationId: linkItem.id, action: 'create_entry', entryData: createEntryForm }),
      });
      setLinkItem(null);
      await load();
    } catch (e) { console.error('Erro ao criar:', e); }
    finally { setCreateEntryLoading(false); }
  };

  const acceptBankValue = async (item: any) => {
    if (!item.internal || !item.bankTransaction) return;
    setActionLoading(item.id);
    await apiFetch('/api/reconciliation', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reconciliationId: item.id, action: 'accept_bank_value' }),
    });
    await load();
    setActionLoading('');
  };

  // Toggle batch expansion
  const toggleBatch = (batchId: string) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId); else next.add(batchId);
      return next;
    });
  };

  const s = data?.summary || {};
  const allItems = data?.items || [];
  const batches = data?.batches || [];
  const hasSelection = selected.size > 0;

  // Determine batch status
  const getBatchStatus = (batch: any) => {
    if (batch.stats.total === batch.stats.reconciled + batch.stats.ignored) return 'concluido';
    if (batch.stats.pending > 0 || batch.stats.bankOnly > 0 || batch.stats.divergent > 0) return 'pendente';
    return 'em_andamento';
  };

  const getBatchStatusBadge = (status: string) => {
    if (status === 'concluido') return { label: 'Concluído', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    if (status === 'pendente') return { label: 'Pendente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
    return { label: 'Em Andamento', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
  };

  // Render action buttons for a reconciliation item
  const renderActions = (item: any) => {
    return (
      <div className="flex gap-1 justify-center flex-wrap">
        <button onClick={() => setShowDetail(item)} className="p-1.5 rounded-lg hover:bg-muted" title="Detalhes">
          <Eye className="w-4 h-4 text-muted-foreground" />
        </button>
        {item.status === 'BANK_ONLY' && (
          <button onClick={() => openLinkDialog(item)} className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20" title="Vincular lançamento existente">
            <Link2 className="w-4 h-4 text-green-600" />
          </button>
        )}
        {item.status === 'DIVERGENT' && item.internal && (
          <>
            <button onClick={() => acceptBankValue(item)} disabled={actionLoading === item.id} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Aceitar valor do banco">
              <ArrowLeftRight className="w-4 h-4 text-blue-600" />
            </button>
            <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20" title="Editar">
              <Pencil className="w-4 h-4 text-amber-600" />
            </button>
          </>
        )}
        {(item.status === 'DIVERGENT' || item.status === 'BANK_ONLY' || item.status === 'PENDING') && (
          <>
            <button
              onClick={() => handleAction(item.id, 'approve', { internalId: item.internalId, internalType: item.internalType })}
              disabled={actionLoading === item.id || !item.internalId}
              className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Conciliar"
            >
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            </button>
            <button
              onClick={() => { setForceItem(item); setForceReason(''); }}
              disabled={actionLoading === item.id}
              className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20" title="Forçar"
            >
              <Zap className="w-4 h-4 text-amber-500" />
            </button>
            <button
              onClick={() => handleAction(item.id, 'ignore')}
              disabled={actionLoading === item.id}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Ignorar"
            >
              <EyeOff className="w-4 h-4 text-gray-400" />
            </button>
          </>
        )}
        {item.status === 'RECONCILED' && (
          <>
            <button
              onClick={() => handleAction(item.id, 'unlink')}
              disabled={actionLoading === item.id}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" title="Desvincular e vincular outro"
            >
              <XCircle className="w-4 h-4 text-red-500" />
            </button>
            <button
              onClick={() => handleAction(item.id, 'reopen')}
              disabled={actionLoading === item.id}
              className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20" title="Reabrir"
            >
              <RefreshCw className="w-4 h-4 text-amber-600" />
            </button>
          </>
        )}
        {item.status === 'IGNORED' && (
          <button
            onClick={() => handleAction(item.id, 'reopen')}
            disabled={actionLoading === item.id}
            className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20" title="Reabrir"
          >
            <RefreshCw className="w-4 h-4 text-amber-600" />
          </button>
        )}
      </div>
    );
  };

  // Render a single reconciliation row
  const renderRow = (item: any) => {
    const st = STATUS_MAP[item.status] || STATUS_MAP.PENDING;
    const Icon = st.icon;
    const isSelected = selected.has(item.id);
    const bankAmt = item.bankTransaction?.amount || 0;
    const intAmt = item.internal?.amount || 0;
    const hasDivergence = item.status === 'DIVERGENT' && item.internal && Math.abs(bankAmt - intAmt) > 0.01;
    return (
      <tr key={item.id} className={`border-b hover:bg-muted/20 transition-colors ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
        <td className="py-3 px-3 text-center">
          <button onClick={() => toggleSelect(item.id)} className="p-0.5">
            {isSelected ? <SquareCheck className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-muted-foreground" />}
          </button>
        </td>
        <td className="py-3 px-4">
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>
            <Icon className="w-3 h-3" /> {st.label}
          </span>
        </td>
        <td className="py-3 px-4">
          <p className="font-medium text-foreground">{item.bankTransaction?.description}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(item.bankTransaction?.date)}
            {item.bankTransaction?.bankConnection?.bankName && ` • ${item.bankTransaction.bankConnection.bankName}`}
          </p>
        </td>
        <td className="py-3 px-4 text-right">
          <span className={item.bankTransaction?.type === 'debit' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}>
            {item.bankTransaction?.type === 'debit' ? '-' : '+'}{formatCurrency(bankAmt)}
          </span>
        </td>
        <td className="py-3 px-4">
          {item.internal ? (
            <>
              <p className="font-medium text-foreground">{item.internal.description}</p>
              <p className="text-xs text-muted-foreground">{formatDate(item.internal.date)} • {item.internalType === 'expense' ? 'Despesa' : 'Receita'}</p>
              {hasDivergence && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Δ {formatCurrency(Math.abs(bankAmt - intAmt))}</p>
              )}
            </>
          ) : (
            <span className="text-muted-foreground text-xs italic">Sem correspondência</span>
          )}
        </td>
        <td className="py-3 px-4 text-right">
          {item.internal ? (
            <span className={hasDivergence ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>{formatCurrency(intAmt)}</span>
          ) : '-'}
        </td>
        <td className="py-3 px-4 text-center">
          {item.matchScore ? (
            <span className={`text-xs font-bold ${item.matchScore >= 0.75 ? 'text-blue-600' : item.matchScore >= 0.4 ? 'text-amber-600' : 'text-red-600'}`}>
              {(item.matchScore * 100).toFixed(0)}%
            </span>
          ) : '-'}
        </td>
        <td className="py-3 px-4 text-center">{renderActions(item)}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-500" /> Conciliação Bancária
          </h1>
          <p className="text-muted-foreground mt-1">Compare lançamentos internos com extrato bancário</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <BankFilter value={bankId} onChange={setBankId} />
          <Button onClick={() => setShowImport(true)} variant="outline" size="sm">
            <Upload className="w-4 h-4 mr-1" /> Importar Extrato
          </Button>
          <Button onClick={runEngine} disabled={running} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Play className="w-4 h-4 mr-1" /> {running ? 'Processando...' : 'Conciliar'}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: s.total || 0, color: 'text-foreground' },
          { label: 'Conciliados', value: s.reconciled || 0, color: 'text-blue-600' },
          { label: 'Divergentes', value: s.divergent || 0, color: 'text-amber-600' },
          { label: 'Só no Banco', value: s.bankOnly || 0, color: 'text-blue-600' },
          { label: 'Pendentes', value: s.pending || 0, color: 'text-gray-600' },
          { label: 'Ignorados', value: s.ignored || 0, color: 'text-gray-400' },
        ].map(k => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + View Toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {['', 'RECONCILED', 'DIVERGENT', 'BANK_ONLY', 'PENDING', 'IGNORED'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === st ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {st ? STATUS_MAP[st]?.label || st : 'Todos'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('batches')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'batches' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
          >
            <Package className="w-3.5 h-3.5 inline mr-1" /> Por Lote
          </button>
          <button
            onClick={() => setViewMode('flat')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'flat' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
          >
            <ListChecks className="w-3.5 h-3.5 inline mr-1" /> Lista
          </button>
        </div>
      </div>

      {/* Batch action bar */}
      {hasSelection && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
          <ListChecks className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-medium text-blue-800 dark:text-blue-300">{selected.size} selecionado{selected.size > 1 ? 's' : ''}</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <Button size="sm" variant="outline" onClick={() => handleBatch('approve')} disabled={batchLoading} className="text-blue-700 border-blue-300 hover:bg-blue-100">
              <CheckCircle2 className="w-4 h-4 mr-1" /> Conciliar
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBatch('ignore')} disabled={batchLoading} className="text-gray-600 border-gray-300 hover:bg-gray-100">
              <EyeOff className="w-4 h-4 mr-1" /> Ignorar
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBatch('reopen')} disabled={batchLoading} className="text-amber-600 border-amber-300 hover:bg-amber-100">
              <RefreshCw className="w-4 h-4 mr-1" /> Reabrir
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-muted-foreground">Limpar</Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : !allItems.length ? (
        <Card className="shadow-sm">
          <CardContent className="text-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma conciliação encontrada</p>
            <p className="text-sm mt-1">Importe um extrato e clique em &ldquo;Conciliar&rdquo;</p>
          </CardContent>
        </Card>
      ) : viewMode === 'batches' && batches.length > 0 ? (
        /* === BATCH VIEW === */
        <div className="space-y-4">
          {batches.map((batch: any) => {
            const isExpanded = expandedBatches.has(batch.id);
            const batchStatus = getBatchStatus(batch);
            const badge = getBatchStatusBadge(batchStatus);
            const progress = batch.stats.total > 0 ? ((batch.stats.reconciled + batch.stats.ignored) / batch.stats.total) * 100 : 0;
            return (
              <Card key={batch.id} className="shadow-sm overflow-hidden">
                {/* Batch Header */}
                <button
                  onClick={() => toggleBatch(batch.id)}
                  className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Building2 className="w-4 h-4 text-blue-500" />
                        <span className="font-semibold text-foreground">{batch.bankName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
                        {batch.id !== 'sem_lote' && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Importado em {formatDate(batch.importedAt)}
                          </span>
                        )}
                      </div>
                      {batch.dateRange?.min && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Período: {formatDate(batch.dateRange.min)} a {formatDate(batch.dateRange.max)}
                        </p>
                      )}
                    </div>
                    {/* Stats pills */}
                    <div className="flex gap-2 items-center flex-shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" title="Conciliados">
                        ✓ {batch.stats.reconciled}
                      </span>
                      {batch.stats.divergent > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" title="Divergentes">
                          ⚠ {batch.stats.divergent}
                        </span>
                      )}
                      {batch.stats.bankOnly > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" title="Só no Banco">
                          ? {batch.stats.bankOnly}
                        </span>
                      )}
                      {batch.stats.pending > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" title="Pendentes">
                          ⏳ {batch.stats.pending}
                        </span>
                      )}
                      <span className="text-xs font-medium text-muted-foreground">{batch.stats.total} total</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all bg-gradient-to-r from-blue-500 to-green-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </button>

                {/* Batch Items (expanded) */}
                {isExpanded && (
                  <CardContent className="p-0 border-t">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="py-2 px-3 text-center w-10">
                              <button onClick={toggleSelectAll} className="p-0.5 rounded hover:bg-muted">
                                {selected.size === allItems.length && allItems.length > 0
                                  ? <SquareCheck className="w-4 h-4 text-blue-600" />
                                  : <Square className="w-4 h-4 text-muted-foreground" />}
                              </button>
                            </th>
                            <th className="py-2 px-4 text-left text-muted-foreground font-medium text-xs">Status</th>
                            <th className="py-2 px-4 text-left text-muted-foreground font-medium text-xs">Extrato Bancário</th>
                            <th className="py-2 px-4 text-right text-muted-foreground font-medium text-xs">Valor Banco</th>
                            <th className="py-2 px-4 text-left text-muted-foreground font-medium text-xs">Lançamento Interno</th>
                            <th className="py-2 px-4 text-right text-muted-foreground font-medium text-xs">Valor Interno</th>
                            <th className="py-2 px-4 text-center text-muted-foreground font-medium text-xs">Score</th>
                            <th className="py-2 px-4 text-center text-muted-foreground font-medium text-xs">Ações</th>
                          </tr>
                        </thead>
                        <tbody>{batch.items.map((item: any) => renderRow(item))}</tbody>
                      </table>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        /* === FLAT VIEW === */
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="py-3 px-3 text-center w-10">
                      <button onClick={toggleSelectAll} className="p-0.5 rounded hover:bg-muted">
                        {selected.size === allItems.length && allItems.length > 0
                          ? <SquareCheck className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </th>
                    <th className="py-3 px-4 text-left text-muted-foreground font-medium">Status</th>
                    <th className="py-3 px-4 text-left text-muted-foreground font-medium">Extrato Bancário</th>
                    <th className="py-3 px-4 text-right text-muted-foreground font-medium">Valor Banco</th>
                    <th className="py-3 px-4 text-left text-muted-foreground font-medium">Lançamento Interno</th>
                    <th className="py-3 px-4 text-right text-muted-foreground font-medium">Valor Interno</th>
                    <th className="py-3 px-4 text-center text-muted-foreground font-medium">Score</th>
                    <th className="py-3 px-4 text-center text-muted-foreground font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>{allItems.map((item: any) => renderRow(item))}</tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) { setImportResult(null); setImportTab('ofx'); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Importar Extrato Bancário</DialogTitle></DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 bg-muted p-1 rounded-lg mb-2">
            <button
              onClick={() => setImportTab('ofx')}
              className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${importTab === 'ofx' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              OFX / CSV
            </button>
            <button
              onClick={() => setImportTab('manual')}
              className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${importTab === 'manual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              PDF / Texto
            </button>
          </div>

          {importTab === 'ofx' ? (
            <BankImportDialog
              bankConnectionId={bankId || undefined}
              onSuccess={() => { setTimeout(() => { load(); setShowImport(false); }, 800); }}
              onClose={() => setShowImport(false)}
            />
          ) : (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-input rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                {fileLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Processando arquivo com IA...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium mb-1">Arraste ou selecione um arquivo</p>
                    <p className="text-xs text-muted-foreground mb-3">Formatos: <strong>PDF</strong>, XLS, XLSX</p>
                    <input type="file" accept=".pdf,.xls,.xlsx" onChange={handleFileUpload}
                      className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-400" />
                  </>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">ou cole manualmente</span></div>
              </div>
              <div className="bg-muted p-3 rounded-lg text-xs font-mono">
                <p className="font-bold mb-1">Formato CSV:</p>
                <p>Data;Descrição;Valor;Tipo</p>
                <p>2026-04-01;Supermercado Extra;-150.50;debit</p>
              </div>
              <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={5}
                className="w-full border rounded-lg p-3 text-sm bg-background text-foreground font-mono" placeholder="Cole CSV ou JSON aqui..." />
              {importResult && (
                <div className={`p-3 rounded-lg text-sm ${importResult.error ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                  {importResult.error ? `Erro: ${importResult.error}` : `Importado: ${importResult.imported} | Ignorado: ${importResult.skipped}`}
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setShowImport(false); setImportResult(null); }} className="flex-1">Cancelar</Button>
                <Button onClick={handleImport} disabled={!importText.trim()} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">Importar Texto</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar Lançamento Interno</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-xs font-medium text-muted-foreground mb-1">Referência do Banco</p>
                <p className="font-medium text-foreground">{editItem.bankTransaction?.description}</p>
                <p className="text-sm text-blue-600 font-medium">{formatCurrency(editItem.bankTransaction?.amount)}</p>
                <p className="text-xs text-muted-foreground">{formatDate(editItem.bankTransaction?.date)}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground">Descrição</label>
                  <Input value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Valor (R$)</label>
                  <Input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Data</label>
                  <Input type="date" value={editForm.date} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setEditItem(null)} className="flex-1">Cancelar</Button>
                <Button onClick={saveEdit} disabled={editSaving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                  {editSaving ? 'Salvando...' : 'Salvar Correção'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Detalhes da Conciliação</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Extrato Bancário</p>
                  <p className="font-medium text-foreground">{showDetail.bankTransaction?.description}</p>
                  <p className="text-sm">{formatCurrency(showDetail.bankTransaction?.amount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(showDetail.bankTransaction?.date)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Lançamento Interno</p>
                  {showDetail.internal ? (
                    <>
                      <p className="font-medium text-foreground">{showDetail.internal.description}</p>
                      <p className="text-sm">{formatCurrency(showDetail.internal.amount)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(showDetail.internal.date)}</p>
                    </>
                  ) : <p className="text-sm text-muted-foreground italic">Não encontrado</p>}
                </div>
              </div>
              {showDetail.matchScore && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Score:</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${showDetail.matchScore * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold">{(showDetail.matchScore * 100).toFixed(0)}%</span>
                </div>
              )}
              {showDetail.divergenceReason && <p className="text-sm text-amber-600">⚠️ {showDetail.divergenceReason}</p>}
              {showDetail.logs?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Histórico</p>
                  <div className="space-y-1">
                    {showDetail.logs.map((log: any, i: number) => (
                      <div key={i} className="text-xs text-muted-foreground flex justify-between">
                        <span>{log.action}: {log.previousStatus} → {log.newStatus}</span>
                        <span>{formatDate(log.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Actions for non-reconciled items */}
              {(showDetail.status === 'DIVERGENT' || showDetail.status === 'BANK_ONLY' || showDetail.status === 'PENDING') && (
                <div className="flex gap-2 pt-2 border-t flex-wrap">
                  {showDetail.status === 'BANK_ONLY' && (
                    <Button size="sm" variant="outline" onClick={() => { setShowDetail(null); openLinkDialog(showDetail); }} className="text-green-600 border-green-300 hover:bg-green-50">
                      <Link2 className="w-4 h-4 mr-1" /> Vincular
                    </Button>
                  )}
                  {showDetail.status === 'DIVERGENT' && showDetail.internal && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => { acceptBankValue(showDetail); setShowDetail(null); }} disabled={actionLoading === showDetail.id} className="text-blue-600 border-blue-300 hover:bg-blue-50">
                        <ArrowLeftRight className="w-4 h-4 mr-1" /> Aceitar Banco
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowDetail(null); openEdit(showDetail); }} className="text-amber-600">
                        <Pencil className="w-4 h-4 mr-1" /> Editar
                      </Button>
                    </>
                  )}
                  <Button size="sm" onClick={() => handleAction(showDetail.id, 'approve', { internalId: showDetail.internalId, internalType: showDetail.internalType })}
                    disabled={actionLoading === showDetail.id || !showDetail.internalId} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Conciliar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setForceItem(showDetail); setForceReason(''); setShowDetail(null); }} className="border-amber-300 text-amber-700 hover:bg-amber-50">
                    <Zap className="w-4 h-4 mr-1" /> Forçar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleAction(showDetail.id, 'ignore')} disabled={actionLoading === showDetail.id}>
                    <EyeOff className="w-4 h-4 mr-1" /> Ignorar
                  </Button>
                </div>
              )}
              {/* Actions for reconciled items — Desvincular */}
              {showDetail.status === 'RECONCILED' && (
                <div className="flex gap-2 pt-2 border-t flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => { handleAction(showDetail.id, 'unlink'); }} disabled={actionLoading === showDetail.id} className="text-red-600 border-red-300 hover:bg-red-50">
                    <XCircle className="w-4 h-4 mr-1" /> Desvincular
                  </Button>
                  <p className="text-xs text-muted-foreground self-center">Desfaz a conciliação para vincular ao lançamento correto</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Link / Create Entry Dialog */}
      <Dialog open={!!linkItem} onOpenChange={() => setLinkItem(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-green-600" />
              Vincular Lançamento
            </DialogTitle>
          </DialogHeader>
          {linkItem && (
            <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
              {/* Bank transaction reference */}
              <div className="p-3 rounded-lg bg-muted/50 border flex-shrink-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">Transação Bancária</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{linkItem.bankTransaction?.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(linkItem.bankTransaction?.date)}</p>
                  </div>
                  <span className={`text-lg font-bold ${linkItem.bankTransaction?.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                    {linkItem.bankTransaction?.type === 'debit' ? '-' : '+'}{formatCurrency(Math.abs(linkItem.bankTransaction?.amount || 0))}
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-muted rounded-lg p-0.5 flex-shrink-0">
                <button
                  onClick={() => setLinkTab('link')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${linkTab === 'link' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                >
                  <Link2 className="w-4 h-4 inline mr-1" /> Vincular Existente
                </button>
                <button
                  onClick={() => setLinkTab('create')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${linkTab === 'create' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                >
                  <PlusCircle className="w-4 h-4 inline mr-1" /> Criar Novo
                </button>
              </div>

              {linkTab === 'link' ? (
                /* === LINK EXISTING === */
                <div className="flex-1 overflow-hidden flex flex-col">
                  {/* Search + Month Filter */}
                  <div className="flex gap-2 flex-shrink-0 mb-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={linkSearch}
                        onChange={e => handleLinkSearch(e.target.value)}
                        placeholder="Buscar por descrição..."
                        className="pl-9"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <Input
                        type="month"
                        value={linkMonth}
                        onChange={e => setLinkMonth(e.target.value)}
                        className="w-[160px]"
                      />
                      {linkMonth && (
                        <button
                          onClick={() => setLinkMonth('')}
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          title="Limpar filtro de mês"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Results */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {linkLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                      </div>
                    ) : (
                      <>
                        {/* Despesas */}
                        {linkResults.expenses.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1 sticky top-0 bg-background py-1 z-10">
                              <ArrowDownCircle className="w-3.5 h-3.5" /> Despesas ({linkResults.expenses.length})
                            </h4>
                            <div className="space-y-1">
                              {linkResults.expenses.map((exp: any) => (
                                <div key={exp.id} className={`flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 border transition-colors ${exp.isPartial ? 'border-amber-200 bg-amber-50/30 dark:bg-amber-900/10 dark:border-amber-800' : 'border-transparent hover:border-border'}`}>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground truncate">{exp.description}</p>
                                    <p className="text-xs text-muted-foreground">{formatDate(exp.date)} • {exp.category || 'Sem categoria'}</p>
                                    {exp.isPartial && (
                                      <p className="text-xs text-amber-600 mt-0.5">
                                        Parcial: {formatCurrency(exp.alreadyLinked)} já vinculado • Falta {formatCurrency(exp.remaining)}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <span className="text-red-600 font-semibold whitespace-nowrap">{formatCurrency(exp.amount)}</span>
                                    {exp.isPartial && <p className="text-[10px] text-amber-600">resta {formatCurrency(exp.remaining)}</p>}
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => submitLink(exp.id, 'expense')}
                                    disabled={linkActionLoading === exp.id}
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs px-3"
                                  >
                                    {linkActionLoading === exp.id ? '...' : 'Vincular'}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Receitas */}
                        {linkResults.incomes.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-green-600 mb-2 flex items-center gap-1 sticky top-0 bg-background py-1 z-10">
                              <ArrowUpCircle className="w-3.5 h-3.5" /> Receitas ({linkResults.incomes.length})
                            </h4>
                            <div className="space-y-1">
                              {linkResults.incomes.map((inc: any) => (
                                <div key={inc.id} className={`flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 border transition-colors ${inc.isPartial ? 'border-amber-200 bg-amber-50/30 dark:bg-amber-900/10 dark:border-amber-800' : 'border-transparent hover:border-border'}`}>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground truncate">{inc.description}</p>
                                    <p className="text-xs text-muted-foreground">{formatDate(inc.date)} • {inc.type || 'Sem tipo'}</p>
                                    {inc.isPartial && (
                                      <p className="text-xs text-amber-600 mt-0.5">
                                        Parcial: {formatCurrency(inc.alreadyLinked)} já vinculado • Falta {formatCurrency(inc.remaining)}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <span className="text-green-600 font-semibold whitespace-nowrap">{formatCurrency(inc.amount)}</span>
                                    {inc.isPartial && <p className="text-[10px] text-amber-600">resta {formatCurrency(inc.remaining)}</p>}
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => submitLink(inc.id, 'income')}
                                    disabled={linkActionLoading === inc.id}
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs px-3"
                                  >
                                    {linkActionLoading === inc.id ? '...' : 'Vincular'}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {linkResults.expenses.length === 0 && linkResults.incomes.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">Nenhum lançamento disponível para vincular</p>
                            <p className="text-xs mt-1">Use a aba &ldquo;Criar Novo&rdquo; para registrar um novo lançamento</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                /* === CREATE NEW === */
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  <div>
                    <Label className="text-sm font-medium">Tipo de Lançamento</Label>
                    <div className="flex gap-2 mt-1.5">
                      <button onClick={() => setCreateEntryForm(p => ({ ...p, type: 'expense' }))}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          createEntryForm.type === 'expense'
                            ? 'bg-red-100 text-red-700 border-2 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700'
                            : 'bg-muted text-muted-foreground border-2 border-transparent'
                        }`}>
                        <ArrowDownCircle className="w-4 h-4 inline mr-1" /> Despesa
                      </button>
                      <button onClick={() => setCreateEntryForm(p => ({ ...p, type: 'income' }))}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          createEntryForm.type === 'income'
                            ? 'bg-green-100 text-green-700 border-2 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
                            : 'bg-muted text-muted-foreground border-2 border-transparent'
                        }`}>
                        <ArrowUpCircle className="w-4 h-4 inline mr-1" /> Receita
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Descrição</Label>
                    <Input value={createEntryForm.description} onChange={e => setCreateEntryForm(p => ({ ...p, description: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Valor (R$)</Label>
                    <Input type="number" step="0.01" value={createEntryForm.amount} onChange={e => setCreateEntryForm(p => ({ ...p, amount: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Data</Label>
                    <Input type="date" value={createEntryForm.date} onChange={e => setCreateEntryForm(p => ({ ...p, date: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Categoria</Label>
                    <select value={createEntryForm.category} onChange={e => setCreateEntryForm(p => ({ ...p, category: e.target.value }))}
                      className="w-full mt-1 rounded-md border border-input p-2 text-sm bg-background text-foreground">
                      {createEntryForm.type === 'expense'
                        ? EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)
                        : INCOME_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                      }
                    </select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => setLinkItem(null)} className="flex-1">Cancelar</Button>
                    <Button onClick={submitCreateEntry}
                      disabled={createEntryLoading || !createEntryForm.description || !createEntryForm.amount || !createEntryForm.date}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                      {createEntryLoading ? 'Salvando...' : 'Lançar e Conciliar'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Force Reconciliation Dialog */}
      <Dialog open={!!forceItem} onOpenChange={() => setForceItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" /> Forçar Conciliação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <strong>Atenção:</strong> Esta ação marca o lançamento como conciliado sem correspondência interna.
              </p>
            </div>
            {forceItem && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium">{forceItem.bankTransaction?.description}</p>
                <p className="text-muted-foreground mt-1">
                  {formatCurrency(forceItem.bankTransaction?.amount)} - {forceItem.bankTransaction?.date ? formatDate(forceItem.bankTransaction.date) : ''}
                </p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">Motivo da conciliação forçada</Label>
              <textarea value={forceReason} onChange={e => setForceReason(e.target.value)}
                placeholder="Ex: Transferência entre contas, taxa bancária identificada..."
                className="w-full mt-1.5 px-3 py-2 border rounded-lg text-sm bg-background text-foreground resize-none h-20" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setForceItem(null)} className="flex-1">Cancelar</Button>
              <Button
                onClick={async () => {
                  if (!forceItem) return;
                  await handleAction(forceItem.id, 'force', { notes: forceReason || 'Conciliação forçada' });
                  setForceItem(null);
                }}
                disabled={actionLoading === forceItem?.id}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
                <Zap className="w-4 h-4 mr-1" /> Forçar Conciliação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
