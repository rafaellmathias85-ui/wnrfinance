'use client';
import { apiFetch } from '@/lib/fetch';
import { CheckSquare } from 'lucide-react';
import { useAiCategorize } from '@/hooks/use-ai-categorize';
import { usePJ } from '@/lib/pj-context';
import { ExportButton } from '@/components/export-button';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, FileUp, Pencil, Plus, PlusCircle, Repeat, Search, Sparkles, Square, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import { AdvancedFilters, EMPTY_FILTERS, type AdvancedFilterValues } from '@/components/pj/AdvancedFilters';
import { ImportTransactionsModal } from '@/components/pj/ImportTransactionsModal';


const statusLabels: Record<string, string> = { pendente: 'Pendente', pago: 'Pago', vencido: 'Vencido', cancelado: 'Cancelado' };
const statusColors: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  pago: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  vencido: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelado: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function ContasPagar() {
  const fmt = useFormatCurrency();
  const { activeCompanyId } = usePJ();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [defaultLaunchType, setDefaultLaunchType] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filter, setFilter] = useState({ status: '', search: '' });
  const [paymentMethod, setPaymentMethod] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [quickAdd, setQuickAdd] = useState<{ type: string; name: string } | null>(null);
  const [quickName, setQuickName] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceMonths, setRecurrenceMonths] = useState(2);
  const [bankConnections, setBankConnections] = useState<any[]>([]);
  const [bankConnectionId, setBankConnectionId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterValues>(EMPTY_FILTERS);
  const [showImport, setShowImport] = useState(false);
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
    if (af.paymentMethod) p.set('paymentMethod', af.paymentMethod);
    if (af.tagIds.length > 0) p.set('tagIds', af.tagIds.join(','));
    return p.toString();
  };

  const fetchData = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const [itemsRes, catsRes, ccRes, tagsRes, suppRes, banksRes] = await Promise.all([
        apiFetch(`/api/pj/accounts-payable?${buildQueryString(advancedFilters)}`),
        apiFetch('/api/pj/categories'),
        apiFetch('/api/pj/cost-centers'),
        apiFetch('/api/pj/tags'),
        apiFetch('/api/pj/suppliers'),
        apiFetch('/api/banks'),
      ]);
      setItems(await itemsRes.json());
      setCategories(await catsRes.json());
      const ccData = await ccRes.json();
      setCostCenters(Array.isArray(ccData) ? ccData : []);
      const tagsData = await tagsRes.json();
      setTags(Array.isArray(tagsData) ? tagsData : []);
      const suppData = await suppRes.json();
      setSuppliers(Array.isArray(suppData) ? suppData : []);
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
      setPaymentMethod('');
      setSelectedTags([]);
      setIsRecurring(false);
      setRecurrenceMonths(2);
      aiClear();
      setShowForm(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openNew = () => {
    setDefaultLaunchType('');
    setEditing(null);
    setPaymentMethod('');
    setSelectedTags([]);
    setIsRecurring(false);
    setRecurrenceMonths(2);
    setBankConnectionId('');
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

  const handleBulkPay = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        apiFetch(`/api/pj/accounts-payable/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'pago', paidAt: new Date().toISOString() }),
        })
      ));
      toast({ title: `${selectedIds.size} conta(s) marcada(s) como paga(s)` });
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
        apiFetch(`/api/pj/accounts-payable/${id}`, { method: 'DELETE' })
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
    setPaymentMethod(item.paymentMethod || '');
    setSelectedTags(item.tags?.map((t: any) => t.tagId) || []);
    setIsRecurring(!!item.isRecurring);
    setRecurrenceMonths(item.recurrenceMonths || 2);
    setBankConnectionId(item.bankConnectionId || '');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: any = {
      description: fd.get('description'),
      supplierName: fd.get('supplierName'),
      amount: fd.get('amount'),
      dueDate: fd.get('dueDate'),
      status: fd.get('status') || 'pendente',
      categoryId: fd.get('categoryId') || null,
      costCenterId: fd.get('costCenterId') || null,
      notes: fd.get('notes'),
      paymentMethod: paymentMethod || null,
      launchType: fd.get('launchType') || null,
      tagIds: selectedTags,
      bankConnectionId: bankConnectionId || null,
      isRecurring,
      recurrenceType: isRecurring ? 'monthly' : null,
      recurrenceMonths: isRecurring ? recurrenceMonths : null,
    };
    if (fd.get('paidAt')) body.paidAt = fd.get('paidAt');
    if (paymentMethod === 'PIX') {
      body.pixKey = fd.get('pixKey') || null;
    } else if (paymentMethod === 'BOLETO') {
      body.boletoCode = fd.get('boletoCode') || null;
    } else if (paymentMethod === 'TRANSFERENCIA') {
      body.transferBank = fd.get('transferBank') || null;
      body.transferAgency = fd.get('transferAgency') || null;
      body.transferAccount = fd.get('transferAccount') || null;
      body.transferName = fd.get('transferName') || null;
      body.transferDoc = fd.get('transferDoc') || null;
      body.transferAccountType = fd.get('transferAccountType') || null;
    }

    const url = editing ? `/api/pj/accounts-payable/${editing.id}` : '/api/pj/accounts-payable';
    const method = editing ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      toast({ title: editing ? 'Conta atualizada' : 'Conta criada' });
      setShowForm(false);
      setEditing(null);
      fetchData();
    } else {
      const err = await res.json();
      toast({ title: 'Erro', description: err.error, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta conta?')) return;
    await apiFetch(`/api/pj/accounts-payable/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleMarkPaid = async (item: any) => {
    await apiFetch(`/api/pj/accounts-payable/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pago', paidAt: new Date().toISOString() }),
    });
    fetchData();
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
      body = { name: quickName, type: 'EXPENSE' };
    } else if (quickAdd.type === 'costCenter') {
      url = '/api/pj/cost-centers';
      body = { name: quickName };
    } else if (quickAdd.type === 'supplier') {
      url = '/api/pj/suppliers';
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
      return i.description?.toLowerCase().includes(s) || i.supplierName?.toLowerCase().includes(s);
    }
    return true;
  });

  if (!activeCompanyId) return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Contas a Pagar</h1>
          <p className="text-muted-foreground">Gerencie suas obrigacoes financeiras</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton type="payables" />
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
                    // +12 meses futuros até -24 meses passados (índice 0 = +12, índice 12 = atual, índice 36 = -24)
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
                <option value="pago">Pago</option>
                <option value="vencido">Vencido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Descricao ou fornecedor..." value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))} className="pl-9" />
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
          { value: 'pago', label: 'Pago' },
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
            onClick={handleBulkPay}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> Marcar como pago
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
              {editing ? 'Editar Conta' : 'Nova Conta a Pagar'}
              <button onClick={() => { setShowForm(false); setEditing(null); }}><X className="w-5 h-5" /></button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label>Descricao *</Label>
                  <Input
                    name="description"
                    required
                    defaultValue={editing?.description}
                    onChange={e => aiCategorize(e.target.value, 'EXPENSE')}
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
                <div>
                  <Label className="flex items-center gap-1">Fornecedor <button type="button" onClick={() => { setQuickAdd({ type: 'supplier', name: '' }); setQuickName(''); }} className="text-primary hover:text-primary/80"><PlusCircle className="w-4 h-4" /></button></Label>
                  <select name="supplierName" defaultValue={editing?.supplierName || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="">Selecione um fornecedor</option>
                    {suppliers.map((s: any) => <option key={s.id} value={s.name}>{s.name}{s.document ? ` (${s.document})` : ''}</option>)}
                  </select>
                </div>
                <div><Label>Valor *</Label><Input name="amount" type="number" step="0.01" required defaultValue={editing?.amount} /></div>
                <div><Label>Vencimento *</Label><Input name="dueDate" type="date" required defaultValue={editing?.dueDate?.split('T')[0]} /></div>
                <div><Label>Data Pagamento</Label><Input name="paidAt" type="date" defaultValue={editing?.paidAt?.split('T')[0]} /></div>
                <div>
                  <Label>Status</Label>
                  <select name="status" defaultValue={editing?.status || 'pendente'} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="pendente">Pendente</option><option value="pago">Pago</option><option value="vencido">Vencido</option><option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div>
                  <Label className="flex items-center gap-1">Categoria <button type="button" onClick={() => { setQuickAdd({ type: 'category', name: '' }); setQuickName(''); }} className="text-primary hover:text-primary/80"><PlusCircle className="w-4 h-4" /></button></Label>
                  <select name="categoryId" defaultValue={editing?.categoryId || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="">Sem categoria</option>
                    {categories.filter((c: any) => c.isActive !== false && (c.type === 'EXPENSE' || c.type === 'despesa' || c.type === 'ambos' || c.type === 'BOTH')).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="flex items-center gap-1">Centro de Custo <button type="button" onClick={() => { setQuickAdd({ type: 'costCenter', name: '' }); setQuickName(''); }} className="text-primary hover:text-primary/80"><PlusCircle className="w-4 h-4" /></button></Label>
                  <select name="costCenterId" defaultValue={editing?.costCenterId || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="">Nenhum</option>
                    {costCenters.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Metodo de Pagamento</Label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="">Nenhum</option>
                    <option value="PIX">PIX</option>
                    <option value="BOLETO">Boleto</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                  </select>
                </div>
                <div>
                  <Label>Tipo de lançamento</Label>
                  <select name="launchType" defaultValue={(editing as any)?.launchType || defaultLaunchType} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="">— Não classificado</option>
                    <option value="fornecedor">Fornecedor</option>
                    <option value="funcionario">Funcionário</option>
                    <option value="impostos">Impostos</option>
                    <option value="transferencia">Transferência</option>
                    <option value="lucros">Divisão de Lucros</option>
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

              {paymentMethod === 'PIX' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div><Label>Chave PIX</Label><Input name="pixKey" defaultValue={editing?.pixKey} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatoria" /></div>
                </div>
              )}
              {paymentMethod === 'BOLETO' && (
                <div className="grid grid-cols-1 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div><Label>Codigo do Boleto</Label><Input name="boletoCode" defaultValue={editing?.boletoCode} placeholder="Linha digitavel do boleto" /></div>
                </div>
              )}
              {paymentMethod === 'TRANSFERENCIA' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div><Label>Banco</Label><Input name="transferBank" defaultValue={editing?.transferBank} placeholder="Ex: Bradesco" /></div>
                  <div><Label>Agencia</Label><Input name="transferAgency" defaultValue={editing?.transferAgency} placeholder="0001" /></div>
                  <div><Label>Conta</Label><Input name="transferAccount" defaultValue={editing?.transferAccount} placeholder="12345-6" /></div>
                  <div><Label>Titular</Label><Input name="transferName" defaultValue={editing?.transferName} /></div>
                  <div><Label>CPF/CNPJ</Label><Input name="transferDoc" defaultValue={editing?.transferDoc} /></div>
                  <div>
                    <Label>Tipo Conta</Label>
                    <select name="transferAccountType" defaultValue={editing?.transferAccountType || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                      <option value="">Selecione</option>
                      <option value="corrente">Corrente</option>
                      <option value="poupanca">Poupanca</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Tags */}
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

              {/* Recurrence */}
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="rounded" />
                  <Repeat className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Conta recorrente (mensal)</span>
                </label>
                {isRecurring && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Parcelas:</Label>
                    <Input type="number" min={2} max={60} value={recurrenceMonths} onChange={e => setRecurrenceMonths(Number(e.target.value))} className="w-20 h-8" />
                  </div>
                )}
              </div>

              <div><Label>Observacoes</Label><Input name="notes" defaultValue={editing?.notes} /></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</Button>
                <Button type="submit">{editing ? 'Salvar' : 'Criar'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma conta a pagar encontrada.</CardContent></Card>
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
                <th className="pb-3 font-medium hidden sm:table-cell">Fornecedor</th>
                <th className="pb-3 font-medium">Valor</th>
                <th className="pb-3 font-medium hidden md:table-cell">Vencimento</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium hidden lg:table-cell">Pagamento</th>
                <th className="pb-3 font-medium hidden xl:table-cell">Tags</th>
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
                    <p className="text-xs text-muted-foreground">{item.category?.name || ''}</p>
                  </td>
                  <td className="py-3 hidden sm:table-cell text-muted-foreground">{item.supplierName || '-'}</td>
                  <td className="py-3 font-semibold text-red-600">{fmt(Number(item.amount))}</td>
                  <td className="py-3 hidden md:table-cell">{new Date(item.dueDate).toLocaleDateString('pt-BR')}</td>
                  <td className="py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[item.status] || ''}`}>{statusLabels[item.status] || item.status}</span></td>
                  <td className="py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-1.5">
                      {item.paymentMethod ? <span className="text-xs px-2 py-0.5 rounded bg-muted font-medium">{item.paymentMethod}</span> : <span className="text-muted-foreground">-</span>}
                    </div>
                  </td>
                  <td className="py-3 hidden xl:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {item.tags?.map((t: any) => (
                        <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: t.tag?.color || '#3b82f6' }}>{t.tag?.name}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {item.status === 'pendente' && (
                        <button onClick={() => handleMarkPaid(item)} title="Marcar como pago" className="p-1.5 rounded-lg hover:bg-green-100 text-green-600"><Check className="w-4 h-4" /></button>
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
              {quickAdd?.type === 'supplier' && 'Novo Fornecedor'}
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
          importType="expense"
          categories={categories}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); fetchData(); }}
        />
      )}
    </div>
  );
}
