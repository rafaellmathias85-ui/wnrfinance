'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, X, TrendingUp, DollarSign, BarChart3, Calendar } from 'lucide-react';
import { usePJ } from '@/lib/pj-context';
import { apiFetch } from '@/lib/fetch';
import { useToast } from '@/hooks/use-toast';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const TYPES = ['CDB', 'LCI', 'LCA', 'Tesouro', 'Ações', 'FII', 'Fundos', 'Debêntures', 'Poupança', 'Outros'];
const LIQUIDITIES = ['Diária', 'D+1', 'D+30', 'No vencimento'];
const INDEXERS = ['CDI', 'IPCA', 'Selic', 'Pré-fixado'];
const RISKS = ['Conservador', 'Moderado', 'Arrojado'];
const statusLabels: Record<string, string> = { ativo: 'Ativo', resgatado: 'Resgatado', vencido: 'Vencido' };
const statusColors: Record<string, string> = {
  ativo: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  resgatado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  vencido: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

export default function InvestimentosPJ() {
  const { activeCompanyId } = usePJ();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchData = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);
      if (filterStatus) params.set('status', filterStatus);
      const res = await apiFetch(`/api/pj/investments?${params}`);
      if (res.ok) setItems(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [activeCompanyId, filterType, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: any = {
      institutionName: fd.get('institutionName'),
      productName: fd.get('productName'),
      investmentType: fd.get('investmentType'),
      amountInvested: fd.get('amountInvested'),
      currentValue: fd.get('currentValue') || fd.get('amountInvested'),
      profitability: fd.get('profitability') || null,
      applicationDate: fd.get('applicationDate'),
      maturityDate: fd.get('maturityDate') || null,
      liquidity: fd.get('liquidity') || null,
      indexer: fd.get('indexer') || null,
      riskLevel: fd.get('riskLevel') || null,
      status: fd.get('status') || 'ativo',
      notes: fd.get('notes') || null,
    };

    const url = editing ? `/api/pj/investments/${editing.id}` : '/api/pj/investments';
    const method = editing ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      toast({ title: editing ? 'Investimento atualizado' : 'Investimento registrado' });
      setShowForm(false);
      setEditing(null);
      fetchData();
    } else {
      const err = await res.json();
      toast({ title: 'Erro', description: err.error, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este investimento?')) return;
    await apiFetch(`/api/pj/investments/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const activeItems = items.filter(i => i.status === 'ativo');
  const totalInvested = activeItems.reduce((s, i) => s + Number(i.amountInvested), 0);
  const totalCurrent = activeItems.reduce((s, i) => s + Number(i.currentValue), 0);
  const totalProfit = totalCurrent - totalInvested;
  const profitPct = totalInvested > 0 ? ((totalProfit / totalInvested) * 100).toFixed(2) : '0.00';

  if (!activeCompanyId) return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Investimentos PJ</h1>
          <p className="text-muted-foreground">Gerencie os investimentos da empresa</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="w-4 h-4 mr-2" />Novo Investimento</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><DollarSign className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-xs text-muted-foreground">Total Investido</p><p className="text-lg font-bold">{fmt(totalInvested)}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30"><TrendingUp className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-xs text-muted-foreground">Valor Atual</p><p className="text-lg font-bold">{fmt(totalCurrent)}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${totalProfit >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                <BarChart3 className={`w-5 h-5 ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div><p className="text-xs text-muted-foreground">Rendimento</p><p className={`text-lg font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(totalProfit)}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30"><Calendar className="w-5 h-5 text-amber-600" /></div>
              <div><p className="text-xs text-muted-foreground">Rentabilidade</p><p className="text-lg font-bold">{profitPct}%</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Tipo</Label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                <option value="">Todos</option>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="resgatado">Resgatado</option>
                <option value="vencido">Vencido</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      {showForm && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base flex justify-between">
              {editing ? 'Editar Investimento' : 'Novo Investimento'}
              <button onClick={() => { setShowForm(false); setEditing(null); }}><X className="w-5 h-5" /></button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><Label>Instituição *</Label><Input name="institutionName" required defaultValue={editing?.institutionName} placeholder="Ex: Banco Inter" /></div>
              <div><Label>Produto *</Label><Input name="productName" required defaultValue={editing?.productName} placeholder="Ex: CDB 120% CDI" /></div>
              <div>
                <Label>Tipo *</Label>
                <select name="investmentType" defaultValue={editing?.investmentType || ''} required className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                  <option value="">Selecione</option>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><Label>Valor Investido *</Label><Input name="amountInvested" type="number" step="0.01" required defaultValue={editing?.amountInvested} /></div>
              <div><Label>Valor Atual</Label><Input name="currentValue" type="number" step="0.01" defaultValue={editing?.currentValue} /></div>
              <div><Label>Rentabilidade (%)</Label><Input name="profitability" type="number" step="0.01" defaultValue={editing?.profitability} /></div>
              <div><Label>Data Aplicação *</Label><Input name="applicationDate" type="date" required defaultValue={editing?.applicationDate?.split('T')[0]} /></div>
              <div><Label>Vencimento</Label><Input name="maturityDate" type="date" defaultValue={editing?.maturityDate?.split('T')[0]} /></div>
              <div>
                <Label>Liquidez</Label>
                <select name="liquidity" defaultValue={editing?.liquidity || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                  <option value="">Selecione</option>
                  {LIQUIDITIES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <Label>Indexador</Label>
                <select name="indexer" defaultValue={editing?.indexer || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                  <option value="">Selecione</option>
                  {INDEXERS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <Label>Risco</Label>
                <select name="riskLevel" defaultValue={editing?.riskLevel || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                  <option value="">Selecione</option>
                  {RISKS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <select name="status" defaultValue={editing?.status || 'ativo'} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                  <option value="ativo">Ativo</option>
                  <option value="resgatado">Resgatado</option>
                  <option value="vencido">Vencido</option>
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3"><Label>Observações</Label><Input name="notes" defaultValue={editing?.notes} /></div>
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</Button>
                <Button type="submit">{editing ? 'Salvar' : 'Registrar'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum investimento registrado.</CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 font-medium">Produto</th>
                <th className="pb-3 font-medium hidden sm:table-cell">Instituição</th>
                <th className="pb-3 font-medium hidden md:table-cell">Tipo</th>
                <th className="pb-3 font-medium">Investido</th>
                <th className="pb-3 font-medium">Atual</th>
                <th className="pb-3 font-medium hidden lg:table-cell">Rendimento</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => {
                const profit = Number(item.currentValue) - Number(item.amountInvested);
                return (
                  <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="py-3">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.indexer && `${item.indexer} • `}{item.liquidity || ''}</p>
                    </td>
                    <td className="py-3 hidden sm:table-cell text-muted-foreground">{item.institutionName}</td>
                    <td className="py-3 hidden md:table-cell"><span className="text-xs px-2 py-0.5 rounded bg-muted">{item.investmentType}</span></td>
                    <td className="py-3 font-medium">{fmt(Number(item.amountInvested))}</td>
                    <td className="py-3 font-semibold">{fmt(Number(item.currentValue))}</td>
                    <td className={`py-3 hidden lg:table-cell font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {profit >= 0 ? '+' : ''}{fmt(profit)}
                    </td>
                    <td className="py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[item.status] || ''}`}>{statusLabels[item.status] || item.status}</span></td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(item); setShowForm(true); }} title="Editar" className="p-1.5 rounded-lg hover:bg-muted"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(item.id)} title="Excluir" className="p-1.5 rounded-lg hover:bg-red-100 text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
