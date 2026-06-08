'use client';
import { apiFetch } from '@/lib/fetch';
import { FileSpreadsheet, File as FileIcon } from 'lucide-react';
import { usePJ } from '@/lib/pj-context';
import { BankImportDialog } from '@/components/bank-import-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, Eye, FileCheck, FileText, Loader2, RefreshCw, Sparkles, TrendingDown, TrendingUp, Upload, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';


const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: 'Pendente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: RefreshCw },
  RECONCILED: { label: 'Conciliado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: Check },
  DIVERGENT: { label: 'Divergente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertTriangle },
  NOT_FOUND: { label: 'Nao Encontrado', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: XCircle },
  BANK_ONLY: { label: 'So no Banco', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: Eye },
  IGNORED: { label: 'Ignorado', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500', icon: XCircle },
};

const FILE_FORMATS = [
  { ext: 'CSV', icon: FileSpreadsheet, desc: 'Planilha separada por ; ou ,' },
  { ext: 'OFX', icon: FileIcon, desc: 'Open Financial Exchange' },
  { ext: 'TXT', icon: FileText, desc: 'Texto separado por ; ou tab' },
  { ext: 'PDF', icon: FileText, desc: 'Extrato em PDF (leitura por IA)' },
];

type ParsedEntry = { date: string; reference: string; amount: number; type: string };

export default function ConciliacaoPJ() {
  const { activeCompanyId } = usePJ();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bankText, setBankText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState<'file' | 'text' | 'ofx'>('ofx');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);
  const [parsedFilename, setParsedFilename] = useState('');
  const [parsedFormat, setParsedFormat] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [confirmedMatches, setConfirmedMatches] = useState<Record<string, string | null>>({});

  const fetchData = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const res = await apiFetch(`/api/pj/reconciliation?${params}`);
      if (res.ok) setItems(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [activeCompanyId, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
        const data = await res.json();
        setSuggestions(data.suggestions);
        // Pre-select best match if confidence >= 70%
        const init: Record<string, string | null> = {};
        for (const s of data.suggestions) {
          const best = s.matches[0];
          init[s.bankEntry.reference + s.bankEntry.date] = best?.confidence >= 70 ? best.bill.id : null;
        }
        setConfirmedMatches(init);
        setShowImport(false);
      } else {
        toast({ title: 'Erro ao buscar sugestões', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro de conexão', variant: 'destructive' });
    } finally {
      setSuggestLoading(false);
    }
  };

  const parseBankEntries = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    return lines.map(line => {
      const parts = line.split(';').map(p => p.trim());
      return {
        date: parts[0] || new Date().toISOString().split('T')[0],
        reference: parts[1] || 'SEM_REF',
        amount: parseFloat(parts[2]?.replace(/\./g, '').replace(',', '.') || '0'),
        type: parseFloat(parts[2]?.replace(/\./g, '').replace(',', '.') || '0') < 0 ? 'DEBIT' : 'CREDIT',
      };
    }).filter(e => e.amount !== 0);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setParsedEntries([]);
    setParsedFilename('');
    setParsedFormat('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch('/api/pj/reconciliation/parse-file', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { toast({ title: 'Erro ao processar arquivo', description: data.error, variant: 'destructive' }); return; }
      if (data.entries.length === 0) { toast({ title: 'Nenhuma transacao encontrada no arquivo', variant: 'destructive' }); return; }
      setParsedEntries(data.entries);
      setParsedFilename(data.filename);
      setParsedFormat(data.format);
      toast({ title: `${data.count} transacoes encontradas em ${data.filename}` });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar arquivo', description: err?.message, variant: 'destructive' });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReconcileEntries = async (entries: ParsedEntry[]) => {
    if (entries.length === 0) return;
    setProcessing(true);
    try {
      const res = await apiFetch('/api/pj/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto-match', bankEntries: entries }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: `Conciliacao concluida: ${data.summary.reconciled} conciliados, ${data.summary.divergent} divergentes` });
        setBankText('');
        setParsedEntries([]);
        setShowImport(false);
        fetchData();
      } else {
        const err = await res.json();
        toast({ title: 'Erro', description: err.error, variant: 'destructive' });
      }
    } catch { toast({ title: 'Erro na conciliacao', variant: 'destructive' }); }
    setProcessing(false);
  };

  const handleAutoMatchText = async () => {
    if (!bankText.trim()) { toast({ title: 'Cole os dados bancarios', variant: 'destructive' }); return; }
    const bankEntries = parseBankEntries(bankText);
    if (bankEntries.length === 0) { toast({ title: 'Nenhuma entrada valida', variant: 'destructive' }); return; }
    await handleReconcileEntries(bankEntries);
  };

  const handleManualAction = async (id: string, newStatus: string) => {
    const res = await apiFetch('/api/pj/reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'manual-update', reconciliationId: id, newStatus }),
    });
    if (res.ok) { toast({ title: 'Status atualizado' }); fetchData(); }
    else { toast({ title: 'Erro ao atualizar', variant: 'destructive' }); }
  };

  const summary = {
    total: items.length,
    reconciled: items.filter(i => i.status === 'RECONCILED').length,
    divergent: items.filter(i => i.status === 'DIVERGENT').length,
    pending: items.filter(i => i.status === 'PENDING').length,
    bankOnly: items.filter(i => i.status === 'BANK_ONLY').length,
  };

  if (!activeCompanyId) return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileCheck className="w-6 h-6 text-primary" />Conciliacao Bancaria PJ</h1>
          <p className="text-muted-foreground">Concilie automaticamente extratos bancarios com suas contas</p>
        </div>
        <Button onClick={() => { setShowImport(!showImport); setParsedEntries([]); }}><Upload className="w-4 h-4 mr-2" />Importar Extrato</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold">{summary.total}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-green-600">{summary.reconciled}</p><p className="text-xs text-muted-foreground">Conciliados</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-red-600">{summary.divergent}</p><p className="text-xs text-muted-foreground">Divergentes</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-amber-600">{summary.pending}</p><p className="text-xs text-muted-foreground">Pendentes</p></CardContent></Card>
      </div>

      {/* Import Section */}
      {showImport && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">Importar Extrato Bancario</CardTitle>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setImportTab('ofx')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${importTab === 'ofx' ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                <FileSpreadsheet className="w-4 h-4 inline mr-1.5" />OFX / CSV
              </button>
              <button
                onClick={() => setImportTab('file')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${importTab === 'file' ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                <Upload className="w-4 h-4 inline mr-1.5" />PDF / Excel
              </button>
              <button
                onClick={() => setImportTab('text')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${importTab === 'text' ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                <FileText className="w-4 h-4 inline mr-1.5" />Colar Texto
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {importTab === 'ofx' ? (
              <BankImportDialog
                onSuccess={() => { setTimeout(() => { fetchData(); setShowImport(false); }, 800); }}
                onClose={() => setShowImport(false)}
              />
            ) : importTab === 'file' ? (
              <>
                {/* File format info */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {FILE_FORMATS.map(f => (
                    <div key={f.ext} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/50">
                      <f.icon className="w-5 h-5 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">.{f.ext}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upload area */}
                <div
                  className="relative border-2 border-dashed border-primary/30 rounded-xl p-8 text-center hover:border-primary/60 transition-colors cursor-pointer bg-primary/5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.ofx,.ofc,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  {uploadingFile ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      <p className="text-sm font-medium">Processando arquivo...</p>
                      <p className="text-xs text-muted-foreground">PDFs podem levar alguns segundos para leitura por IA</p>
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

                {/* Parsed entries preview */}
                {parsedEntries.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <p className="text-sm font-semibold">{parsedEntries.length} transacoes encontradas</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{parsedFormat} - {parsedFilename}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setParsedEntries([])}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="max-h-48 overflow-y-auto border rounded-lg">
                      <table className="w-full text-xs">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left">Data</th>
                            <th className="px-3 py-2 text-left">Referencia</th>
                            <th className="px-3 py-2 text-right">Valor</th>
                            <th className="px-3 py-2 text-center">Tipo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedEntries.slice(0, 50).map((e, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-1.5">{e.date}</td>
                              <td className="px-3 py-1.5 truncate max-w-[200px]">{e.reference}</td>
                              <td className={`px-3 py-1.5 text-right font-medium ${e.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(e.amount)}</td>
                              <td className="px-3 py-1.5 text-center">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${e.type === 'DEBIT' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                  {e.type === 'DEBIT' ? 'Debito' : 'Credito'}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {parsedEntries.length > 50 && (
                            <tr className="border-t"><td colSpan={4} className="px-3 py-2 text-center text-muted-foreground">... e mais {parsedEntries.length - 50} transacoes</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-3">
                      <div className="flex gap-4 text-sm">
                        <span className="text-green-600 font-medium">Creditos: {fmt(parsedEntries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0))}</span>
                        <span className="text-red-600 font-medium">Debitos: {fmt(parsedEntries.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0))}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setShowImport(false); setParsedEntries([]); }}>Cancelar</Button>
                  <Button variant="outline" onClick={() => handleSuggest(parsedEntries)} disabled={suggestLoading || parsedEntries.length === 0}>
                    {suggestLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando...</> : <><Sparkles className="w-4 h-4 mr-2" />Analisar com IA</>}
                  </Button>
                  <Button onClick={() => handleReconcileEntries(parsedEntries)} disabled={processing || parsedEntries.length === 0}>
                    {processing ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Processando...</> : <><RefreshCw className="w-4 h-4 mr-2" />Conciliar Direto</>}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>Cole os dados do extrato (formato: data;referencia;valor)</Label>
                  <p className="text-xs text-muted-foreground mb-2">Exemplo: 2025-01-15;PIX-FORNECEDOR-123;-1500,00</p>
                  <textarea
                    value={bankText}
                    onChange={e => setBankText(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-background font-mono"
                    placeholder={"2025-01-15;PIX-123;-1500,00\n2025-01-16;TED-456;5000,00"}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowImport(false)}>Cancelar</Button>
                  <Button
                    variant="outline"
                    onClick={() => { const entries = parseBankEntries(bankText); if (entries.length) handleSuggest(entries); }}
                    disabled={suggestLoading || !bankText.trim()}
                  >
                    {suggestLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando...</> : <><Sparkles className="w-4 h-4 mr-2" />Analisar com IA</>}
                  </Button>
                  <Button onClick={handleAutoMatchText} disabled={processing}>
                    {processing ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Processando...</> : <><RefreshCw className="w-4 h-4 mr-2" />Conciliar Direto</>}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Suggestions Panel */}
      {suggestions && suggestions.length > 0 && (
        <Card className="border-blue-200 dark:border-blue-900">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                Sugestões de Conciliação por IA
                <span className="text-xs font-normal text-muted-foreground">— revise e confirme cada correspondência</span>
              </span>
              <button onClick={() => setSuggestions(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {suggestions.map((s: any, i: number) => {
              const key = s.bankEntry.reference + s.bankEntry.date;
              const selectedId = confirmedMatches[key];
              return (
                <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                  {/* Bank entry */}
                  <div className="flex items-center gap-3 text-sm">
                    {s.bankEntry.type === 'DEBIT'
                      ? <TrendingDown className="w-4 h-4 text-red-500 flex-shrink-0" />
                      : <TrendingUp className="w-4 h-4 text-green-500 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{s.bankEntry.reference}</span>
                      <span className="text-xs text-muted-foreground">{s.bankEntry.date} • {fmt(Math.abs(s.bankEntry.amount))}</span>
                    </div>
                    {s.matches.length === 0 && (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800">Sem correspondência</span>
                    )}
                  </div>

                  {/* Match options */}
                  {s.matches.length > 0 && (
                    <div className="space-y-2 pl-7">
                      {s.matches.map((m: any) => {
                        const isSelected = selectedId === m.bill.id;
                        const confColor = m.confidence >= 80 ? 'text-green-600' : m.confidence >= 50 ? 'text-amber-600' : 'text-red-500';
                        return (
                          <label
                            key={m.bill.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              isSelected
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:bg-muted/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`match-${key}`}
                              value={m.bill.id}
                              checked={isSelected}
                              onChange={() => setConfirmedMatches(prev => ({ ...prev, [key]: m.bill.id }))}
                              className="accent-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{m.bill.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {fmt(m.bill.amount)} • vence {m.bill.dueDate}
                                {m.bill.category && ` • ${m.bill.category}`}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">Correspondência: {m.reason}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className={`text-sm font-bold ${confColor}`}>{m.confidence}%</p>
                              <p className="text-[10px] text-muted-foreground">confiança</p>
                            </div>
                          </label>
                        );
                      })}
                      <label
                        className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                          selectedId === null ? 'border-gray-400 bg-gray-50 dark:bg-gray-900' : 'border-dashed border-border hover:bg-muted/20'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`match-${key}`}
                          value=""
                          checked={selectedId === null}
                          onChange={() => setConfirmedMatches(prev => ({ ...prev, [key]: null }))}
                          className="accent-primary"
                        />
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
                  // Build confirmed entries only (where selectedId is not null)
                  const confirmedEntries = suggestions
                    .filter(s => confirmedMatches[s.bankEntry.reference + s.bankEntry.date] !== null)
                    .map(s => s.bankEntry);
                  if (!confirmedEntries.length) { toast({ title: 'Nenhuma transação confirmada' }); return; }
                  setSuggestions(null);
                  await handleReconcileEntries(confirmedEntries);
                }}
                disabled={processing}
              >
                {processing
                  ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Processando...</>
                  : <><Check className="w-4 h-4 mr-2" />Confirmar {Object.values(confirmedMatches).filter(v => v !== null).length} correspondência(s)</>
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Status</Label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                <option value="">Todos</option>
                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma conciliação encontrada. Importe um extrato para começar.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => {
            const st = STATUS_MAP[item.status] || STATUS_MAP.PENDING;
            const StIcon = st.icon;
            const isExpanded = expandedId === item.id;
            return (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <StIcon className="w-5 h-5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.bankReference || 'Sem referência'}</p>
                        <p className="text-xs text-muted-foreground">{item.type === 'PAYABLE' ? 'Conta a Pagar' : 'Conta a Receber'} • {item.bankDate ? new Date(item.bankDate).toLocaleDateString('pt-BR') : '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold">{item.bankAmount ? fmt(Number(item.bankAmount)) : '-'}</p>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${st.color}`}>{st.label}</span>
                      {/* Manual Actions */}
                      {['DIVERGENT', 'PENDING', 'BANK_ONLY', 'NOT_FOUND'].includes(item.status) && (
                        <div className="flex gap-1">
                          <button onClick={() => handleManualAction(item.id, 'RECONCILED')} title="Conciliar manualmente" className="p-1.5 rounded-lg hover:bg-green-100 text-green-600"><Check className="w-4 h-4" /></button>
                          <button onClick={() => handleManualAction(item.id, 'IGNORED')} title="Ignorar" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><XCircle className="w-4 h-4" /></button>
                        </div>
                      )}
                      <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="p-1.5 rounded-lg hover:bg-muted">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {item.divergenceNote && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">⚠ {item.divergenceNote}</p>}
                  {isExpanded && item.logs?.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Histórico</p>
                      {item.logs.map((log: any) => (
                        <div key={log.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{new Date(log.createdAt).toLocaleString('pt-BR')}</span>
                          <span className="font-medium">{log.action}</span>
                          <span>{log.previousStatus} → {log.newStatus}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
