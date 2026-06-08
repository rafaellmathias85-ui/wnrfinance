'use client';
import { apiFetch } from '@/lib/fetch';
import { INVESTMENT_TYPES, formatDate, toInputDate } from '@/lib/format';
import InvestmentChart from '@/components/investment-chart';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import BankFilter from '@/components/bank-filter';


export default function InvestimentosPage() {
  const formatCurrency = useFormatCurrency();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterBank, setFilterBank] = useState('todos');
  const [form, setForm] = useState({ name: '', type: 'renda_fixa', broker: '', amount: '', currentValue: '', purchaseDate: '', maturityDate: '', notes: '', bankConnectionId: '' });
  const [banks, setBanks] = useState<{ id: string; bankName: string }[]>([]);

  useEffect(() => {
    apiFetch('/api/banks').then(r => r.json()).then(d => setBanks(d.connections?.filter((c: any) => c.status === 'active') || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterBank !== 'todos') params.set('bankId', filterBank);
      const res = await apiFetch(`/api/investments?${params.toString()}`);
      setData(await res.json());
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [filterBank]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `/api/investments/${editId}` : '/api/investments';
    await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setShowAdd(false); setEditId(null);
    setForm({ name: '', type: 'renda_fixa', broker: '', amount: '', currentValue: '', purchaseDate: '', maturityDate: '', notes: '', bankConnectionId: '' });
    load();
  };

  const edit = (inv: any) => {
    setEditId(inv.id);
    setForm({ name: inv.name, type: inv.type, broker: inv.broker || '', amount: String(inv.amount), currentValue: String(inv.currentValue), purchaseDate: toInputDate(inv.purchaseDate), maturityDate: toInputDate(inv.maturityDate), notes: inv.notes || '', bankConnectionId: inv.bankConnectionId || '' });
    setShowAdd(true);
  };

  const del = async (id: string) => {
    if (!confirm('Excluir investimento?')) return;
    await apiFetch(`/api/investments/${id}`, { method: 'DELETE' });
    load();
  };

  const summary = data?.summary;
  const investments = data?.investments || [];
  const byType = data?.byType || {};
  const pieData = Object.entries(byType).map(([type, val]: any) => ({ name: INVESTMENT_TYPES.find(t => t.value === type)?.label || type, value: val.current }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl lg:text-3xl font-bold text-foreground">Investimentos</h1><p className="text-muted-foreground mt-1">Acompanhe seu portfólio</p></div>
        <div className="flex items-center gap-3">
          <BankFilter value={filterBank} onChange={(v) => { setFilterBank(v); setLoading(true); }} />
        </div>
        <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) setEditId(null); }}>
          <DialogTrigger asChild><Button className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" />Novo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Novo'} Investimento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <select className="w-full rounded-md border border-input p-2 text-sm" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {INVESTMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <Input placeholder="Corretora" value={form.broker} onChange={e => setForm({ ...form, broker: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Valor Investido</label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground">Valor Atual</label><Input type="number" value={form.currentValue} onChange={e => setForm({ ...form, currentValue: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Data Compra</label><Input type="date" value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground">Vencimento</label><Input type="date" value={form.maturityDate} onChange={e => setForm({ ...form, maturityDate: e.target.value })} /></div>
              </div>
              <Input placeholder="Observações" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              <Button onClick={save} className="w-full bg-blue-600 hover:bg-blue-700">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="shadow-sm"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total Investido</p><p className="text-xl font-bold text-foreground">{formatCurrency(summary.totalInvested)}</p></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Valor Atual</p><p className="text-xl font-bold text-blue-600">{formatCurrency(summary.totalCurrent)}</p></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Rentabilidade</p><p className={`text-xl font-bold ${summary.totalReturn >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(summary.totalReturn)}</p></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Retorno %</p><p className={`text-xl font-bold ${summary.returnPct >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{summary.returnPct.toFixed(2)}%</p></CardContent></Card>
        </div>
      )}

      {pieData.length > 0 && (
        <Card className="shadow-sm"><CardHeader><CardTitle className="text-lg">Distribuição por Tipo</CardTitle></CardHeader>
          <CardContent><InvestmentChart data={pieData} /></CardContent></Card>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" /></div>
      ) : investments.length === 0 ? (
        <Card className="shadow-sm"><CardContent className="py-16 text-center text-muted-foreground"><LineChart className="w-12 h-12 mx-auto mb-4 text-muted-foreground" /><p>Nenhum investimento cadastrado</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {investments.map((inv: any, i: number) => {
            const ret = inv.currentValue - inv.amount;
            const retPct = inv.amount > 0 ? ((ret / inv.amount) * 100) : 0;
            return (
              <motion.div key={inv.id} initial={{ opacity: 0.6, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="shadow-sm hover:shadow-md transition-shadow"><CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div><p className="font-semibold text-foreground">{inv.name}</p><p className="text-xs text-muted-foreground">{INVESTMENT_TYPES.find(t => t.value === inv.type)?.label}{inv.broker ? ` • ${inv.broker}` : ''}</p></div>
                    <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => edit(inv)}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="sm" className="text-red-600" onClick={() => del(inv.id)}><Trash2 className="w-4 h-4" /></Button></div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                    <div><p className="text-muted-foreground">Investido</p><p className="font-medium">{formatCurrency(inv.amount)}</p></div>
                    <div><p className="text-muted-foreground">Atual</p><p className="font-medium text-blue-600">{formatCurrency(inv.currentValue)}</p></div>
                    <div><p className="text-muted-foreground">Retorno</p><p className={`font-medium ${ret >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{retPct.toFixed(1)}%</p></div>
                  </div>
                  {inv.purchaseDate && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Compra: {formatDate(inv.purchaseDate)}{inv.maturityDate ? ` • Vence: ${formatDate(inv.maturityDate)}` : ''}</p>}
                </CardContent></Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
