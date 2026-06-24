'use client';
import { apiFetch } from '@/lib/fetch';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, Pencil, Plus, Target, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFormatCurrency } from '@/hooks/use-format-currency';



interface CostCenter {
  id: string;
  name: string;
  code: string | null;
}

interface CostCenterMetrics {
  centerId: string;
  name: string;
  code: string | null;
  totalPayables: number;
  totalReceivables: number;
  balance: number;
  payableCount: number;
  receivableCount: number;
}

export default function CentrosCustoPage() {
  const formatCurrency = useFormatCurrency();
  const { activeCompanyId, activeEnv } = usePJ();
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [metrics, setMetrics] = useState<CostCenterMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', code: '' });
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'analytics'>('list');

  const load = useCallback(async () => {
    try {
      const [centersRes, metricsRes] = await Promise.all([
        apiFetch('/api/pj/cost-centers').then(r => r.json()),
        apiFetch('/api/pj/cost-centers/metrics').then(r => r.json()).catch(() => []),
      ]);
      setCenters(Array.isArray(centersRes) ? centersRes : []);
      setMetrics(Array.isArray(metricsRes) ? metricsRes : []);
    } catch { setCenters([]); setMetrics([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingId ? `/api/pj/cost-centers/${editingId}` : '/api/pj/cost-centers';
      const method = editingId ? 'PUT' : 'POST';
      await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ name: '', code: '' });
      load();
    } catch { /* noop */ }
    finally { setSaving(false); }
  };

  const handleEdit = (center: CostCenter) => {
    setEditingId(center.id);
    setForm({ name: center.name, code: center.code || '' });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este centro de custos? Contas vinculadas perderao o vinculo.')) return;
    await apiFetch(`/api/pj/cost-centers/${id}`, { method: 'DELETE' });
    load();
  };

  if (activeEnv !== 'pj' || !activeCompanyId) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Selecione uma empresa para gerenciar centros de custo.</p>
        </CardContent></Card>
      </div>
    );
  }

  const totalPayables = metrics.reduce((s, m) => s + m.totalPayables, 0);
  const totalReceivables = metrics.reduce((s, m) => s + m.totalReceivables, 0);
  const totalBalance = totalReceivables - totalPayables;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Centros de Custo</h1>
          <p className="text-muted-foreground mt-1">Gerencie e analise departamentos e centros de custo</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-input overflow-hidden">
            <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 text-sm ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}>Lista</button>
            <button onClick={() => setViewMode('analytics')} className={`px-3 py-1.5 text-sm ${viewMode === 'analytics' ? 'bg-blue-500 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
              <BarChart3 className="w-4 h-4 inline mr-1" />Analise
            </button>
          </div>
          <Button onClick={() => { setEditingId(null); setForm({ name: '', code: '' }); setDialogOpen(true); }} className="bg-blue-500 hover:bg-blue-600 text-foreground">
            <Plus className="w-4 h-4 mr-1" /> Novo Centro
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center"><TrendingDown className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Despesas</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(totalPayables)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center"><TrendingUp className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Receitas</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(totalReceivables)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${totalBalance >= 0 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'}`}>
                <Target className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Resultado</p>
                <p className={`text-lg font-bold ${totalBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(totalBalance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : centers.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Nenhum centro de custos cadastrado</p>
          <p className="text-sm mt-1">Crie centros de custo para organizar despesas e receitas por departamento.</p>
        </CardContent></Card>
      ) : viewMode === 'list' ? (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {centers.map((center, i) => {
              const m = metrics.find(x => x.centerId === center.id);
              return (
                <motion.div key={center.id} initial={{ y: 5 }} animate={{ y: 0 }} exit={{ x: -50 }} transition={{ delay: i * 0.02 }}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                            <Target className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{center.name}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              {center.code && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{center.code}</span>}
                              {m && (
                                <>
                                  <span className="text-xs text-red-600">{m.payableCount} despesas ({formatCurrency(m.totalPayables)})</span>
                                  <span className="text-xs text-muted-foreground">|</span>
                                  <span className="text-xs text-green-600">{m.receivableCount} receitas ({formatCurrency(m.totalReceivables)})</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${m.balance > 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : m.balance === 0 ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{m.balance > 0 ? 'Saudavel' : m.balance === 0 ? 'Neutro' : 'Deficit'}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {m && (
                            <span className={`font-bold whitespace-nowrap ${m.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(m.balance)}
                            </span>
                          )}
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(center)}><Pencil className="w-4 h-4 text-muted-foreground" /></Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(center.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
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
      ) : (
        /* Analytics view */
        <div className="space-y-4">
          {metrics.filter(m => m.totalPayables > 0 || m.totalReceivables > 0).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma movimentacao vinculada a centros de custo.</p>
            </CardContent></Card>
          ) : (
            metrics.filter(m => m.totalPayables > 0 || m.totalReceivables > 0).map(m => {
              const maxVal = Math.max(m.totalPayables, m.totalReceivables, 1);
              return (
                <Card key={m.centerId} className="shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold text-foreground">{m.name}</p>
                        {m.code && <span className="text-xs text-muted-foreground">{m.code}</span>}
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm font-bold ${m.balance >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {m.balance >= 0 ? '+' : ''}{formatCurrency(m.balance)}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-green-600">Receitas ({m.receivableCount})</span>
                          <span className="font-medium text-green-600">{formatCurrency(m.totalReceivables)}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-muted rounded-full h-2">
                          <div className="bg-green-500 h-2 rounded-full" style={{ width: `${(m.totalReceivables / maxVal) * 100}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-red-600">Despesas ({m.payableCount})</span>
                          <span className="font-medium text-red-600">{formatCurrency(m.totalPayables)}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-muted rounded-full h-2">
                          <div className="bg-red-500 h-2 rounded-full" style={{ width: `${(m.totalPayables / maxVal) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                      {m.balance >= 0
                        ? `Este centro de custos gera superavit de ${formatCurrency(m.balance)}`
                        : `Este centro de custos tem deficit de ${formatCurrency(Math.abs(m.balance))}`
                      }
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Centro de Custos' : 'Novo Centro de Custos'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome</label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Marketing, TI, Vendas" required />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Codigo (opcional)</label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Ex: MKT, TI, VND" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
              <Button type="submit" disabled={saving} className="flex-1 bg-blue-500 hover:bg-blue-600 text-foreground">{editingId ? 'Salvar' : 'Criar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
