'use client';
import { apiFetch } from '@/lib/fetch';
import { CARD_COLORS, EXPENSE_CATEGORIES } from '@/lib/format';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, CreditCard, Plus, Receipt, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import BankFilter from '@/components/bank-filter';


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

  useEffect(() => {
    apiFetch('/api/banks').then(r => r.json()).then(d => setBanks(d.connections?.filter((c: any) => c.status === 'active') || [])).catch(() => {});
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

  const totalInvoice = cards.reduce((s, c) => s + (c.currentInvoice || 0), 0);
  const totalLimit = cards.reduce((s, c) => s + c.cardLimit, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 text-xs font-semibold">
              <Briefcase className="w-3 h-3" /> PJ
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Cartões de Crédito da Empresa</h1>
          <p className="text-muted-foreground mt-1">Gerencie os cartões corporativos, limites e faturas.</p>
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
              <Input placeholder="Nome do cartão" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Banco" value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} />
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
                      <span className="font-bold text-red-600">{formatCurrency(card.currentInvoice)}</span>
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
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowTx(card.id)}>
                        <Receipt className="w-4 h-4 mr-1" />Lançamento
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => deleteCard(card.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {card.transactions?.length > 0 && (
                      <div className="border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Últimos lançamentos</p>
                        {card.transactions.slice(0, 3).map((tx: any) => (
                          <div key={tx.id} className="flex justify-between text-sm py-1">
                            <span className="text-gray-700">{tx.description}</span>
                            <span className="text-red-600 font-medium">{formatCurrency(tx.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
    </div>
  );
}
