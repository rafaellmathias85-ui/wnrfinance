'use client';
import { apiFetch } from '@/lib/fetch';
import { CARD_COLORS, EXPENSE_CATEGORIES } from '@/lib/format';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CreditCard, FileText, Pencil, Plus, Receipt, Trash2, Upload, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import BankFilter from '@/components/bank-filter';

const CHART_COLORS = ['#2563EB', '#16A34A', '#DC2626', '#D97706', '#7C3AED', '#0891B2', '#BE185D', '#059669', '#B45309', '#6B7280'];

function getBillingCycles(transactions: any[], closingDay: number, dueDay: number, cardName: string) {
  if (!transactions?.length) return [];
  const cycles: Record<string, { label: string; start: Date; end: Date; transactions: any[]; total: number }> = {};
  for (const tx of transactions) {
    const d = new Date(tx.date);
    let cycleYear = d.getFullYear();
    let cycleMonth = d.getMonth() + 1;
    if (d.getDate() > closingDay) { cycleMonth++; if (cycleMonth > 12) { cycleMonth = 1; cycleYear++; } }
    const key = `${cycleYear}-${String(cycleMonth).padStart(2, '0')}`;
    if (!cycles[key]) {
      const label = `Fatura ${new Date(cycleYear, cycleMonth - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
      const start = new Date(cycleYear, cycleMonth - 2, closingDay + 1);
      const end = new Date(cycleYear, cycleMonth - 1, closingDay, 23, 59, 59);
      cycles[key] = { label, start, end, transactions: [], total: 0 };
    }
    cycles[key].transactions.push(tx);
    cycles[key].total += tx.amount;
  }
  return Object.entries(cycles).sort(([a], [b]) => b.localeCompare(a)).map(([, v]) => v);
}


export default function CartoesPage() {
  const formatCurrency = useFormatCurrency();
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showTx, setShowTx] = useState<string | null>(null);
  const [filterBank, setFilterBank] = useState('todos');
  const [form, setForm] = useState({ name: '', bank: '', lastFour: '', cardLimit: '', closingDay: '', dueDay: '', color: '#2563EB', bankConnectionId: '' });
  const [txForm, setTxForm] = useState({ description: '', amount: '', category: 'Outros', date: '', installments: '1' });
  const [banks, setBanks] = useState<{ id: string; bankName: string }[]>([]);
  const [showImportFatura, setShowImportFatura] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [estimatedAmounts, setEstimatedAmounts] = useState<Record<string, string>>({});
  const [savingEstimate, setSavingEstimate] = useState<string | null>(null);
  const [expandedCycle, setExpandedCycle] = useState<Record<string, string>>({});
  const [editCard, setEditCard] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', bank: '', lastFour: '', cardLimit: '', closingDay: '', dueDay: '', color: '#2563EB', bankConnectionId: '' });

  useEffect(() => {
    apiFetch('/api/banks').then(r => r.json()).then(d => setBanks(d.connections?.filter((c: any) => c.status?.toLowerCase() === 'active') || [])).catch(() => {});
  }, []);

  const loadCards = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterBank !== 'todos') params.set('bankId', filterBank);
      const res = await apiFetch(`/api/cards?${params.toString()}`);
      const data = await res.json();
      setCards(Array.isArray(data) ? data : []);
    } catch { setCards([]); }
    finally { setLoading(false); }
  }, [filterBank]);

  useEffect(() => { loadCards(); }, [loadCards]);

  const addCard = async () => {
    await apiFetch('/api/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setShowAdd(false);
    setForm({ name: '', bank: '', lastFour: '', cardLimit: '', closingDay: '', dueDay: '', color: '#2563EB', bankConnectionId: '' });
    loadCards();
  };

  const deleteCard = async (id: string) => {
    if (!confirm('Excluir este cartão?')) return;
    await apiFetch(`/api/cards/${id}`, { method: 'DELETE' });
    loadCards();
  };

  const addTx = async () => {
    if (!showTx) return;
    await apiFetch(`/api/cards/${showTx}/transactions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(txForm),
    });
    setShowTx(null);
    setTxForm({ description: '', amount: '', category: 'Outros', date: '', installments: '1' });
    loadCards();
  };

  const [importLoading, setImportLoading] = useState(false);

  const handleImportFatura = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !showImportFatura) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let transactions: any[] = [];

      if (ext === 'pdf') {
        // Use LLM API to parse PDF
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'fatura');
        const res = await apiFetch('/api/parse-pdf', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.error) {
          setImportResult({ error: data.error });
          setImportLoading(false);
          return;
        }
        transactions = (data.transactions || []).map((t: any) => ({
          description: t.description || '',
          amount: Math.abs(parseFloat(t.amount) || 0),
          category: t.category || 'Outros',
          date: t.date || '',
          installments: t.installments || 1,
        })).filter((t: any) => t.description && t.amount && t.date);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = (await import('xlsx')).default;
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        transactions = rows.map(r => {
          const keys = Object.keys(r);
          const findKey = (patterns: string[]) => keys.find(k => patterns.some(p => k.toLowerCase().includes(p))) || '';
          const desc = r[findKey(['descri', 'estabelecimento', 'historico', 'nome', 'lancamento'])] || '';
          const amt = String(r[findKey(['valor', 'amount', 'value', 'quantia'])] || '').replace(',', '.');
          let date = r[findKey(['data', 'date', 'vencimento'])] || '';
          if (typeof date === 'number') {
            const d = XLSX.SSF.parse_date_code(date);
            date = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
          } else if (typeof date === 'string' && date.includes('/')) {
            const parts = date.split('/');
            if (parts.length === 3) date = parts[2].length === 4 ? `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}` : `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
          const cat = r[findKey(['categoria', 'category'])] || 'Outros';
          return { description: desc, amount: Math.abs(parseFloat(amt) || 0), category: cat, date, installments: 1 };
        }).filter(t => t.description && t.amount && t.date);
      } else {
        const text = await file.text();
        const lines = text.trim().split('\n');
        const sep = lines[0].includes(';') ? ';' : ',';
        const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ''));
        transactions = lines.slice(1).map(line => {
          const vals = line.split(sep).map(v => v.trim().replace(/"/g, ''));
          const obj: any = { installments: 1, category: 'Outros' };
          header.forEach((h, i) => {
            if (h.includes('descri') || h.includes('estabelecimento')) obj.description = vals[i];
            else if (h.includes('valor') || h.includes('amount')) obj.amount = Math.abs(parseFloat(vals[i]?.replace(',', '.') || '0'));
            else if (h.includes('data') || h.includes('date')) obj.date = vals[i];
            else if (h.includes('parcela') || h.includes('installment')) obj.installments = parseInt(vals[i]) || 1;
            else if (h.includes('categoria') || h.includes('category')) obj.category = vals[i];
          });
          return obj;
        }).filter(t => t.description && t.amount && t.date);
      }

      if (transactions.length === 0) {
        setImportResult({ error: 'Nenhuma transação encontrada no arquivo.' });
        setImportLoading(false);
        return;
      }

      let imported = 0;
      for (const tx of transactions) {
        try {
          await apiFetch(`/api/cards/${showImportFatura}/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tx),
          });
          imported++;
        } catch { /* skip */ }
      }
      const categories: Record<string, number> = {};
      let actualTotal = 0;
      transactions.forEach((tx: any) => {
        const cat = tx.category || 'Outros';
        categories[cat] = (categories[cat] || 0) + tx.amount;
        actualTotal += tx.amount;
      });

      // Finaliza fatura atual e rola estimativa pro próximo mês
      const cardInfo = cards.find(c => c.id === showImportFatura);
      const estimatedAmt = parseFloat(estimatedAmounts[showImportFatura] || '0') || actualTotal;
      if (showImportFatura) {
        const now = new Date();
        await apiFetch(`/api/cards/${showImportFatura}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actualTotal,
            estimatedAmount: estimatedAmt,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          }),
        }).catch(() => {});
      }

      setImportResult({ imported, total: transactions.length, categories, actualTotal });
      loadCards();
    } catch (err: any) {
      setImportResult({ error: err.message });
    } finally {
      setImportLoading(false);
    }
  };

  const openEdit = (card: any) => {
    setEditCard(card);
    setEditForm({
      name: card.name || '',
      bank: card.bank || '',
      lastFour: card.lastFour || '',
      cardLimit: String(card.cardLimit || ''),
      closingDay: String(card.closingDay || ''),
      dueDay: String(card.dueDay || ''),
      color: card.color || '#2563EB',
      bankConnectionId: card.bankConnectionId || '',
    });
  };

  const saveEdit = async () => {
    if (!editCard) return;
    await apiFetch(`/api/cards/${editCard.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    setEditCard(null);
    loadCards();
  };

  const saveEstimate = async (cardId: string) => {
    const amount = parseFloat(estimatedAmounts[cardId] || '');
    if (!amount || amount <= 0) return;
    setSavingEstimate(cardId);
    try {
      await apiFetch(`/api/cards/${cardId}/estimated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
    } catch { /* silent */ }
    setSavingEstimate(null);
  };

  const totalInvoice = cards.reduce((s, c) => s + (c.currentInvoice || 0), 0);
  const totalLimit = cards.reduce((s, c) => s + c.cardLimit, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Cartões de Crédito</h1>
          <p className="text-muted-foreground mt-1">Gerencie seus cartões e faturas</p>
        </div>
        <div className="flex items-center gap-3">
          <BankFilter value={filterBank} onChange={(v) => { setFilterBank(v); setLoading(true); }} />
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" />Novo Cartão</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Adicionar Cartão</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Nome do cartão (ex: Personalite)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Banco (ex: Itaú, Bradesco)" value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} />
              <select
                className="w-full rounded-md border border-input p-2 text-sm bg-background"
                value={form.bankConnectionId}
                onChange={e => setForm({ ...form, bankConnectionId: e.target.value })}
              >
                <option value="">Conta bancária vinculada (opcional)</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.bankName}</option>)}
              </select>
              <Input placeholder="Últimos 4 dígitos" maxLength={4} value={form.lastFour} onChange={e => setForm({ ...form, lastFour: e.target.value })} />
              <Input type="number" placeholder="Limite" value={form.cardLimit} onChange={e => setForm({ ...form, cardLimit: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" placeholder="Dia fechamento" min={1} max={31} value={form.closingDay} onChange={e => setForm({ ...form, closingDay: e.target.value })} />
                <Input type="number" placeholder="Dia vencimento" min={1} max={31} value={form.dueDay} onChange={e => setForm({ ...form, dueDay: e.target.value })} />
              </div>
              <div className="flex gap-2 flex-wrap">
                {CARD_COLORS.map(c => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })} className={`w-8 h-8 rounded-full border-2 transition-transform ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <Button onClick={addCard} className="w-full bg-blue-600 hover:bg-blue-700">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm"><CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Total Faturas</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(totalInvoice)}</p>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Limite Total</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalLimit)}</p>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Disponível</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalLimit - totalInvoice)}</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" /></div>
      ) : cards.length === 0 ? (
        <Card className="shadow-sm"><CardContent className="py-16 text-center text-muted-foreground">
          <CreditCard className="w-12 h-12 mx-auto mb-4 text-foreground" />
          <p>Nenhum cartão cadastrado</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((card, i) => {
            const usedPct = card.cardLimit > 0 ? (card.currentInvoice / card.cardLimit) * 100 : 0;
            return (
              <motion.div key={card.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <Card className="shadow-sm overflow-hidden">
                  <div className="p-6 text-white" style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}dd)` }}>
                    <div className="flex justify-between items-start mb-6">
                      <div><p className="text-white/80 text-sm">{card.bank}</p><p className="text-lg font-bold">{card.name}</p></div>
                      <CreditCard className="w-8 h-8 text-white/60" />
                    </div>
                    <p className="text-lg tracking-widest font-mono">•••• •••• •••• {card.lastFour}</p>
                    <div className="mt-4 flex justify-between text-sm text-white/80">
                      <span>Fecha dia {card.closingDay}</span><span>Vence dia {card.dueDay}</span>
                    </div>
                  </div>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Fatura atual</span>
                      <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(card.currentInvoice)}</span>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Limite utilizado</span><span>{usedPct.toFixed(0)}%</span></div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className={`h-2.5 rounded-full ${usedPct >= 80 ? 'bg-red-500' : usedPct >= 50 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>Disponível: {formatCurrency(card.available)}</span><span>Limite: {formatCurrency(card.cardLimit)}</span>
                      </div>
                    </div>
                    <div className="border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Estimativa da fatura</p>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Valor estimado R$"
                          value={estimatedAmounts[card.id] || ''}
                          onChange={e => setEstimatedAmounts(prev => ({ ...prev, [card.id]: e.target.value }))}
                          className="h-8 text-sm"
                        />
                        <Button size="sm" variant="outline" onClick={() => saveEstimate(card.id)} disabled={savingEstimate === card.id} className="h-8 shrink-0 text-xs">
                          {savingEstimate === card.id ? '...' : 'Salvar'}
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Lança automaticamente em Despesas como pendente</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowTx(card.id)}>
                        <Receipt className="w-4 h-4 mr-1" />Lançamento
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowImportFatura(card.id); setImportResult(null); }}>
                        <Upload className="w-4 h-4 mr-1" />Importar Fatura
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(card)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => deleteCard(card.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {card.transactions?.length > 0 && (() => {
                      const cycles = getBillingCycles(card.transactions, card.closingDay || 1, card.dueDay || 10, card.name);
                      const catTotals: Record<string, number> = {};
                      card.transactions.forEach((tx: any) => { catTotals[tx.category || 'Outros'] = (catTotals[tx.category || 'Outros'] || 0) + tx.amount; });
                      const chartData = Object.entries(catTotals).sort(([,a],[,b]) => b-a).map(([name, value]) => ({ name, value }));
                      return (
                        <div className="border-t pt-3 space-y-3">
                          {/* Chart de gastos por categoria */}
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Gastos por categoria</p>
                            <ResponsiveContainer width="100%" height={120}>
                              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                                <Tooltip formatter={(v: any) => `R$ ${Number(v).toFixed(2)}`} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                  {chartData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          {/* Transações agrupadas por ciclo de fatura */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">Faturas</p>
                            {cycles.map((cycle, ci) => {
                              const cycleKey = `${card.id}-${ci}`;
                              const isOpen = expandedCycle[cycleKey] !== 'closed';
                              return (
                                <div key={cycleKey} className="border rounded-lg overflow-hidden">
                                  <button
                                    onClick={() => setExpandedCycle(prev => ({ ...prev, [cycleKey]: isOpen ? 'closed' : 'open' }))}
                                    className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/60 text-left"
                                  >
                                    <div className="flex items-center gap-2">
                                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                                      <span className="text-xs font-medium capitalize">{cycle.label}</span>
                                    </div>
                                    <span className="text-xs font-bold text-red-600 dark:text-red-400">{formatCurrency(cycle.total)}</span>
                                  </button>
                                  {isOpen && (
                                    <div className="divide-y divide-border max-h-48 overflow-y-auto">
                                      {cycle.transactions.map((tx: any) => (
                                        <div key={tx.id} className="flex justify-between text-xs py-1.5 px-3 hover:bg-muted/30">
                                          <div className="min-w-0 flex-1 mr-2">
                                            <span className="truncate block text-foreground">{tx.description}</span>
                                            <span className="text-muted-foreground">{new Date(tx.date).toLocaleDateString('pt-BR')} · {tx.category}</span>
                                          </div>
                                          <span className="font-medium text-red-600 dark:text-red-400 whitespace-nowrap">{formatCurrency(tx.amount)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={!!showTx} onOpenChange={() => setShowTx(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 px-3 py-2 rounded-md">
              💡 Este lançamento será automaticamente adicionado em Despesas como pendente.
            </p>
            <Input placeholder="Descrição" value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })} />
            <Input type="number" placeholder="Valor" value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} />
            <select className="w-full rounded-md border border-input p-2 text-sm" value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <Input type="date" value={txForm.date} onChange={e => setTxForm({ ...txForm, date: e.target.value })} />
            <Input type="number" placeholder="Parcelas" min={1} value={txForm.installments} onChange={e => setTxForm({ ...txForm, installments: e.target.value })} />
            <Button onClick={addTx} className="w-full bg-blue-600 hover:bg-blue-700">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editCard} onOpenChange={v => { if (!v) setEditCard(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Cartão</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome do cartão" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            <Input placeholder="Banco (ex: Itaú, Bradesco)" value={editForm.bank} onChange={e => setEditForm({ ...editForm, bank: e.target.value })} />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Conta bancária vinculada</label>
              <select
                className="w-full rounded-md border border-input p-2 text-sm bg-background"
                value={editForm.bankConnectionId}
                onChange={e => setEditForm({ ...editForm, bankConnectionId: e.target.value })}
              >
                <option value="">Nenhuma conta vinculada</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.bankName}</option>)}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Vincular ao banco correto habilita o filtro por banco e a seleção automática de conta nas despesas</p>
            </div>
            <Input placeholder="Últimos 4 dígitos" maxLength={4} value={editForm.lastFour} onChange={e => setEditForm({ ...editForm, lastFour: e.target.value })} />
            <Input type="number" placeholder="Limite" value={editForm.cardLimit} onChange={e => setEditForm({ ...editForm, cardLimit: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" placeholder="Dia fechamento" min={1} max={31} value={editForm.closingDay} onChange={e => setEditForm({ ...editForm, closingDay: e.target.value })} />
              <Input type="number" placeholder="Dia vencimento" min={1} max={31} value={editForm.dueDay} onChange={e => setEditForm({ ...editForm, dueDay: e.target.value })} />
            </div>
            <div className="flex gap-2 flex-wrap">
              {CARD_COLORS.map(c => (
                <button key={c} onClick={() => setEditForm({ ...editForm, color: c })} className={`w-8 h-8 rounded-full border-2 transition-transform ${editForm.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
            <Button onClick={saveEdit} className="w-full bg-blue-600 hover:bg-blue-700">Salvar alterações</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showImportFatura} onOpenChange={() => { setShowImportFatura(null); setImportResult(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Importar Fatura</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Importe a fatura do seu cartão a partir de um arquivo <strong>PDF</strong>, CSV ou Excel.
              Para PDF, a IA irá extrair automaticamente as transações.
            </p>
            <div className="border-2 border-dashed border-gray-300 dark:border-border rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
              {importLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">Processando arquivo com IA...</p>
                  <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos para PDFs</p>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <label className="cursor-pointer">
                    <span className="text-sm text-blue-600 hover:text-blue-700 font-medium">Clique para selecionar arquivo</span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.csv,.xlsx,.xls"
                      onChange={handleImportFatura}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">PDF, CSV, XLSX ou XLS</p>
                </>
              )}
            </div>
            {importResult && (
              <div className={`p-3 rounded-lg text-sm ${importResult.error ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'}`}>
                {importResult.error
                  ? <span>Erro: {importResult.error}</span>
                  : <div>
                      <p className="font-medium">{importResult.imported} de {importResult.total} transações importadas!</p>
                      {importResult.actualTotal > 0 && (
                        <p className="text-xs mt-1">Total da fatura: <strong>R$ {importResult.actualTotal.toFixed(2)}</strong> — despesa definitiva criada e estimativa do próximo mês gerada automaticamente.</p>
                      )}
                      {importResult.categories && Object.keys(importResult.categories).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                          <p className="text-xs font-semibold mb-1.5">Gastos por categoria (IA):</p>
                          <div className="space-y-0.5">
                            {Object.entries(importResult.categories)
                              .sort(([, a], [, b]) => (b as number) - (a as number))
                              .map(([cat, val]) => (
                                <div key={cat} className="flex justify-between text-xs">
                                  <span>{cat}</span>
                                  <span className="font-medium">R$ {(val as number).toFixed(2)}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                }
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
