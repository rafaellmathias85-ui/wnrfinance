'use client';
import { apiFetch } from '@/lib/fetch';
import { CheckSquare } from 'lucide-react';
import { useAiCategorize } from '@/hooks/use-ai-categorize';
import { usePJ } from '@/lib/pj-context';
import { ExportButton } from '@/components/export-button';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, ExternalLink, FileText, FileUp, Pencil, Plus, PlusCircle, QrCode, Repeat, Search, Sparkles, Square, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import { AdvancedFilters, EMPTY_FILTERS, type AdvancedFilterValues } from '@/components/pj/AdvancedFilters';
import { ImportTransactionsModal } from '@/components/pj/ImportTransactionsModal';


const statusLabels: Record<string, string> = { pendente: 'Pendente', recebido: 'Recebido', vencido: 'Vencido', cancelado: 'Cancelado' };
const statusColors: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  recebido: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  vencido: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelado: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function ContasReceber() {
  const fmt = useFormatCurrency();
  const { activeCompanyId } = usePJ();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [defaultLaunchType, setDefaultLaunchType] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [fiscalRules, setFiscalRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filter, setFilter] = useState({ status: '', search: '' });
  const [quickAdd, setQuickAdd] = useState<{ type: string; name: string } | null>(null);
  const [quickName, setQuickName] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceMonths, setRecurrenceMonths] = useState(2);
  const [bankConnections, setBankConnections] = useState<any[]>([]);
  const [bankConnectionId, setBankConnectionId] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [autoNfe, setAutoNfe] = useState(false);
  const [autoBoleto, setAutoBoleto] = useState(false);
  const [automating, setAutomating] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterValues>(EMPTY_FILTERS);
  const [showImport, setShowImport] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { suggestion: aiSuggestion, loading: aiLoading, categorize: aiCategorize, clear: aiClear } = useAiCategorize();

  const now = new Date();
  // Default: current month; use 0 for "Todos os períodos" (sem filtro de data)
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const buildQueryString = (af: AdvancedFilterValues) => {
    const p = new URLSearchParams();
    if (af.dateFrom || af.dateTo) {
      if (af.dateFrom) p.set('dateFrom', af.dateFrom);
      if (af.dateTo) p.set('dateTo', af.dateTo);
      p.set('dateType', af.dateType);
    } else if (month > 0 && year > 0) {
      p.set('month', String(month));
      p.set('year', String(year));
    }
    if (af.status.length > 0) p.set('statusMulti', af.status.join(','));
    else if (filter.status) p.set('status', filter.status);
    if (af.categoryId) p.set('categoryId', af.categoryId);
    if (af.costCenterId) p.set('costCenterId', af.costCenterId);
    if (af.counterpart) p.set('counterpart', af.counterpart);
    if (af.minValue) p.set('minValue', af.minValue);
    if (af.maxValue) p.set('maxValue', af.maxValue);
    return p.toString();
  };

  const fetchData = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const [itemsRes, catsRes, ccRes, tagsRes, clientsRes, rulesRes, banksRes] = await Promise.all([
        apiFetch(`/api/pj/accounts-receivable?${buildQueryString(advancedFilters)}`),
        apiFetch('/api/pj/categories'),
        apiFetch('/api/pj/cost-centers'),
        apiFetch('/api/pj/tags'),
        apiFetch('/api/pj/clients'),
        apiFetch('/api/pj/fiscal/regras-servico'),
        apiFetch('/api/banking/connections?personType=PJ'),
      ]);
      setItems(await itemsRes.json());
      setCategories(await catsRes.json());
      const ccData = await ccRes.json();
      setCostCenters(Array.isArray(ccData) ? ccData : []);
      const tagsData = await tagsRes.json();
      setTags(Array.isArray(tagsData) ? tagsData : []);
      const clientsData = await clientsRes.json();
      setClients(Array.isArray(clientsData) ? clientsData : []);
      const rulesData = await rulesRes.json();
      setFiscalRules(rulesData.rules || []);
      const banksData = await banksRes.json();
      setBankConnections(Array.isArray(banksData?.connections) ? banksData.connections : []);
    } catch { /* ignore */ }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, month, year, filter.status, advancedFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (searchParams.get('novo') === 'true') {
      setDefaultLaunchType(searchParams.get('launchType') || '');
      setEditing(null);
      setIsRecurring(false);
      setRecurrenceMonths(2);
      setSelectedTags([]);
      setAutoNfe(false);
      setAutoBoleto(false);
      aiClear();
      setShowForm(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openNew = () => {
    setDefaultLaunchType('');
    setEditing(null);
    setIsRecurring(false);
    setRecurrenceMonths(2);
    setSelectedTags([]);
    setAutoNfe(false);
    setAutoBoleto(false);
    setBankConnectionId('');
    setFormDueDate('');
    aiClear();
    setShowForm(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((i: any) => i.id)));
    }
  };

  const handleBulkReceive = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        apiFetch(`/api/pj/accounts-receivable/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'recebido', receivedAt: new Date().toISOString() }),
        })
      ));
      toast({ title: `${selectedIds.size} conta(s) marcada(s) como recebida(s)` });
      setSelectedIds(new Set());
      fetchData();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Excluir ${selectedIds.size} conta(s)?`)) return;
    setBulkLoading(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        apiFetch(`/api/pj/accounts-receivable/${id}`, { method: 'DELETE' })
      ));
      toast({ title: `${selectedIds.size} conta(s) excluída(s)` });
      setSelectedIds(new Set());
      fetchData();
    } finally {
      setBulkLoading(false);
    }
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setIsRecurring(!!item.isRecurring);
    setRecurrenceMonths(item.recurrence?.renewalMonths || 2);
    setSelectedTags(item.tags?.map((t: any) => t.tagId) || []);
    setAutoNfe(!!item.autoNfe);
    setAutoBoleto(!!item.autoBoleto);
    setBankConnectionId(item.bankConnectionId || '');
    setFormDueDate(item.dueDate?.split('T')[0] || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    const body: any = {
      description: fd.get('description'),
      customerName: fd.get('customerName'),
      customerDoc: fd.get('customerDoc') || null,
      customerEmail: fd.get('customerEmail') || null,
      amount: fd.get('amount'),
      dueDate: fd.get('dueDate'),
      status: fd.get('status') || 'pendente',
      categoryId: fd.get('categoryId') || null,
      costCenterId: fd.get('costCenterId') || null,
      notes: fd.get('notes'),
      isRecurring,
      recurrenceType: isRecurring ? 'monthly' : null,
      recurrenceMonths: isRecurring ? recurrenceMonths : null,
      tagIds: selectedTags,
      bankConnectionId: bankConnectionId || null,
      autoNfe,
      autoBoleto,
      chargeType: fd.get('chargeType') || 'boleto_pix',
      fiscalRuleId: fd.get('fiscalRuleId') || null,
      launchType: fd.get('launchType') || null,
    };
    if (fd.get('receivedAt')) body.receivedAt = fd.get('receivedAt');

    const url = editing ? `/api/pj/accounts-receivable/${editing.id}` : '/api/pj/accounts-receivable';
    const method = editing ? 'PUT' : 'POST';
    try {
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        toast({ title: editing ? 'Conta atualizada' : 'Conta criada' });
        setShowForm(false);
        setEditing(null);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Erro ao salvar', description: err.error || `HTTP ${res.status}`, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err?.message || 'Erro desconhecido', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta conta?')) return;
    await apiFetch(`/api/pj/accounts-receivable/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleMarkReceived = async (item: any) => {
    await apiFetch(`/api/pj/accounts-receivable/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'recebido', receivedAt: new Date().toISOString() }),
    });
    fetchData();
  };

  const handleAutomate = async (id: string, nfe: boolean, boleto: boolean) => {
    setAutomating(id);
    const res = await apiFetch(`/api/pj/accounts-receivable/${id}/automate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nfe, boleto }),
    });
    const data = await res.json();
    if (res.ok) {
      toast({ title: 'Automacao disparada', description: `${nfe ? 'NFS-e ' : ''}${boleto ? 'Boleto ' : ''}gerado(s)` });
      fetchData();
    } else {
      toast({ title: 'Erro', description: data.error, variant: 'destructive' });
    }
    setAutomating(null);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]);
  };

  const handleQuickAdd = async () => {
    if (!quickAdd || !quickName.trim()) return;
    let url = '';
    let body: any = {};
    if (quickAdd.type === 'category') {
      url = '/api/pj/categories';
      body = { name: quickName, type: 'INCOME' };
    } else if (quickAdd.type === 'costCenter') {
      url = '/api/pj/cost-centers';
      body = { name: quickName };
    } else if (quickAdd.type === 'client') {
      url = '/api/pj/clients';
      body = { name: quickName };
    } else if (quickAdd.type === 'tag') {
      url = '/api/pj/tags';
      body = { name: quickName, color: '#3b82f6' };
    }
    const res = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      toast({ title: 'Criado com sucesso' });
      fetchData();
    } else {
      toast({ title: 'Erro ao criar', variant: 'destructive' });
    }
    setQuickAdd(null);
    setQuickName('');
  };

  const filtered = items.filter((i: any) => {
    if (filter.search) {
      const s = filter.search.toLowerCase();
      return i.description?.toLowerCase().includes(s) || i.customerName?.toLowerCase().includes(s);
    }
    return true;
  });

  if (!activeCompanyId) return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Contas a Receber</h1>
          <p className="text-muted-foreground">Gerencie seus recebiveis</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton type="receivables" />
          <Button variant="outline" onClick={() => setShowImport(true)}><FileUp className="w-4 h-4 mr-2" />Importar</Button>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nova Conta</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Período</Label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (month === 0) return;
                    const d = new Date(year, month - 2, 1);
                    setYear(d.getFullYear()); setMonth(d.getMonth() + 1);
                  }}
                  disabled={month === 0}
                  className="p-2 rounded-lg border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Mês anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select value={year === 0 ? 'todos' : `${year}-${month}`} onChange={e => {
                  if (e.target.value === 'todos') { setYear(0); setMonth(0); }
                  else { const [y, m] = e.target.value.split('-'); setYear(Number(y)); setMonth(Number(m)); }
                }} className="px-3 py-2 border rounded-lg text-sm bg-background min-w-[160px]">
                  <option value="todos">Todos os períodos</option>
                  {Array.from({ length: 37 }, (_, i) => {
                    const d = new Date(now.getFullYear(), now.getMonth() + 12 - i, 1);
                    const y = d.getFullYear(); const m = d.getMonth() + 1;
                    return <option key={`${y}-${m}`} value={`${y}-${m}`}>{d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</option>;
                  })}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (month === 0) return;
                    const d = new Date(year, month, 1);
                    setYear(d.getFullYear()); setMonth(d.getMonth() + 1);
                  }}
                  disabled={month === 0}
                  className="p-2 rounded-lg border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Próximo mês"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                <option value="">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="recebido">Recebido</option>
                <option value="vencido">Vencido</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Descricao ou cliente..." value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))} className="pl-9" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AdvancedFilters
        filters={advancedFilters}
        onApply={(f) => { setAdvancedFilters(f); }}
        categories={categories}
        costCenters={costCenters}
        tags={tags}
        statusOptions={[
          { value: 'pendente', label: 'Pendente' },
          { value: 'recebido', label: 'Recebido' },
          { value: 'vencido', label: 'Vencido' },
          { value: 'cancelado', label: 'Cancelado' },
        ]}
      />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground shadow-lg">
          <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
          <div className="flex-1" />
          <button
            onClick={handleBulkReceive}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> Marcar como recebido
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" /> Excluir
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="p-1 rounded hover:bg-white/20">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showForm && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base flex justify-between">
              {editing ? 'Editar Conta' : 'Nova Conta a Receber'}
              <button onClick={() => { setShowForm(false); setEditing(null); }}><X className="w-5 h-5" /></button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form key={editing?.id ?? 'new'} ref={formRef} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <Label>Descricao *</Label>
                  <Input
                    name="description"
                    required
                    defaultValue={editing?.description}
                    onChange={e => aiCategorize(e.target.value, 'INCOME')}
                  />
                  {aiLoading && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Sparkles className="w-3 h-3 animate-pulse" /> Categorizando...</p>}
                  {aiSuggestion && !aiLoading && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Sugerido: <strong>{aiSuggestion.categoryName}</strong>
                      {aiSuggestion.matchedCategoryId && (
                        <button
                          type="button"
                          className="ml-1 underline"
                          onClick={() => {
                            const sel = document.querySelector<HTMLSelectElement>('[name="categoryId"]');
                            if (sel) sel.value = aiSuggestion.matchedCategoryId!;
                          }}
                        >aplicar</button>
                      )}
                    </p>
                  )}
                </div>
                <div><Label>Valor *</Label><Input name="amount" type="number" step="0.01" required defaultValue={editing?.amount} /></div>
                <div>
                  <Label className="flex items-center gap-1">Cliente <button type="button" onClick={() => { setQuickAdd({ type: 'client', name: '' }); setQuickName(''); }} className="text-primary hover:text-primary/80"><PlusCircle className="w-4 h-4" /></button></Label>
                  <select name="customerName" defaultValue={editing?.customerName || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="">Selecione um cliente</option>
                    {clients.map((c: any) => <option key={c.id} value={c.name}>{c.name}{c.document ? ` (${c.document})` : ''}</option>)}
                  </select>
                </div>
                <div><Label>CPF / CNPJ</Label><Input name="customerDoc" placeholder="Para NF-e e Boleto" defaultValue={editing?.customerDoc} /></div>
                <div><Label>E-mail do cliente</Label><Input name="customerEmail" type="email" placeholder="cliente@email.com" defaultValue={editing?.customerEmail} /></div>
                <div><Label>Vencimento *</Label><Input name="dueDate" type="date" required defaultValue={editing?.dueDate?.split('T')[0]} onChange={e => setFormDueDate(e.target.value)} /></div>
                <div><Label>Data Recebimento</Label><Input name="receivedAt" type="date" defaultValue={editing?.receivedAt?.split('T')[0]} /></div>
                <div>
                  <Label>Status</Label>
                  <select name="status" defaultValue={editing?.status || 'pendente'} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="pendente">Pendente</option><option value="recebido">Recebido</option><option value="vencido">Vencido</option><option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div>
                  <Label className="flex items-center gap-1">Categoria <button type="button" onClick={() => { setQuickAdd({ type: 'category', name: '' }); setQuickName(''); }} className="text-primary hover:text-primary/80"><PlusCircle className="w-4 h-4" /></button></Label>
                  <select name="categoryId" defaultValue={editing?.categoryId || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="">Sem categoria</option>
                    {categories.filter((c: any) => c.isActive !== false && (c.type === 'INCOME' || c.type === 'receita' || c.type === 'ambos' || c.type === 'BOTH')).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="flex items-center gap-1">Centro de Custo <button type="button" onClick={() => { setQuickAdd({ type: 'costCenter', name: '' }); setQuickName(''); }} className="text-primary hover:text-primary/80"><PlusCircle className="w-4 h-4" /></button></Label>
                  <select name="costCenterId" defaultValue={editing?.costCenterId || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="">Nenhum</option>
                    {costCenters.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Automacoes */}
              {!editing && (
                <div className="flex flex-wrap gap-4 p-3 bg-muted/30 rounded-lg border">
                  <p className="w-full text-xs font-medium text-muted-foreground">Gerar automaticamente ao salvar:</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={autoNfe} onChange={e => setAutoNfe(e.target.checked)} className="w-4 h-4" />
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Nota Fiscal (NF-e)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={autoBoleto} onChange={e => setAutoBoleto(e.target.checked)} className="w-4 h-4" />
                    <QrCode className="w-4 h-4 text-purple-600" />
                    <span className="text-sm">Boleto / PIX</span>
                  </label>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Regra fiscal NFS-e</Label>
                  <select name="fiscalRuleId" defaultValue={editing?.fiscalRuleId || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="">Usar regra padrao</option>
                    {fiscalRules.filter((r: any) => r.isActive).map((r: any) => <option key={r.id} value={r.id}>{r.name}{r.isDefault ? ' (padrao)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Tipo de lançamento</Label>
                  <select name="launchType" defaultValue={(editing as any)?.launchType || defaultLaunchType} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="">— Não classificado</option>
                    <option value="venda">Venda</option>
                    <option value="contrato">Contrato</option>
                    <option value="aporte">Aporte</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
                <div>
                  <Label>Tipo de cobranca</Label>
                  <select name="chargeType" defaultValue={editing?.chargeType || 'boleto_pix'} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="boleto_pix">Boleto com PIX</option>
                    <option value="boleto">Boleto</option>
                    <option value="pix">PIX</option>
                    <option value="link">Link de pagamento</option>
                  </select>
                </div>
                <div>
                  <Label>Conta</Label>
                  <select value={bankConnectionId} onChange={e => setBankConnectionId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="">— Nenhuma conta vinculada</option>
                    {bankConnections.map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName}{b.agency ? ` — Agência: ${b.agency}` : ''}{b.accountNumber ? ` Conta: ${b.accountNumber}` : (!b.agency ? ' — Sem agência e conta cadastradas' : '')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div>
                  <Label className="flex items-center gap-1">Tags <button type="button" onClick={() => { setQuickAdd({ type: 'tag', name: '' }); setQuickName(''); }} className="text-primary hover:text-primary/80"><PlusCircle className="w-4 h-4" /></button></Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {tags.map((tag: any) => (
                      <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${selectedTags.includes(tag.id) ? 'text-white border-transparent' : 'border-current opacity-60 hover:opacity-100'}`}
                        style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color, borderColor: tag.color } : { color: tag.color }}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recurrence */}
              <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="rounded" />
                  <Repeat className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Conta recorrente (mensal)</span>
                </label>
                {isRecurring && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs">Parcelas:</Label>
                    <Input type="number" min={2} max={60} value={recurrenceMonths} onChange={e => setRecurrenceMonths(Number(e.target.value))} className="w-20 h-8" />
                    {(() => {
                      const base = formDueDate || editing?.dueDate?.split('T')[0];
                      if (!base || recurrenceMonths < 1) return null;
                      const d = new Date(base + 'T12:00:00');
                      d.setMonth(d.getMonth() + recurrenceMonths);
                      const m = d.toLocaleString('pt-BR', { month: 'long' });
                      return <span className="text-xs text-muted-foreground">recorrência até {m.charAt(0).toUpperCase() + m.slice(1)}/{d.getFullYear()}</span>;
                    })()}
                  </div>
                )}
              </div>

              <div><Label>Observacoes</Label><Input name="notes" defaultValue={editing?.notes} /></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</Button>
                <Button type="button" onClick={handleSave}>{editing ? 'Salvar' : 'Criar'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma conta a receber encontrada.</CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 pr-3 w-8">
                  <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                    {selectedIds.size === filtered.length && filtered.length > 0
                      ? <CheckSquare className="w-4 h-4" />
                      : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="pb-3 font-medium">Descricao</th>
                <th className="pb-3 font-medium hidden sm:table-cell">Cliente</th>
                <th className="pb-3 font-medium">Valor</th>
                <th className="pb-3 font-medium hidden md:table-cell">Vencimento</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium hidden lg:table-cell">NF-e / Boleto</th>
                <th className="pb-3 font-medium hidden xl:table-cell">Categoria</th>
                <th className="pb-3 font-medium text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item: any) => (
                <tr key={item.id} className={`border-b hover:bg-muted/50 transition-colors ${selectedIds.has(item.id) ? 'bg-primary/5' : ''}`}>
                  <td className="py-3 pr-3">
                    <button onClick={() => toggleSelect(item.id)} className="text-muted-foreground hover:text-foreground">
                      {selectedIds.has(item.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="py-3">
                    <p className="font-medium">{item.description}</p>
                    {item.sourceType && item.sourceType !== 'manual' && (
                      <p className="text-xs text-muted-foreground">Origem: {item.sourceType === 'sale' ? 'Venda' : 'Contrato'}</p>
                    )}
                  </td>
                  <td className="py-3 hidden sm:table-cell text-muted-foreground">{item.customerName || '-'}</td>
                  <td className="py-3 font-semibold text-green-600">{fmt(Number(item.amount))}</td>
                  <td className="py-3 hidden md:table-cell">{new Date(item.dueDate).toLocaleDateString('pt-BR')}</td>
                  <td className="py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[item.status] || ''}`}>{statusLabels[item.status] || item.status}</span></td>
                  <td className="py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* NF-e badge */}
                      {item.nfe ? (
                        <a href={item.nfe.pdfUrl || '#'} target="_blank" rel="noreferrer"
                          className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${item.nfe.validationStatus === 'blocked' ? 'bg-red-50 border-red-200 text-red-700' : item.nfe.status === 'autorizada' ? 'bg-blue-50 border-blue-200 text-blue-700' : item.nfe.status === 'enviada' ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                          title={item.nfe.errorMessage || `${item.nfe.type === 'nfse' ? 'NFS-e' : 'NF-e'} ${item.nfe.status}`}>
                          <FileText className="w-3 h-3" />
                          {item.nfe.validationStatus === 'blocked' ? 'Fiscal pend.' : item.nfe.status === 'autorizada' ? `${item.nfe.type === 'nfse' ? 'NFS-e' : 'NF-e'} OK` : item.nfe.status === 'enviada' ? 'Enviada' : 'Rascunho'}
                          {item.nfe.pdfUrl && <ExternalLink className="w-2.5 h-2.5" />}
                        </a>
                      ) : (
                        <button onClick={() => handleAutomate(item.id, true, false)} disabled={automating === item.id}
                          className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
                          title="Gerar NFS-e">
                          <FileText className="w-3 h-3" />NFS-e
                        </button>
                      )}
                      {/* Boleto badge */}
                      {item.boleto ? (
                        <a href={item.boleto.boletoUrl || '#'} target="_blank" rel="noreferrer"
                          className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${item.boleto.status === 'pago' ? 'bg-green-50 border-green-200 text-green-700' : item.boleto.status === 'pendente' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                          title={`Boleto ${item.boleto.status}`}>
                          <QrCode className="w-3 h-3" />
                          {item.boleto.status === 'pago' ? 'Pago' : item.boleto.type === 'pix' ? 'PIX' : 'Boleto'}
                          {item.boleto.boletoUrl && <ExternalLink className="w-2.5 h-2.5" />}
                        </a>
                      ) : (
                        <button onClick={() => handleAutomate(item.id, false, true)} disabled={automating === item.id}
                          className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-dashed border-slate-300 text-slate-400 hover:border-purple-400 hover:text-purple-600 transition-colors"
                          title="Gerar Boleto">
                          <QrCode className="w-3 h-3" />Boleto
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-3 hidden xl:table-cell">{item.category?.name || '-'}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {item.status === 'pendente' && (
                        <button onClick={() => handleMarkReceived(item)} title="Marcar como recebido" className="p-1.5 rounded-lg hover:bg-green-100 text-green-600"><Check className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => openEdit(item)} title="Editar" className="p-1.5 rounded-lg hover:bg-muted"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(item.id)} title="Excluir" className="p-1.5 rounded-lg hover:bg-red-100 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick Add Dialog */}
      <Dialog open={!!quickAdd} onOpenChange={() => setQuickAdd(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {quickAdd?.type === 'category' && 'Nova Categoria'}
              {quickAdd?.type === 'costCenter' && 'Novo Centro de Custo'}
              {quickAdd?.type === 'client' && 'Novo Cliente'}
              {quickAdd?.type === 'tag' && 'Nova Tag'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome" value={quickName} onChange={e => setQuickName(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setQuickAdd(null)}>Cancelar</Button>
              <Button onClick={handleQuickAdd}>Criar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showImport && (
        <ImportTransactionsModal
          importType="income"
          categories={categories}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); fetchData(); }}
        />
      )}
    </div>
  );
}
