'use client';
import { apiFetch } from '@/lib/fetch';
import { formatDate } from '@/lib/format';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import {
  AlertTriangle, Calendar, CheckCircle2, ChevronDown, ChevronRight, Eye, EyeOff,
  FileText, Link, Loader2, Package, PlusCircle, RefreshCw, Sparkles, Square, SquareCheck, Trash2, Upload,
  X, XCircle, Zap, Check, ListChecks, Building2, TrendingDown, TrendingUp,
} from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  RECONCILED: { label: 'Conciliado', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: CheckCircle2 },
  DIVERGENT: { label: 'Divergente', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertTriangle },
  SUGGESTED: { label: 'Sugestão', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400', icon: FileText },
  BANK_ONLY: { label: 'Só no Banco', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: FileText },
  PENDING: { label: 'Pendente', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', icon: RefreshCw },
  IGNORED: { label: 'Ignorado', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500', icon: EyeOff },
  NOT_FOUND: { label: 'Não Encontrado', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

type ParsedEntry = { date: string; reference: string; amount: number; type: string };

export default function ConciliacaoPJ() {
  const { activeCompanyId } = usePJ();
  const formatCurrency = useFormatCurrency();

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [running, setRunning] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState<'file' | 'text'>('file');
  const [showDetail, setShowDetail] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [forceItem, setForceItem] = useState<any>(null);
  const [forceReason, setForceReason] = useState('');
  const [forceUpdateAmount, setForceUpdateAmount] = useState(false);
  const [vinculoItem, setVinculoItem] = useState<any>(null);
  const [vinculoCandidates, setVinculoCandidates] = useState<any[]>([]);
  const [vinculoLoading, setVinculoLoading] = useState(false);
  const [vinculoSearch, setVinculoSearch] = useState('');
  const [vinculoDateStart, setVinculoDateStart] = useState('');
  const [vinculoDateEnd, setVinculoDateEnd] = useState('');
  const [lancamentoItem, setLancamentoItem] = useState<any>(null);
  const [lancamentoDesc, setLancamentoDesc] = useState('');
  const [lancamentoAmount, setLancamentoAmount] = useState('');
  const [lancamentoDate, setLancamentoDate] = useState('');
  const [lancamentoLoading, setLancamentoLoading] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'batches' | 'flat'>('batches');

  // Import states
  const [uploadingFile, setUploadingFile] = useState(false);
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);
  const [parsedFilename, setParsedFilename] = useState('');
  const [parsedFormat, setParsedFormat] = useState('');
  const [bankText, setBankText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [confirmedMatches, setConfirmedMatches] = useState<Record<string, string | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bankConnections, setBankConnections] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!activeCompanyId) return;
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    const res = await apiFetch(`/api/pj/reconciliation?${params}`).then(r => r.json());
    setData(res);
    if (!silent) setLoading(false);
    setSelected(new Set());
  }, [activeCompanyId, statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!activeCompanyId) return;
    apiFetch('/api/pj/extrato')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.bankAccounts)) setBankConnections(d.bankAccounts);
      })
      .catch(() => {});
  }, [activeCompanyId]);

  const runEngine = async () => {
    setRunning(true);
    await apiFetch('/api/pj/reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rerun-match' }),
    });
    await load();
    setRunning(false);
  };

  const handleAction = async (reconId: string, action: string, extra?: any) => {
    setActionLoading(reconId);
    await apiFetch('/api/pj/reconciliation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reconciliationId: reconId, action, ...extra }),
    });
    await load(true);
    setActionLoading('');
    setShowDetail(null);
  };

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
    await apiFetch('/api/pj/reconciliation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'batch', ids: Array.from(selected), batchAction }),
    });
    setBatchLoading(false);
    await load(true);
  };

  const toggleBatch = (batchId: string) => {
    setExpandedBatches(prev => { const next = new Set(prev); if (next.has(batchId)) next.delete(batchId); else next.add(batchId); return next; });
  };

  const handleDeleteBatch = async (batch: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Excluir este lote de importação? Esta ação não pode ser desfeita.')) return;
    const params = batch.importBatchId
      ? `importBatchId=${encodeURIComponent(batch.importBatchId)}`
      : `createdAtMinute=${encodeURIComponent(batch.importedAt)}`;
    await apiFetch(`/api/pj/reconciliation?${params}`, { method: 'DELETE' });
    await load(true);
  };

  const handleOpenVincular = async (item: any) => {
    setVinculoItem(item);
    setVinculoSearch('');
    setVinculoDateStart('');
    setVinculoDateEnd('');
    setVinculoLoading(true);
    setVinculoCandidates([]);
    const res = await apiFetch('/api/pj/reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fetch-candidates', type: item.type }),
    });
    const d = await res.json();
    setVinculoCandidates(d.candidates || []);
    setVinculoLoading(false);
  };

  const handleVincular = async (accountId: string) => {
    if (!vinculoItem) return;
    setActionLoading(vinculoItem.id);
    await apiFetch('/api/pj/reconciliation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'link', reconciliationId: vinculoItem.id, accountId }),
    });
    setVinculoItem(null);
    setActionLoading('');
    await load(true);
  };

  const handleLancar = async () => {
    if (!lancamentoItem || !lancamentoDesc || !lancamentoAmount || !lancamentoDate) return;
    setLancamentoLoading(true);
    await apiFetch('/api/pj/reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-and-link', reconciliationId: lancamentoItem.id, description: lancamentoDesc, amount: lancamentoAmount, dueDate: lancamentoDate }),
    });
    setLancamentoItem(null);
    setLancamentoLoading(false);
    await load(true);
  };

  // Import handlers
  const parseBankEntries = (text: string): ParsedEntry[] => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    return lines.map(line => {
      const parts = line.split(';').map(p => p.trim());
      const amt = parseFloat(parts[2]?.replace(/\./g, '').replace(',', '.') || '0');
      return { date: parts[0] || new Date().toISOString().split('T')[0], reference: parts[1] || 'SEM_REF', amount: amt, type: amt < 0 ? 'DEBIT' : 'CREDIT' };
    }).filter(e => e.amount !== 0);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setParsedEntries([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch('/api/pj/reconciliation/parse-file', { method: 'POST', body: formData });
      const d = await res.json();
      if (!res.ok) { setImportResult({ error: d.error }); return; }
      if (d.entries.length === 0) { setImportResult({ error: 'Nenhuma transação encontrada no arquivo.' }); return; }
      setParsedEntries(d.entries);
      setParsedFilename(d.filename);
      setParsedFormat(d.format);
    } catch (err: any) {
      setImportResult({ error: err?.message });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReconcileEntries = async (entries: ParsedEntry[]) => {
    if (!entries.length) return;
    setProcessing(true);
    const selBank = bankConnections.find(b => b.id === selectedBankId);
    const bankName = selBank
      ? `${selBank.bankName} CC ${selBank.accountNumber}`
      : (parsedFilename
          ? (parsedFilename.toLowerCase().includes('itau') || parsedFilename.toLowerCase().includes('itaú') ? 'Itaú' :
             parsedFilename.toLowerCase().includes('inter') ? 'Inter' : parsedFilename)
          : 'Extrato PJ');
    try {
      const res = await apiFetch('/api/pj/reconciliation/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries,
          bankConnectionId: selectedBankId || null,
          bankName,
          fileName: parsedFilename || null,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setImportResult({
          imported: d.summary.imported,
          reconciled: d.summary.reconciled,
          divergent: d.summary.suggested,
          bankOnly: d.summary.bankOnly,
          skipped: d.summary.skippedDuplicates,
          batchId: d.batchId,
        });
        setBankText(''); setParsedEntries([]);
        setTimeout(() => { setShowImport(false); setImportResult(null); load(); }, 2000);
      } else {
        setImportResult({ error: d.error });
      }
    } catch (err: any) {
      setImportResult({ error: err?.message });
    }
    setProcessing(false);
  };

  const handleSuggest = async (entries: ParsedEntry[]) => {
    if (!entries.length) return;
    setSuggestLoading(true);
    setSuggestions(null);
    try {
      const res = await apiFetch('/api/pj/reconciliation/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankEntries: entries }),
      });
      if (res.ok) {
        const d = await res.json();
        setSuggestions(d.suggestions);
        const init: Record<string, string | null> = {};
        for (const s of d.suggestions) {
          const best = s.matches[0];
          init[s.bankEntry.reference + s.bankEntry.date] = best?.confidence >= 70 ? best.bill.id : null;
        }
        setConfirmedMatches(init);
        setShowImport(false);
      }
    } catch { /* silent */ }
    setSuggestLoading(false);
  };

  const getBatchStatus = (batch: any) => {
    if (batch.stats.total === batch.stats.reconciled + batch.stats.ignored) return 'concluido';
    if (batch.stats.pending > 0 || batch.stats.bankOnly > 0 || batch.stats.divergent > 0 || batch.stats.suggested > 0) return 'pendente';
    return 'em_andamento';
  };
  const getBatchStatusBadge = (status: string) => {
    if (status === 'concluido') return { label: 'Concluído', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    if (status === 'pendente') return { label: 'Pendente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
    return { label: 'Em Andamento', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
  };

  const renderActions = (item: any) => {
    return (
      <div className="flex gap-1 justify-center flex-wrap">
        <button onClick={() => setShowDetail(item)} className="p-1.5 rounded-lg hover:bg-muted" title="Detalhes">
          <Eye className="w-4 h-4 text-muted-foreground" />
        </button>
        {(item.status === 'DIVERGENT' || item.status === 'BANK_ONLY' || item.status === 'PENDING' || item.status === 'NOT_FOUND') && (
          <button
            onClick={() => handleOpenVincular(item)}
            disabled={actionLoading === item.id}
            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Vincular manualmente"
          >
            <Link className="w-4 h-4 text-blue-500" />
          </button>
        )}
        {(item.status === 'DIVERGENT' || item.status === 'BANK_ONLY' || item.status === 'PENDING' || item.status === 'NOT_FOUND') && (
          <>
            <button
              onClick={() => handleAction(item.id, 'approve')}
              disabled={actionLoading === item.id}
              className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Conciliar"
            >
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            </button>
            <button
              onClick={() => { setForceItem(item); setForceReason(''); setForceUpdateAmount(false); }}
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
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" title="Reabrir"
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

  const renderSideBySide = (item: any) => {
    const isDebit = item.type === 'PAYABLE';
    const bankAmt = item.bankAmount || 0;
    const intAmt = item.account?.amount || 0;
    const hasDiff = item.status === 'DIVERGENT' && Math.abs(bankAmt - intAmt) > 0.01;
    const isReconciled = item.status === 'RECONCILED';
    const isDivergent = item.status === 'DIVERGENT';

    return (
      <div key={item.id} className="grid grid-cols-[20px_1fr_56px_1fr] border-b last:border-0 hover:bg-muted/10 transition-colors text-sm">
        {/* Checkbox */}
        <div className="flex items-center justify-center pl-1 pt-3">
          <button onClick={() => toggleSelect(item.id)} className="p-0.5">
            {selected.has(item.id) ? <SquareCheck className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
        </div>
        {/* Left: bank entry */}
        <div className="p-3 pr-1 min-w-0">
          <p className="font-medium text-foreground truncate leading-snug">{item.bankReference || 'Sem referência'}</p>
          <p className={`text-base font-bold mt-0.5 ${isDebit ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
            {isDebit ? '-' : '+'}{formatCurrency(bankAmt)}
          </p>
        </div>

        {/* Middle: status + actions */}
        <div className="flex flex-col items-center justify-center gap-1 py-2">
          <div
            title={isDivergent ? (item.divergenceNote || 'Divergência detectada') : undefined}
            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 cursor-default ${
              isReconciled ? 'bg-green-100 dark:bg-green-900/30' :
              isDivergent  ? 'bg-amber-100 dark:bg-amber-900/30' :
                             'bg-muted'
            }`}>
            {isReconciled ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> :
             isDivergent  ? <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> :
                            <ListChecks className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
          {(item.status === 'DIVERGENT' || item.status === 'BANK_ONLY' || item.status === 'PENDING' || item.status === 'NOT_FOUND') && (
            <div className="flex flex-col gap-0.5">
              <button onClick={() => handleAction(item.id, 'approve')} disabled={actionLoading === item.id} className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/20" title="Conciliar">
                <CheckCircle2 className="w-3 h-3 text-blue-600" />
              </button>
              <button onClick={() => { setForceItem(item); setForceReason(''); setForceUpdateAmount(false); }} disabled={actionLoading === item.id} className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/20" title="Forçar">
                <Zap className="w-3 h-3 text-amber-500" />
              </button>
              <button onClick={() => handleAction(item.id, 'ignore')} disabled={actionLoading === item.id} className="p-0.5 rounded hover:bg-muted" title="Ignorar">
                <EyeOff className="w-3 h-3 text-gray-400" />
              </button>
            </div>
          )}
          {isReconciled && (
            <button onClick={() => handleAction(item.id, 'unlink')} disabled={actionLoading === item.id} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20" title="Desfazer">
              <XCircle className="w-3 h-3 text-red-500" />
            </button>
          )}
          {item.status === 'IGNORED' && (
            <button onClick={() => handleAction(item.id, 'reopen')} disabled={actionLoading === item.id} className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/20" title="Reabrir">
              <RefreshCw className="w-3 h-3 text-amber-600" />
            </button>
          )}
          <button onClick={() => setShowDetail(item)} className="p-0.5 rounded hover:bg-muted" title="Detalhes">
            <Eye className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>

        {/* Right: system entry */}
        <div className="p-3 pl-1 min-w-0">
          {item.account ? (
            <>
              <p className="font-medium text-foreground truncate leading-snug">
                {item.account.party || item.account.description}
              </p>
              {item.account.party && (
                <p className="text-xs text-muted-foreground truncate">{item.account.description}</p>
              )}
              <p className={`text-base font-bold mt-0.5 ${hasDiff ? 'text-amber-600 dark:text-amber-400' : isDebit ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                {formatCurrency(intAmt)}
                {hasDiff && <span className="text-xs font-normal ml-1.5">Δ {formatCurrency(Math.abs(bankAmt - intAmt))}</span>}
              </p>
              {isDivergent && (
                <button
                  onClick={() => handleOpenVincular(item)}
                  className="mt-1 self-start flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 transition-colors"
                >
                  <Link className="w-3 h-3" /> Re-vincular
                </button>
              )}
              {(item.status === 'DIVERGENT' || item.status === 'PENDING' || item.status === 'SUGGESTED') && (
                <button
                  onClick={() => handleAction(item.id, 'clear-match')}
                  title="Remover vínculo automático"
                  className="mt-0.5 flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-red-50 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Remover
                </button>
              )}
            </>
          ) : item.status === 'IGNORED' ? (
            <div className="flex items-center h-full text-xs text-muted-foreground italic">Ignorado</div>
          ) : (
            <div className="flex flex-col justify-center gap-1.5 py-1">
              <span className="text-xs text-muted-foreground italic">Sem correspondência</span>
              <button
                onClick={() => handleOpenVincular(item)}
                className="self-start flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 transition-colors"
              >
                <Link className="w-3 h-3" /> Vincular
              </button>
              <button
                onClick={() => {
                  setLancamentoItem(item);
                  setLancamentoDesc(item.bankReference || '');
                  setLancamentoAmount(String(Math.abs(item.bankAmount || 0)));
                  setLancamentoDate(item.bankDate ? new Date(item.bankDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
                }}
                className="self-start flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 transition-colors"
              >
                <PlusCircle className="w-3 h-3" /> Lançar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRow = (item: any) => {
    const st = STATUS_MAP[item.status] || STATUS_MAP.PENDING;
    const Icon = st.icon;
    const isSelected = selected.has(item.id);
    const bankAmt = item.bankAmount || 0;
    const intAmt = item.account?.amount || 0;
    const isDebit = item.type === 'PAYABLE';
    const hasDivergence = item.status === 'DIVERGENT' && item.account && Math.abs(bankAmt - intAmt) > 0.01;
    return (
      <tr key={item.id} className={`border-b hover:bg-muted/20 transition-colors ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
        <td className="py-3 px-3 text-center">
          <button onClick={() => toggleSelect(item.id)} className="p-0.5">
            {isSelected ? <SquareCheck className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-muted-foreground" />}
          </button>
        </td>
        <td className="py-3 px-4">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${st.color}`}
            title={item.status === 'DIVERGENT' && item.divergenceNote ? item.divergenceNote : undefined}
          >
            <Icon className="w-3 h-3" /> {st.label}
          </span>
        </td>
        <td className="py-3 px-4">
          <p className="font-medium text-foreground">{item.bankReference || 'Sem referência'}</p>
          <p className="text-xs text-muted-foreground">
            {item.bankDate ? formatDate(item.bankDate) : '-'}
            {' • '}{isDebit ? 'Conta a Pagar' : 'Conta a Receber'}
          </p>
        </td>
        <td className="py-3 px-4 text-right">
          <span className={isDebit ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}>
            {isDebit ? '-' : '+'}{formatCurrency(bankAmt)}
          </span>
        </td>
        <td className="py-3 px-4">
          {item.account ? (
            <>
              <p className="font-medium text-foreground">{item.account.description}</p>
              <p className="text-xs text-muted-foreground">
                {item.account.dueDate ? formatDate(item.account.dueDate) : '-'}
                {item.account.party ? ` • ${item.account.party}` : ''}
              </p>
              {hasDivergence && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Δ {formatCurrency(Math.abs(bankAmt - intAmt))}</p>
              )}
            </>
          ) : (
            <span className="text-muted-foreground text-xs italic">Sem correspondência</span>
          )}
        </td>
        <td className="py-3 px-4 text-right">
          {item.account ? (
            <span className={hasDivergence ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>{formatCurrency(intAmt)}</span>
          ) : '-'}
        </td>
        <td className="py-3 px-4 text-center">{renderActions(item)}</td>
      </tr>
    );
  };

  const s = data?.summary || {};
  const allItems = data?.items || [];
  const batches = data?.batches || [];
  const hasSelection = selected.size > 0;

  if (!activeCompanyId) {
    return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-500" /> Conciliação Bancária
          </h1>
          <p className="text-muted-foreground mt-1">Compare lançamentos internos com extrato bancário</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Todos os tipos</option>
              <option value="PAYABLE">Contas a Pagar</option>
              <option value="RECEIVABLE">Contas a Receber</option>
            </select>
          </div>
          <Button onClick={() => { setShowImport(true); setParsedEntries([]); setImportResult(null); }} variant="outline" size="sm">
            <Upload className="w-4 h-4 mr-1" /> Importar Extrato
          </Button>
          <Button onClick={runEngine} disabled={running} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <RefreshCw className={`w-4 h-4 mr-1 ${running ? 'animate-spin' : ''}`} /> {running ? 'Processando...' : 'Conciliar'}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: s.total || 0, color: 'text-foreground' },
          { label: 'Conciliados', value: s.reconciled || 0, color: 'text-blue-600' },
          { label: 'Divergentes', value: s.divergent || 0, color: 'text-amber-600' },
          { label: 'Sugestões', value: s.suggested || 0, color: 'text-indigo-600' },
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
          {['', 'RECONCILED', 'DIVERGENT', 'SUGGESTED', 'BANK_ONLY', 'PENDING', 'IGNORED'].map(st => (
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

      {/* AI Suggestions Panel */}
      {suggestions && suggestions.length > 0 && (
        <Card className="border-blue-200 dark:border-blue-900">
          <div className="p-4 border-b flex items-center justify-between">
            <span className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" /> Sugestões de Conciliação por IA
              <span className="text-xs font-normal text-muted-foreground">— revise e confirme cada correspondência</span>
            </span>
            <button onClick={() => setSuggestions(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <CardContent className="space-y-4 pt-4">
            {suggestions.map((sg: any, i: number) => {
              const key = sg.bankEntry.reference + sg.bankEntry.date;
              const selectedId = confirmedMatches[key];
              return (
                <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    {sg.bankEntry.type === 'DEBIT'
                      ? <TrendingDown className="w-4 h-4 text-red-500 flex-shrink-0" />
                      : <TrendingUp className="w-4 h-4 text-green-500 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{sg.bankEntry.reference}</span>
                      <span className="text-xs text-muted-foreground">{sg.bankEntry.date} • {formatCurrency(Math.abs(sg.bankEntry.amount))}</span>
                    </div>
                    {sg.matches.length === 0 && <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800">Sem correspondência</span>}
                  </div>
                  {sg.matches.length > 0 && (
                    <div className="space-y-2 pl-7">
                      {sg.matches.map((m: any) => {
                        const isSelected = selectedId === m.bill.id;
                        const confColor = m.confidence >= 80 ? 'text-green-600' : m.confidence >= 50 ? 'text-amber-600' : 'text-red-500';
                        return (
                          <label key={m.bill.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                            <input type="radio" name={`match-${key}`} value={m.bill.id} checked={isSelected}
                              onChange={() => setConfirmedMatches(prev => ({ ...prev, [key]: m.bill.id }))} className="accent-primary" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{m.bill.description}</p>
                              <p className="text-xs text-muted-foreground">{formatCurrency(m.bill.amount)} • vence {m.bill.dueDate}{m.bill.category && ` • ${m.bill.category}`}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Correspondência: {m.reason}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className={`text-sm font-bold ${confColor}`}>{m.confidence}%</p>
                              <p className="text-[10px] text-muted-foreground">confiança</p>
                            </div>
                          </label>
                        );
                      })}
                      <label className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors text-sm ${selectedId === null ? 'border-gray-400 bg-gray-50 dark:bg-gray-900' : 'border-dashed border-border hover:bg-muted/20'}`}>
                        <input type="radio" name={`match-${key}`} value="" checked={selectedId === null}
                          onChange={() => setConfirmedMatches(prev => ({ ...prev, [key]: null }))} className="accent-primary" />
                        <span className="text-muted-foreground text-xs">Ignorar esta transação</span>
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setSuggestions(null)}>Cancelar</Button>
              <Button
                onClick={async () => {
                  const confirmedEntries = suggestions.filter(sg => confirmedMatches[sg.bankEntry.reference + sg.bankEntry.date] !== null).map(sg => sg.bankEntry);
                  if (!confirmedEntries.length) return;
                  setSuggestions(null);
                  await handleReconcileEntries(confirmedEntries);
                }}
                disabled={processing}
              >
                {processing
                  ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Processando...</>
                  : <><Check className="w-4 h-4 mr-2" />Confirmar {Object.values(confirmedMatches).filter(v => v !== null).length} correspondência(s)</>}
              </Button>
            </div>
          </CardContent>
        </Card>
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
            <p className="text-sm mt-1">Importe um extrato para começar</p>
          </CardContent>
        </Card>
      ) : viewMode === 'batches' && batches.length > 0 ? (
        <div className="space-y-4">
          {batches.map((batch: any) => {
            const isExpanded = expandedBatches.has(batch.id);
            const batchStatus = getBatchStatus(batch);
            const badge = getBatchStatusBadge(batchStatus);
            const progress = batch.stats.total > 0 ? ((batch.stats.reconciled + batch.stats.ignored) / batch.stats.total) * 100 : 0;
            return (
              <Card key={batch.id} className="shadow-sm overflow-hidden">
                <button onClick={() => toggleBatch(batch.id)} className="w-full text-left p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Building2 className="w-4 h-4 text-blue-500" />
                        <span className="font-semibold text-foreground">{batch.bankName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Importado em {formatDate(batch.importedAt)}
                        </span>
                      </div>
                      {batch.dateRange?.min && (
                        <p className="text-xs text-muted-foreground mt-1">Período: {formatDate(batch.dateRange.min)} a {formatDate(batch.dateRange.max)}</p>
                      )}
                    </div>
                    <div className="flex gap-2 items-center flex-shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" title="Conciliados">✓ {batch.stats.reconciled}</span>
                      {batch.stats.divergent > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" title="Divergentes">⚠ {batch.stats.divergent}</span>}
                      {batch.stats.suggested > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" title="Sugestões">~ {batch.stats.suggested}</span>}
                      {batch.stats.bankOnly > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" title="Só no Banco">? {batch.stats.bankOnly}</span>}
                      {batch.stats.pending > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" title="Pendentes">⏳ {batch.stats.pending}</span>}
                      <span className="text-xs font-medium text-muted-foreground">{batch.stats.total} total</span>
                      <button
                        onClick={(e) => handleDeleteBatch(batch, e)}
                        title="Excluir lote"
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all bg-gradient-to-r from-blue-500 to-green-500" style={{ width: `${progress}%` }} />
                  </div>
                </button>
                {isExpanded && (
                  <CardContent className="p-0 border-t">
                    {/* Column headers */}
                    <div className="grid grid-cols-[20px_1fr_56px_1fr] border-b bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <div />
                      <div className="px-3 py-2">Extrato Bancário</div>
                      <div />
                      <div className="px-3 py-2">Movimentação no Sistema</div>
                    </div>
                    {/* Group by date */}
                    {Object.entries(
                      (batch.items as any[]).reduce((acc: Record<string, any[]>, item: any) => {
                        const dk = item.bankDate ? new Date(item.bankDate).toISOString().split('T')[0] : '0000-00-00';
                        if (!acc[dk]) acc[dk] = [];
                        acc[dk].push(item);
                        return acc;
                      }, {})
                    ).sort(([a], [b]) => a.localeCompare(b)).map(([dk, dayItems]) => (
                      <div key={dk}>
                        <div className="px-3 py-1.5 bg-muted/20 border-b border-t text-xs font-semibold text-muted-foreground">
                          {dk === '0000-00-00' ? 'Sem data' : new Date(dk + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </div>
                        {(dayItems as any[]).map(item => renderSideBySide(item))}
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="py-3 px-3 text-center w-10">
                      <button onClick={toggleSelectAll} className="p-0.5 rounded hover:bg-muted">
                        {selected.size === allItems.length && allItems.length > 0 ? <SquareCheck className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </th>
                    <th className="py-3 px-4 text-left text-muted-foreground font-medium">Status</th>
                    <th className="py-3 px-4 text-left text-muted-foreground font-medium">Extrato Bancário</th>
                    <th className="py-3 px-4 text-right text-muted-foreground font-medium">Valor Banco</th>
                    <th className="py-3 px-4 text-left text-muted-foreground font-medium">Conta Interna</th>
                    <th className="py-3 px-4 text-right text-muted-foreground font-medium">Valor Interno</th>
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
      <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) { setParsedEntries([]); setImportResult(null); } }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Importar Extrato Bancário</DialogTitle></DialogHeader>

          <div className="flex gap-1 bg-muted p-1 rounded-lg mb-2">
            {(['file', 'text'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setImportTab(tab)}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${importTab === tab ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {tab === 'file' ? 'OFX / CSV / PDF' : 'Colar Texto'}
              </button>
            ))}
          </div>

          {importTab === 'file' ? (
            <div className="space-y-4">
              {/* Bank selector */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Conta Bancária</label>
                <select
                  value={selectedBankId}
                  onChange={e => setSelectedBankId(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground"
                >
                  <option value="">— Selecionar banco (opcional) —</option>
                  {bankConnections.map(b => (
                    <option key={b.id} value={b.id}>{b.bankName} — CC {b.accountNumber}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">Identificação que aparece em cada lote importado.</p>
              </div>

              <div
                className="relative border-2 border-dashed border-primary/30 rounded-xl p-8 text-center hover:border-primary/60 transition-colors cursor-pointer bg-primary/5"
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".csv,.txt,.ofx,.ofc,.pdf" onChange={handleFileUpload} className="hidden" />
                {uploadingFile ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-sm font-medium">Processando arquivo...</p>
                    <p className="text-xs text-muted-foreground">PDFs podem levar alguns segundos</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-10 h-10 text-primary/60" />
                    <div>
                      <p className="text-sm font-medium">Clique para selecionar ou arraste o arquivo</p>
                      <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: CSV, OFX, TXT, PDF</p>
                    </div>
                  </div>
                )}
              </div>

              {parsedEntries.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <p className="text-sm font-semibold">{parsedEntries.length} transações encontradas</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{parsedFormat} — {parsedFilename}</span>
                    </div>
                    <button onClick={() => setParsedEntries([])} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="max-h-40 overflow-y-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Data</th>
                          <th className="px-3 py-2 text-left">Referência</th>
                          <th className="px-3 py-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedEntries.slice(0, 50).map((e, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-1.5">{e.date}</td>
                            <td className="px-3 py-1.5 truncate max-w-[200px]">{e.reference}</td>
                            <td className={`px-3 py-1.5 text-right font-medium ${e.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(e.amount)}</td>
                          </tr>
                        ))}
                        {parsedEntries.length > 50 && (
                          <tr className="border-t"><td colSpan={3} className="px-3 py-2 text-center text-muted-foreground">... e mais {parsedEntries.length - 50} transações</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importResult && (
                <div className={`p-3 rounded-lg text-sm ${importResult.error ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                  {importResult.error ? `Erro: ${importResult.error}` : `Importadas: ${importResult.imported} | Conciliadas: ${importResult.reconciled ?? importResult.imported} | Sugeridas: ${importResult.divergent} | Não encontradas: ${importResult.bankOnly}${importResult.skipped ? ` | Duplicatas ignoradas: ${importResult.skipped}` : ''}`}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowImport(false); setParsedEntries([]); }}>Cancelar</Button>
                <Button variant="outline" onClick={() => handleSuggest(parsedEntries)} disabled={suggestLoading || parsedEntries.length === 0}>
                  {suggestLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando...</> : <><Sparkles className="w-4 h-4 mr-2" />Analisar com IA</>}
                </Button>
                <Button onClick={() => handleReconcileEntries(parsedEntries)} disabled={processing || parsedEntries.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {processing ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Processando...</> : <><RefreshCw className="w-4 h-4 mr-2" />Conciliar</>}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Cole os dados do extrato (formato: data;referencia;valor)</Label>
                <p className="text-xs text-muted-foreground mb-2">Exemplo: 2025-01-15;PIX-FORNECEDOR-123;-1500,00</p>
                <textarea
                  value={bankText}
                  onChange={e => setBankText(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground font-mono"
                  placeholder={'2025-01-15;PIX-123;-1500,00\n2025-01-16;TED-456;5000,00'}
                />
              </div>
              {importResult && (
                <div className={`p-3 rounded-lg text-sm ${importResult.error ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                  {importResult.error ? `Erro: ${importResult.error}` : `Importadas: ${importResult.imported} | Conciliadas: ${importResult.reconciled ?? importResult.imported} | Sugeridas: ${importResult.divergent} | Não encontradas: ${importResult.bankOnly}${importResult.skipped ? ` | Duplicatas ignoradas: ${importResult.skipped}` : ''}`}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowImport(false)}>Cancelar</Button>
                <Button variant="outline" onClick={() => { const e = parseBankEntries(bankText); if (e.length) handleSuggest(e); }} disabled={suggestLoading || !bankText.trim()}>
                  {suggestLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando...</> : <><Sparkles className="w-4 h-4 mr-2" />Analisar com IA</>}
                </Button>
                <Button
                  onClick={async () => { const e = parseBankEntries(bankText); if (e.length) await handleReconcileEntries(e); }}
                  disabled={processing || !bankText.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {processing ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Processando...</> : <><RefreshCw className="w-4 h-4 mr-2" />Conciliar</>}
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
                  <p className="font-medium text-foreground">{showDetail.bankReference || 'Sem referência'}</p>
                  <p className="text-sm">{formatCurrency(showDetail.bankAmount || 0)}</p>
                  <p className="text-xs text-muted-foreground">{showDetail.bankDate ? formatDate(showDetail.bankDate) : '-'}</p>
                  <p className="text-xs text-muted-foreground">{showDetail.type === 'PAYABLE' ? 'Conta a Pagar' : 'Conta a Receber'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Conta Interna</p>
                  {showDetail.account ? (
                    <>
                      <p className="font-medium text-foreground">{showDetail.account.description}</p>
                      <p className="text-sm">{formatCurrency(showDetail.account.amount)}</p>
                      <p className="text-xs text-muted-foreground">{showDetail.account.dueDate ? formatDate(showDetail.account.dueDate) : '-'}</p>
                      {showDetail.account.party && <p className="text-xs text-muted-foreground">{showDetail.account.party}</p>}
                    </>
                  ) : <p className="text-sm text-muted-foreground italic">Não encontrada</p>}
                </div>
              </div>
              {showDetail.divergenceNote && <p className="text-sm text-amber-600">⚠ {showDetail.divergenceNote}</p>}
              {showDetail.notes && <p className="text-sm text-muted-foreground italic">{showDetail.notes}</p>}
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
              {(showDetail.status === 'DIVERGENT' || showDetail.status === 'BANK_ONLY' || showDetail.status === 'PENDING' || showDetail.status === 'NOT_FOUND') && (
                <div className="flex gap-2 pt-2 border-t flex-wrap">
                  <Button size="sm" onClick={() => handleAction(showDetail.id, 'approve')} disabled={actionLoading === showDetail.id} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Conciliar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setForceItem(showDetail); setForceReason(''); setForceUpdateAmount(false); setShowDetail(null); }} className="border-amber-300 text-amber-700 hover:bg-amber-50">
                    <Zap className="w-4 h-4 mr-1" /> Forçar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleAction(showDetail.id, 'ignore')} disabled={actionLoading === showDetail.id}>
                    <EyeOff className="w-4 h-4 mr-1" /> Ignorar
                  </Button>
                </div>
              )}
              {showDetail.status === 'RECONCILED' && (
                <div className="flex gap-2 pt-2 border-t flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => handleAction(showDetail.id, 'unlink')} disabled={actionLoading === showDetail.id} className="text-red-600 border-red-300 hover:bg-red-50">
                    <XCircle className="w-4 h-4 mr-1" /> Desfazer
                  </Button>
                  <p className="text-xs text-muted-foreground self-center">Reabre a conciliação para revisão</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Vincular Dialog */}
      <Dialog open={!!vinculoItem} onOpenChange={(open) => { if (!open) setVinculoItem(null); }}>
        <DialogContent className="w-[95vw] max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="w-5 h-5 text-blue-500" /> Vincular Lançamento Manualmente
            </DialogTitle>
          </DialogHeader>
          {vinculoItem && (() => {
            const filteredCandidates = vinculoCandidates.filter(c => {
              if (vinculoSearch) {
                const q = vinculoSearch.toLowerCase();
                const amtStr = String(c.amount).replace('.', ',');
                const match = (c.description || '').toLowerCase().includes(q)
                  || (c.supplierName || '').toLowerCase().includes(q)
                  || (c.customerName || '').toLowerCase().includes(q)
                  || amtStr.includes(q)
                  || formatCurrency(c.amount).includes(q);
                if (!match) return false;
              }
              if (vinculoDateStart) {
                const itemDate = new Date(c.dueDate);
                if (itemDate < new Date(vinculoDateStart)) return false;
              }
              if (vinculoDateEnd) {
                const itemDate = new Date(c.dueDate);
                if (itemDate > new Date(vinculoDateEnd + 'T23:59:59')) return false;
              }
              return true;
            });
            const isDebit = vinculoItem.type === 'PAYABLE';
            return (
              <div className="space-y-4">
                {/* Bank entry summary */}
                <div className="p-3 rounded-lg bg-muted/50 text-sm border flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-semibold text-foreground">{vinculoItem.bankReference || 'Sem referência'}</span>
                  <span className={isDebit ? 'text-red-600 font-bold' : 'text-blue-600 font-bold'}>
                    {isDebit ? '-' : '+'}{formatCurrency(vinculoItem.bankAmount || 0)}
                  </span>
                  <span className="text-muted-foreground">{vinculoItem.bankDate ? formatDate(vinculoItem.bankDate) : '-'}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{isDebit ? 'Débito — Conta a Pagar' : 'Crédito — Conta a Receber'}</span>
                  {vinculoItem.divergenceNote && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 italic">{vinculoItem.divergenceNote}</span>
                  )}
                </div>

                {/* Filters row */}
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Buscar por nome ou valor</label>
                    <input
                      value={vinculoSearch}
                      onChange={e => setVinculoSearch(e.target.value)}
                      placeholder={isDebit ? 'Fornecedor, descrição ou valor...' : 'Cliente, descrição ou valor...'}
                      className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Data início</label>
                    <input
                      type="date"
                      value={vinculoDateStart}
                      onChange={e => setVinculoDateStart(e.target.value)}
                      className="px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Data fim</label>
                    <input
                      type="date"
                      value={vinculoDateEnd}
                      onChange={e => setVinculoDateEnd(e.target.value)}
                      className="px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  {(vinculoSearch || vinculoDateStart || vinculoDateEnd) && (
                    <button
                      onClick={() => { setVinculoSearch(''); setVinculoDateStart(''); setVinculoDateEnd(''); }}
                      className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground border border-input rounded-lg hover:bg-muted transition-colors"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                {/* Results count */}
                <p className="text-xs text-muted-foreground">
                  {filteredCandidates.length} de {vinculoCandidates.length} lançamento{vinculoCandidates.length !== 1 ? 's' : ''} disponível{vinculoCandidates.length !== 1 ? 'is' : ''}
                </p>

                {/* Candidates list */}
                <div className="max-h-[420px] overflow-y-auto border rounded-lg divide-y">
                  {vinculoLoading ? (
                    <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                  ) : filteredCandidates.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      {vinculoSearch || vinculoDateStart || vinculoDateEnd ? 'Nenhum resultado para os filtros aplicados' : 'Nenhum lançamento disponível'}
                    </div>
                  ) : filteredCandidates.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {c.supplierName || c.customerName || ''}
                          {(c.supplierName || c.customerName) ? ' • ' : ''}
                          {c.dueDate ? formatDate(c.dueDate) : '-'}
                        </p>
                      </div>
                      <span className={`shrink-0 text-sm font-bold ${isDebit ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                        {formatCurrency(c.amount)}
                      </span>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${c.status === 'pago' || c.status === 'recebido' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                        {c.status}
                      </span>
                      <button
                        onClick={() => handleVincular(c.id)}
                        disabled={actionLoading === vinculoItem.id}
                        className="shrink-0 px-4 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                      >
                        Vincular
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Lançar Dialog */}
      <Dialog open={!!lancamentoItem} onOpenChange={(open) => { if (!open) setLancamentoItem(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-green-500" /> {lancamentoItem?.type === 'PAYABLE' ? 'Lançar Despesa' : 'Lançar Receita'}
            </DialogTitle>
          </DialogHeader>
          {lancamentoItem && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Criar um novo lançamento de <strong>{lancamentoItem.type === 'PAYABLE' ? 'conta a pagar' : 'conta a receber'}</strong> e vincular automaticamente a esta movimentação bancária.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Descrição</label>
                  <input value={lancamentoDesc} onChange={e => setLancamentoDesc(e.target.value)} className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-green-500 outline-none" placeholder="Descrição do lançamento" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Valor (R$)</label>
                    <input type="number" step="0.01" value={lancamentoAmount} onChange={e => setLancamentoAmount(e.target.value)} className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-green-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Data de vencimento</label>
                    <input type="date" value={lancamentoDate} onChange={e => setLancamentoDate(e.target.value)} className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-green-500 outline-none" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setLancamentoItem(null)} className="flex-1">Cancelar</Button>
                <Button onClick={handleLancar} disabled={lancamentoLoading || !lancamentoDesc || !lancamentoAmount || !lancamentoDate} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                  {lancamentoLoading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Criando...</> : <><PlusCircle className="w-4 h-4 mr-1" />Criar e Vincular</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Force Reconciliation Dialog */}
      <Dialog open={!!forceItem} onOpenChange={() => { setForceItem(null); setForceUpdateAmount(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" /> Forçar Conciliação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <strong>Atenção:</strong> Esta ação marca o lançamento como conciliado independentemente de correspondência interna.
              </p>
            </div>
            {forceItem && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium">{forceItem.bankReference || 'Sem referência'}</p>
                <p className="text-muted-foreground mt-1">
                  {formatCurrency(forceItem.bankAmount || 0)} — {forceItem.bankDate ? formatDate(forceItem.bankDate) : '-'}
                </p>
              </div>
            )}
            {forceItem && forceItem.type === 'PAYABLE' && forceItem.account && Math.abs((forceItem.bankAmount || 0) - (forceItem.account.amount || 0)) > 0.01 && (
              <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 cursor-pointer">
                <input type="checkbox" checked={forceUpdateAmount} onChange={e => setForceUpdateAmount(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Corrigir valor no sistema</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    O valor da conta a pagar será atualizado de <strong>{formatCurrency(forceItem.account.amount)}</strong> para <strong>{formatCurrency(forceItem.bankAmount || 0)}</strong> (valor do banco).
                  </p>
                </div>
              </label>
            )}
            {forceItem && forceItem.type === 'RECEIVABLE' && forceItem.account && Math.abs((forceItem.bankAmount || 0) - (forceItem.account.amount || 0)) > 0.01 && (
              <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  <strong>Receita:</strong> o valor no sistema ({formatCurrency(forceItem.account.amount)}) não será alterado.
                  A diferença de {formatCurrency(Math.abs((forceItem.bankAmount || 0) - (forceItem.account.amount || 0)))} pode ser juros ou multa do boleto.
                </p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">Motivo da conciliação forçada</Label>
              <textarea
                value={forceReason}
                onChange={e => setForceReason(e.target.value)}
                placeholder="Ex: Transferência entre contas, taxa bancária identificada..."
                className="w-full mt-1.5 px-3 py-2 border rounded-lg text-sm bg-background text-foreground resize-none h-20"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setForceItem(null)} className="flex-1">Cancelar</Button>
              <Button
                onClick={async () => {
                  if (!forceItem) return;
                  await handleAction(forceItem.id, 'force', { notes: forceReason || 'Conciliação forçada', updateAmount: forceUpdateAmount });
                  setForceItem(null);
                }}
                disabled={actionLoading === forceItem?.id}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Zap className="w-4 h-4 mr-1" /> Forçar Conciliação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
