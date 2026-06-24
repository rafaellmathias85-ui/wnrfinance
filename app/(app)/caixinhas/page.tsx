'use client';
import { apiFetch } from '@/lib/fetch';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { SAVINGS_CATEGORIES } from '@/lib/format';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PiggyBank, Plus, Trash2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useFormatCurrency } from '@/hooks/use-format-currency';



export default function CaixinhasPage() {
  const formatCurrency = useFormatCurrency();
  const [boxes, setBoxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [actionBox, setActionBox] = useState<{ id: string; action: 'add' | 'remove' } | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [form, setForm] = useState({ name: '', goal: '', emoji: '🎯', category: 'outros', targetDate: '', annualYield: '' });

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/savings');
      const data = await res.json();
      setBoxes(Array.isArray(data) ? data : []);
    } catch { setBoxes([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addBox = async () => {
    await apiFetch('/api/savings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, goal: parseFloat(form.goal), emoji: form.emoji, category: form.category, targetDate: form.targetDate || undefined }),
    });
    setShowAdd(false);
    setForm({ name: '', goal: '', emoji: '🎯', category: 'outros', targetDate: '', annualYield: '' });
    load();
  };

  const performAction = async () => {
    if (!actionBox || !actionAmount) return;
    await apiFetch(`/api/savings/${actionBox.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: actionBox.action, amount: parseFloat(actionAmount), notes: actionNotes }),
    });
    setActionBox(null);
    setActionAmount('');
    setActionNotes('');
    load();
  };

  const deleteBox = async (id: string) => {
    if (!confirm('Excluir esta caixinha?')) return;
    await apiFetch(`/api/savings/${id}`, { method: 'DELETE' });
    load();
  };

  const totalSaved = boxes.reduce((s, b) => s + b.balance, 0);
  const totalGoal = boxes.reduce((s, b) => s + b.goal, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Caixinhas de Economia</h1>
          <p className="text-muted-foreground mt-1">Organize suas metas financeiras</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-amber-500 hover:bg-amber-600 text-foreground"><Plus className="w-4 h-4 mr-2" />Nova Caixinha</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Caixinha</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {SAVINGS_CATEGORIES.map(cat => (
                  <button key={cat.value} onClick={() => setForm({ ...form, category: cat.value, emoji: cat.emoji, name: form.name || cat.label })}
                    className={`p-3 rounded-lg border text-center transition-all ${form.category === cat.value ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-300'}`}>
                    <span className="text-2xl">{cat.emoji}</span>
                    <p className="text-xs mt-1 text-gray-600">{cat.label}</p>
                  </button>
                ))}
              </div>
              <Input placeholder="Nome da caixinha" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Input type="number" placeholder="Meta (R$)" value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })} />
              <Input type="number" step="0.01" placeholder="Rendimento anual % (ex: 12.5)" value={form.annualYield} onChange={e => setForm({ ...form, annualYield: e.target.value })} />
              <div><label className="text-xs text-muted-foreground">Data alvo (opcional)</label>
                <Input type="date" value={form.targetDate} onChange={e => setForm({ ...form, targetDate: e.target.value })} />
              </div>
              <Button onClick={addBox} className="w-full bg-amber-500 hover:bg-amber-600">Criar Caixinha</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm bg-gradient-to-br from-amber-50 to-amber-100/50">
          <CardContent className="p-5"><p className="text-sm text-amber-700">Total Guardado</p><p className="text-2xl font-bold text-amber-600">{formatCurrency(totalSaved)}</p></CardContent>
        </Card>
        <Card className="shadow-sm"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Meta Total</p><p className="text-2xl font-bold text-foreground">{formatCurrency(totalGoal)}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Progresso Geral</p><p className="text-2xl font-bold text-blue-600">{totalGoal > 0 ? ((totalSaved / totalGoal) * 100).toFixed(1) : 0}%</p></CardContent></Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500" /></div>
      ) : boxes.length === 0 ? (
        <Card className="shadow-sm"><CardContent className="py-16 text-center text-muted-foreground">
          <PiggyBank className="w-12 h-12 mx-auto mb-4 text-foreground" />
          <p>Nenhuma caixinha criada</p><p className="text-sm mt-1">Crie sua primeira meta de economia!</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boxes.map((box, i) => {
            const pct = box.goal > 0 ? Math.min((box.balance / box.goal) * 100, 100) : 0;
            const isComplete = pct >= 100;
            const cat = SAVINGS_CATEGORIES.find(c => c.value === box.category);
            const monthlyNeeded = box.targetDate && box.goal > box.balance
              ? (() => {
                  const months = Math.max(1, Math.ceil((new Date(box.targetDate).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000)));
                  return (box.goal - box.balance) / months;
                })()
              : null;

            return (
              <motion.div key={box.id} initial={{ scale: 0.98 }} animate={{ scale: 1 }} transition={{ duration: 0.2 }}>
                <Card className={`shadow-sm hover:shadow-md transition-all ${isComplete ? 'ring-2 ring-blue-400' : ''}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{box.emoji || cat?.emoji || '🎯'}</span>
                        <div>
                          <p className="font-semibold text-gray-900">{box.name}</p>
                          <p className="text-xs text-muted-foreground">{cat?.label || box.category}</p>
                        </div>
                      </div>
                      {isComplete && <Trophy className="w-6 h-6 text-amber-500" />}
                    </div>
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{formatCurrency(box.balance)}</span>
                        <span className="font-medium text-gray-700">{formatCurrency(box.goal)}</span>
                      </div>
                      <Progress value={pct} className="h-3" />
                      <p className="text-right text-xs text-gray-600 mt-1">{pct.toFixed(1)}%</p>
                    </div>
                    {monthlyNeeded && (
                      <p className="text-xs text-amber-600 mb-3">
                        💡 Guarde {formatCurrency(monthlyNeeded)}/mês para atingir a meta
                      </p>
                    )}
                    {box.targetDate && (
                      <p className="text-xs text-gray-600 mb-1">
                        Meta: {new Date(box.targetDate).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                    {box.balance > 0 && (
                      <p className="text-xs text-green-600 mb-3">
                        Rendimento anual estimado (CDI ~13%): +{formatCurrency(box.balance * 0.13)}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700"
                        onClick={() => setActionBox({ id: box.id, action: 'add' })}>
                        <ArrowUpCircle className="w-4 h-4 mr-1" />Depositar
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1"
                        onClick={() => setActionBox({ id: box.id, action: 'remove' })}>
                        <ArrowDownCircle className="w-4 h-4 mr-1" />Retirar
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteBox(box.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Action dialog */}
      <Dialog open={!!actionBox} onOpenChange={() => setActionBox(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{actionBox?.action === 'add' ? 'Depositar' : 'Retirar'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input type="number" placeholder="Valor (R$)" value={actionAmount} onChange={e => setActionAmount(e.target.value)} />
            <Input placeholder="Observação (opcional)" value={actionNotes} onChange={e => setActionNotes(e.target.value)} />
            <Button onClick={performAction} className={`w-full ${actionBox?.action === 'add' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
              {actionBox?.action === 'add' ? 'Depositar' : 'Retirar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
