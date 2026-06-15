'use client';
import { apiFetch } from '@/lib/fetch';
import { EXPENSE_CATEGORIES, RECURRENCE_TYPES, formatDate, toInputDate } from '@/lib/format';
import { usePJ } from '@/lib/pj-context';
import { ExportButton } from '@/components/export-button';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import BankFilter from '@/components/bank-filter';

import {
  Plus, Pencil, Trash2, TrendingDown, Filter, Search, CheckCircle, Clock, Building2, Repeat, RefreshCw, ChevronLeft, ChevronRight, Calendar,
  Paperclip, Download, FileText,
} from 'lucide-react';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  status: string;
  isRecurring: boolean;
  recurrenceType?: string | null;
  bankConnectionId?: string | null;
  bankConnection?: { id: string; bankName: string } | null;
  tags?: { tag: Tag }[];
  isInstallment?: boolean;
  installmentNumber?: number;
  totalInstallments?: number;
  paymentMethod?: string | null;
  notes?: string | null;
  attachmentUrl?: string | null;
}

const PAYMENT_METHODS = [
  { value: '', label: 'Selecione...' },
  { value: 'PIX', label: 'PIX' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'TRANSFERENCIA', label: 'Transferência' },
  { value: 'CARTAO', label: 'Cartão' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
];

const emptyForm = { description: '', amount: '', category: 'Alimentação', date: '', status: 'pendente', isRecurring: false, recurrenceType: 'mensal', bankConnectionId: '', isInstallment: false, totalInstallments: 2, paymentMethod: '', notes: '', attachmentUrl: '', boletoCode: '' };

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export default function DespesasPage() {
  const formatCurrency = useFormatCurrency();
  const { activeEnv } = usePJ();
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm, tagIds: [] });
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('todas');
  const [filterBank, setFilterBank] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [banks, setBanks] = useState<{ id: string; bankName: string }[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [uploading, setUploading] = useState(false);

  // Redirect PJ users
  useEffect(() => {
    if (activeEnv === 'pj') router.replace('/pj/contas-pagar');
  }, [activeEnv, router]);

  const goToPrevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const goToNextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };
  const goToCurrentMonth = () => { setSelectedMonth(new Date().getMonth()); setSelectedYear(new Date().getFullYear()); };

  useEffect(() => {
    apiFetch('/api/banks').then(r => r.json()).then(d => setBanks(d.connections?.filter((c: any) => c.status?.toLowerCase() === 'active') || [])).catch(() => {});
    apiFetch('/api/tags').then(r => r.json()).then(d => setTags(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const fetchExpenses = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterCategory !== 'todas') params.set('category', filterCategory);
      if (filterBank !== 'todos') params.set('bankId', filterBank);
      const { startDate, endDate } = getMonthRange(selectedYear, selectedMonth);
      params.set('startDate', startDate);
      params.set('endDate', endDate);
      const res = await apiFetch(`/api/expenses?${params.toString()}`);
      const data = await res.json();
      setExpenses(data ?? []);
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, [filterCategory, filterBank, selectedMonth, selectedYear]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const presignRes = await apiFetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, isPublic: false }),
      }).then(r => r.json());

      if (presignRes.uploadUrl && presignRes.cloud_storage_path) {
        const headers: Record<string, string> = { 'Content-Type': file.type };
        if (presignRes.uploadUrl.includes('content-disposition')) {
          headers['Content-Disposition'] = 'attachment';
        }
        await fetch(presignRes.uploadUrl, { method: 'PUT', headers, body: file });
        setForm((prev: any) => ({ ...prev, attachmentUrl: presignRes.cloud_storage_path }));
      }
    } catch (err) {
      console.error('Upload error:', err);
    }
    setUploading(false);
  };

  const downloadAttachment = async (cloud_storage_path: string) => {
    try {
      const res = await apiFetch('/api/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloud_storage_path, isPublic: false }),
      }).then(r => r.json());
      if (res.url) {
        const a = document.createElement('a');
        a.href = res.url;
        a.download = 'boleto';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch { /* noop */ }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingId ? `/api/expenses/${editingId}` : '/api/expenses';
      const method = editingId ? 'PUT' : 'POST';
      const payload = { ...form };
      if (!payload.bankConnectionId) delete payload.bankConnectionId;
      if (!payload.isRecurring) delete payload.recurrenceType;
      if (!payload.isInstallment) delete payload.totalInstallments;
      if (!payload.attachmentUrl) delete payload.attachmentUrl;

      // Se editando recorrente e mudou banco, perguntar se quer atualizar futuros
      if (editingId && form.isRecurring && form._originalBankId !== undefined && form.bankConnectionId !== form._originalBankId) {
        const updateFuture = window.confirm(
          'Você alterou o banco desta despesa recorrente.\n\n' +
          'OK = Alterar este e todos os futuros pendentes\n' +
          'Cancelar = Alterar apenas este mês'
        );
        if (updateFuture) {
          payload.updateFutureBank = true;
        }
      }

      await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      fetchExpenses();
    } catch { /* noop */ } finally {
      setSaving(false);
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setForm({
      description: expense.description ?? '',
      amount: String(expense.amount ?? ''),
      category: expense.category ?? 'Outros',
      date: toInputDate(expense.date),
      status: expense.status ?? 'pendente',
      isRecurring: expense.isRecurring ?? false,
      recurrenceType: expense.recurrenceType || 'mensal',
      bankConnectionId: expense.bankConnectionId || '',
      tagIds: expense.tags?.map(t => t.tag.id) || [],
      isInstallment: false,
      totalInstallments: 2,
      paymentMethod: expense.paymentMethod || '',
      notes: expense.notes || '',
      attachmentUrl: expense.attachmentUrl || '',
      boletoCode: (expense as any).boletoCode || '',
      _originalBankId: expense.bankConnectionId || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string, expense?: Expense) => {
    if (expense?.isRecurring) {
      const choice = window.confirm('Esta despesa é recorrente. Deseja excluir também todas as futuras pendentes?\n\nOK = Excluir esta e futuras\nCancelar = Manter (ou use o botão X para excluir só esta)');
      if (choice) {
        await apiFetch(`/api/expenses/${id}?deleteFuture=true`, { method: 'DELETE' });
      } else {
        return;
      }
    } else {
      if (!confirm('Tem certeza que deseja excluir esta despesa?')) return;
      await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
    }
    fetchExpenses();
  };

  const filtered = (expenses ?? []).filter((e) =>
    (e.description ?? '').toLowerCase().includes((searchTerm ?? '').toLowerCase())
  );
  const totalFiltered = filtered.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const recurringCount = filtered.filter(e => e.isRecurring).length;
  const recurringTotal = filtered.filter(e => e.isRecurring).reduce((sum, e) => sum + (e.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Despesas</h1>
          <p className="text-muted-foreground mt-1">Gerencie todas as suas despesas</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton type="expenses" startDate={getMonthRange(selectedYear, selectedMonth).startDate} endDate={getMonthRange(selectedYear, selectedMonth).endDate} />
          <Button onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setDialogOpen(true); }} className="bg-blue-500 hover:bg-blue-600 text-white">
            <Plus className="w-4 h-4 mr-1" /> Nova Despesa
          </Button>
        </div>
      </div>

      {/* Month selector */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <button onClick={goToPrevMonth} className="p-2 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5 text-muted-foreground" /></button>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              <span className="text-base font-semibold text-foreground">{MONTH_NAMES[selectedMonth]} {selectedYear}</span>
              {(selectedMonth !== new Date().getMonth() || selectedYear !== new Date().getFullYear()) && (
                <button onClick={goToCurrentMonth} className="text-xs text-blue-600 hover:underline ml-2">Mês atual</button>
              )}
            </div>
            <button onClick={goToNextMonth} className="p-2 rounded-lg hover:bg-muted transition-colors"><ChevronRight className="w-5 h-5 text-muted-foreground" /></button>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center"><TrendingDown className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Despesas</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(totalFiltered)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center"><Repeat className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Despesas Recorrentes</p>
                <p className="text-lg font-bold text-blue-600">{recurringCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center"><RefreshCw className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Recorrente</p>
                <p className="text-lg font-bold text-amber-600">{formatCurrency(recurringTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar despesas..." value={searchTerm} onChange={(e: any) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select value={filterCategory} onChange={(e: any) => setFilterCategory(e.target.value)} className="px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                <option value="todas">Todas categorias</option>
                {EXPENSE_CATEGORIES.map((cat: string) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <BankFilter value={filterBank} onChange={setFilterBank} />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{filtered.length} despesa(s)</span>
            <span className="font-medium text-red-600">Total: {formatCurrency(totalFiltered)}</span>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <TrendingDown className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma despesa encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((expense, i) => (
              <motion.div key={expense.id} initial={{ y: 5 }} animate={{ y: 0 }} exit={{ x: -50 }} transition={{ delay: i * 0.02 }}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${expense.status === 'pago' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'}`}>
                          {expense.status === 'pago' ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate">{expense.description}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{expense.category}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(expense.date)}</span>
                            {expense.isRecurring && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center gap-1">
                                <Repeat className="w-3 h-3" />
                                {RECURRENCE_TYPES.find(r => r.value === expense.recurrenceType)?.label || 'Recorrente'}
                              </span>
                            )}
                            {expense.bankConnection && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 flex items-center gap-1">
                                <Building2 className="w-3 h-3" />{expense.bankConnection.bankName}
                              </span>
                            )}
                            {expense.isInstallment && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                                {expense.installmentNumber}/{expense.totalInstallments}
                              </span>
                            )}
                            {expense.paymentMethod && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                {PAYMENT_METHODS.find(p => p.value === expense.paymentMethod)?.label || expense.paymentMethod}
                              </span>
                            )}
                            {(expense as any).boletoCode && (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText((expense as any).boletoCode); }}
                                className="text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 flex items-center gap-1 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                                title="Clique para copiar o código de barras"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="1" height="16"/><rect x="5" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/><rect x="12" y="4" width="3" height="16"/><rect x="17" y="4" width="1" height="16"/><rect x="20" y="4" width="2" height="16"/></svg>
                                Cód. Barras
                              </button>
                            )}
                            {expense.attachmentUrl && (
                              <button onClick={(e) => { e.stopPropagation(); downloadAttachment(expense.attachmentUrl!); }} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                                <Paperclip className="w-3 h-3" />Boleto
                              </button>
                            )}
                            {expense.tags?.map(t => (
                              <span key={t.tag.id} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>
                                {t.tag.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-red-700 dark:text-red-400 whitespace-nowrap">{formatCurrency(expense.amount)}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(expense)}><Pencil className="w-4 h-4 text-muted-foreground" /></Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(expense.id, expense)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Input value={form.description ?? ''} onChange={(e: any) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Supermercado" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Valor (R$)</label>
                <Input type="number" step="0.01" min="0" value={form.amount ?? ''} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" required />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Categoria</label>
                <select value={form.category ?? 'Outros'} onChange={(e: any) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none">
                  {EXPENSE_CATEGORIES.map((cat: string) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Data</label>
                <Input type="date" value={form.date ?? ''} onChange={(e: any) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Status</label>
                <select value={form.status ?? 'pendente'} onChange={(e: any) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="pendente">Pendente</option>
                  <option value="pago">Pago</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Banco (opcional)</label>
              <select value={form.bankConnectionId || ''} onChange={(e: any) => setForm({ ...form, bankConnectionId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Nenhum banco</option>
                {banks.length > 0 ? banks.map(b => <option key={b.id} value={b.id}>{b.bankName}</option>) : <option disabled>Cadastre bancos primeiro</option>}
              </select>
            </div>

            {/* Método de Pagamento */}
            <div>
              <label className="text-sm font-medium text-foreground">Método de Pagamento</label>
              <select value={form.paymentMethod || ''} onChange={(e: any) => setForm({ ...form, paymentMethod: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none">
                {PAYMENT_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
              </select>
            </div>

            {/* Código de Barras do Boleto */}
            {form.paymentMethod === 'BOLETO' && (
              <div>
                <label className="text-sm font-medium text-foreground">Código de Barras / Linha Digitável</label>
                <div className="mt-1 relative">
                  <Input
                    value={form.boletoCode || ''}
                    onChange={(e: any) => setForm({ ...form, boletoCode: e.target.value })}
                    placeholder="Digite ou cole a linha digitável do boleto"
                    className="pr-10 font-mono text-sm"
                    maxLength={54}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><rect x="2" y="4" width="1" height="16" /><rect x="5" y="4" width="2" height="16" /><rect x="9" y="4" width="1" height="16" /><rect x="12" y="4" width="3" height="16" /><rect x="17" y="4" width="1" height="16" /><rect x="20" y="4" width="2" height="16" /></svg>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Insira os 47 ou 48 dígitos da linha digitável</p>
              </div>
            )}

            {/* Anexo (Boleto) */}
            <div>
              <label className="text-sm font-medium text-foreground">Anexo / Boleto</label>
              <div className="mt-1 flex items-center gap-2">
                {form.attachmentUrl ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm flex-1">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span className="text-blue-700 dark:text-blue-400 truncate flex-1">Arquivo anexado</span>
                    <button type="button" onClick={() => downloadAttachment(form.attachmentUrl)} className="text-blue-600 hover:text-blue-800"><Download className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setForm({ ...form, attachmentUrl: '' })} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-input rounded-lg text-sm cursor-pointer hover:bg-muted transition-colors flex-1">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{uploading ? 'Enviando...' : 'Clique para anexar'}</span>
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleFileAttach} disabled={uploading} />
                  </label>
                )}
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="text-sm font-medium text-foreground">Observações</label>
              <textarea
                value={form.notes || ''}
                onChange={(e: any) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                placeholder="Observações sobre esta despesa..."
              />
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div>
                <label className="text-sm font-medium text-foreground">Tags</label>
                <div className="flex flex-wrap gap-2 mt-1 p-2 border border-input rounded-lg min-h-[40px]">
                  {tags.map(tag => {
                    const selected = (form.tagIds || []).includes(tag.id);
                    return (
                      <button key={tag.id} type="button" onClick={() => {
                        const ids = form.tagIds || [];
                        setForm({ ...form, tagIds: selected ? ids.filter((id: string) => id !== tag.id) : [...ids, tag.id] });
                      }} className={`text-xs px-2.5 py-1 rounded-full border transition-all ${selected ? 'border-transparent font-medium shadow-sm' : 'border-input text-muted-foreground hover:border-blue-300'}`} style={selected ? { backgroundColor: tag.color + '20', color: tag.color, borderColor: tag.color } : {}}>
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tipo: Única / Recorrente / Parcelada */}
            <div className="border border-input rounded-lg p-4 space-y-3">
              <label className="text-sm font-medium text-foreground">Tipo da Despesa</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm({ ...form, isRecurring: false, isInstallment: false })} className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${!form.isRecurring && !form.isInstallment ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-input text-muted-foreground hover:bg-muted'}`}>
                  Única
                </button>
                <button type="button" onClick={() => setForm({ ...form, isRecurring: true, isInstallment: false })} className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${form.isRecurring ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-input text-muted-foreground hover:bg-muted'}`}>
                  Recorrente
                </button>
                <button type="button" onClick={() => setForm({ ...form, isRecurring: false, isInstallment: true })} className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${form.isInstallment ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-input text-muted-foreground hover:bg-muted'}`}>
                  Parcelada
                </button>
              </div>
              {form.isRecurring && (
                <div>
                  <label className="text-sm font-medium text-foreground">Frequência</label>
                  <select value={form.recurrenceType ?? 'mensal'} onChange={(e: any) => setForm({ ...form, recurrenceType: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none">
                    {RECURRENCE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              )}
              {form.isInstallment && (
                <div>
                  <label className="text-sm font-medium text-foreground">Número de Parcelas</label>
                  <select value={form.totalInstallments ?? 2} onChange={(e: any) => setForm({ ...form, totalInstallments: parseInt(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none">
                    {[2,3,4,5,6,7,8,9,10,12,18,24,36,48].map(n => <option key={n} value={n}>{n}x de {form.amount ? formatCurrency(parseFloat(form.amount) / n) : '...'}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">O valor total será dividido em {form.totalInstallments || 2} parcelas iguais</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
              <Button type="submit" loading={saving} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white">{editingId ? 'Salvar' : 'Criar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
