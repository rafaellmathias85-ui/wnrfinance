'use client';
import { apiFetch } from '@/lib/fetch';
import { INCOME_TYPES, RECURRENCE_TYPES, formatDate, toInputDate } from '@/lib/format';
import { usePJ } from '@/lib/pj-context';
import { ExportButton } from '@/components/export-button';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Banknote, Briefcase, Building2, Calendar, ChevronLeft, ChevronRight, DollarSign, MoreHorizontal, Pencil, Plus, RefreshCw, Repeat, Search, Trash2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import BankFilter from '@/components/bank-filter';


interface Income {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: string;
  isRecurring: boolean;
  recurrenceType?: string | null;
  bankConnectionId?: string | null;
  bankConnection?: { id: string; bankName: string } | null;
}

const emptyForm = { description: '', amount: '', date: '', type: 'salario', isRecurring: false, recurrenceType: 'mensal', bankConnectionId: '' };

const typeIcons: Record<string, any> = { salario: Banknote, freelance: Briefcase, dividendos: DollarSign, aluguel: Building2, outros: MoreHorizontal };

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export default function ReceitasPage() {
  const formatCurrency = useFormatCurrency();
  const { activeEnv } = usePJ();
  const router = useRouter();
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBank, setFilterBank] = useState('todos');
  const [banks, setBanks] = useState<{ id: string; bankName: string }[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  useEffect(() => {
    if (activeEnv === 'pj') router.replace('/pj/contas-receber');
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
  }, []);

  const fetchIncomes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterBank !== 'todos') params.set('bankId', filterBank);
      const { startDate, endDate } = getMonthRange(selectedYear, selectedMonth);
      params.set('startDate', startDate);
      params.set('endDate', endDate);
      const res = await apiFetch(`/api/incomes?${params.toString()}`);
      const data = await res.json();
      setIncomes(data ?? []);
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, [filterBank, selectedMonth, selectedYear]);

  useEffect(() => { fetchIncomes(); }, [fetchIncomes]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingId ? `/api/incomes/${editingId}` : '/api/incomes';
      const method = editingId ? 'PUT' : 'POST';
      const payload = { ...form };
      if (!payload.bankConnectionId) delete payload.bankConnectionId;
      if (!payload.isRecurring) {
        delete payload.recurrenceType;
      }
      await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      fetchIncomes();
    } catch { /* noop */ } finally {
      setSaving(false);
    }
  };

  const handleEdit = (income: Income) => {
    setEditingId(income.id);
    setForm({
      description: income.description ?? '',
      amount: String(income.amount ?? ''),
      date: toInputDate(income.date),
      type: income.type ?? 'outros',
      isRecurring: income.isRecurring ?? false,
      recurrenceType: income.recurrenceType || 'mensal',
      bankConnectionId: income.bankConnectionId || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta receita?')) return;
    await apiFetch(`/api/incomes/${id}`, { method: 'DELETE' });
    fetchIncomes();
  };

  const filtered = (incomes ?? []).filter((inc) => (inc.description ?? '').toLowerCase().includes((searchTerm ?? '').toLowerCase()));
  const totalFiltered = filtered.reduce((sum, inc) => sum + (inc.amount ?? 0), 0);
  const recurringCount = filtered.filter(i => i.isRecurring).length;
  const recurringTotal = filtered.filter(i => i.isRecurring).reduce((sum, i) => sum + (i.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Receitas</h1>
          <p className="text-muted-foreground mt-1">Gerencie todas as suas fontes de renda</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton type="incomes" startDate={getMonthRange(selectedYear, selectedMonth).startDate} endDate={getMonthRange(selectedYear, selectedMonth).endDate} />
          <Button onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setDialogOpen(true); }} className="bg-blue-500 hover:bg-blue-600 text-white">
            <Plus className="w-4 h-4 mr-1" /> Nova Receita
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
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center"><TrendingUp className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Receitas</p>
                <p className="text-lg font-bold text-blue-600">{formatCurrency(totalFiltered)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center"><Repeat className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Receitas Recorrentes</p>
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

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar receitas..." value={searchTerm} onChange={(e: any) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <BankFilter value={filterBank} onChange={setFilterBank} />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{filtered.length} receita(s)</span>
            <span className="font-medium text-blue-600">Total: {formatCurrency(totalFiltered)}</span>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>Nenhuma receita encontrada</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((income, i) => {
              const Icon = typeIcons[income.type ?? 'outros'] ?? MoreHorizontal;
              const typeLabel = INCOME_TYPES.find((t: any) => t.value === income.type)?.label ?? income.type ?? '';
              return (
                <motion.div key={income.id} initial={{ y: 5 }} animate={{ y: 0 }} exit={{ x: -50 }} transition={{ delay: i * 0.02 }}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center flex-shrink-0"><Icon className="w-5 h-5" /></div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground truncate">{income.description}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 font-medium">{typeLabel}</span>
                              <span className="text-xs text-muted-foreground">{formatDate(income.date)}</span>
                              {income.isRecurring && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center gap-1">
                                  <Repeat className="w-3 h-3" />
                                  {RECURRENCE_TYPES.find(r => r.value === income.recurrenceType)?.label || 'Recorrente'}
                                </span>
                              )}
                              {income.bankConnection && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />{income.bankConnection.bankName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">{formatCurrency(income.amount)}</span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(income)}><Pencil className="w-4 h-4 text-muted-foreground" /></Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(income.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Receita' : 'Nova Receita'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Input value={form.description ?? ''} onChange={(e: any) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Salário mensal" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Valor (R$)</label>
                <Input type="number" step="0.01" min="0" value={form.amount ?? ''} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" required />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Tipo</label>
                <select value={form.type ?? 'outros'} onChange={(e: any) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none">
                  {INCOME_TYPES.map((t: any) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Data</label>
                <Input type="date" value={form.date ?? ''} onChange={(e: any) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Banco (opcional)</label>
                <select value={form.bankConnectionId || ''} onChange={(e: any) => setForm({ ...form, bankConnectionId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">Nenhum</option>
                  {banks.length > 0 ? banks.map(b => <option key={b.id} value={b.id}>{b.bankName}</option>) : <option disabled>Cadastre bancos primeiro</option>}
                </select>
              </div>
            </div>

            {/* Recurring toggle */}
            <div className="border border-input rounded-lg p-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={form.isRecurring ?? false}
                    onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-muted rounded-full peer peer-checked:bg-blue-500 transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Receita Recorrente</p>
                  <p className="text-xs text-muted-foreground">Salário, aluguel, dividendos, etc.</p>
                </div>
              </label>
              {form.isRecurring && (
                <div>
                  <label className="text-sm font-medium text-foreground">Frequência</label>
                  <select value={form.recurrenceType ?? 'mensal'} onChange={(e: any) => setForm({ ...form, recurrenceType: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none">
                    {RECURRENCE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
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
