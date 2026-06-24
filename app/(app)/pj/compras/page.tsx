'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, CheckCircle, XCircle, PackageCheck, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { usePJ } from '@/lib/pj-context';
import { apiFetch } from '@/lib/fetch';
import { useFormatCurrency } from '@/hooks/use-format-currency';

type POStatus = 'rascunho' | 'aprovado' | 'parcial' | 'recebido' | 'cancelado';

const STATUS_MAP: Record<POStatus, { label: string; color: string }> = {
  rascunho:  { label: 'Rascunho',  color: 'bg-slate-100 text-slate-700 dark:bg-card dark:text-foreground' },
  aprovado:  { label: 'Aprovado',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  parcial:   { label: 'Parcial',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  recebido:  { label: 'Recebido',  color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const emptyItem = () => ({ productName: '', qty: 1, unitCost: 0, total: 0 });
const emptyForm = { supplierName: '', supplierId: '', number: '', orderDate: '', expectedDate: '', notes: '', discount: '', taxes: '', items: [emptyItem()] };

export default function ComprasPage() {
  const { activeCompanyId } = usePJ();
  const formatCurrency = useFormatCurrency();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const res = await apiFetch(`/api/pj/compras?${params}`);
      if (res.ok) {
        const d = await res.json();
        setOrders(d.items || []);
      }
    } catch {}
    setLoading(false);
  }, [activeCompanyId, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditingId(null); setForm({ ...emptyForm, items: [emptyItem()] }); setDialogOpen(true); };
  const openEdit = (o: any) => {
    setEditingId(o.id);
    setForm({
      supplierName: o.supplierName || '',
      supplierId: o.supplierId || '',
      number: o.number || '',
      orderDate: o.orderDate ? o.orderDate.substring(0, 10) : '',
      expectedDate: o.expectedDate ? o.expectedDate.substring(0, 10) : '',
      notes: o.notes || '',
      discount: String(o.discount || ''),
      taxes: String(o.taxes || ''),
      items: o.items || [emptyItem()],
    });
    setDialogOpen(true);
  };

  const updateItem = (i: number, field: string, val: any) => {
    const items = [...form.items];
    items[i] = { ...items[i], [field]: val };
    if (field === 'qty' || field === 'unitCost') {
      items[i].total = (parseFloat(items[i].qty) || 0) * (parseFloat(items[i].unitCost) || 0);
    }
    setForm((p: any) => ({ ...p, items }));
  };

  const subtotal = (form.items || []).reduce((s: number, i: any) => s + (parseFloat(i.total) || 0), 0);
  const total = subtotal - (parseFloat(form.discount) || 0) + (parseFloat(form.taxes) || 0);

  const handleSave = async () => {
    if (!form.supplierName) { toast.error('Informe o fornecedor'); return; }
    setSaving(true);
    try {
      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId ? `/api/pj/compras/${editingId}` : '/api/pj/compras';
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erro ao salvar'); setSaving(false); return; }
      toast.success(editingId ? 'Pedido atualizado' : 'Pedido criado');
      setDialogOpen(false);
      load();
    } catch { toast.error('Erro ao salvar'); }
    setSaving(false);
  };

  const handleAction = async (id: string, action: string, label: string) => {
    try {
      const res = await apiFetch(`/api/pj/compras/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erro'); return; }
      toast.success(label);
      load();
    } catch { toast.error('Erro'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este pedido?')) return;
    const res = await apiFetch(`/api/pj/compras/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Pedido excluido'); load(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro ao excluir'); }
  };

  const filtered = orders.filter(o =>
    (o.supplierName?.toLowerCase().includes(search.toLowerCase()) || o.number?.includes(search))
  );

  const totals = { rascunho: 0, aprovado: 0, recebido: 0, total: 0 };
  orders.forEach(o => {
    totals.total += o.total || 0;
    if (o.status === 'rascunho') totals.rascunho++;
    else if (o.status === 'aprovado') totals.aprovado++;
    else if (o.status === 'recebido') totals.recebido++;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pedidos de Compra</h1>
          <p className="text-muted-foreground">Gerencie suas ordens de compra para fornecedores</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Novo Pedido</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Pedidos', value: orders.length },
          { label: 'Rascunhos', value: totals.rascunho },
          { label: 'Aprovados', value: totals.aprovado },
          { label: 'Recebidos', value: totals.recebido },
        ].map(k => (
          <Card key={k.label}><CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold">{k.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Filters */}
      <Card><CardContent className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Fornecedor ou numero..." className="pl-9" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-background">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </CardContent></Card>

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <p className="text-muted-foreground">Nenhum pedido encontrado.</p>
          <Button onClick={openNew} className="mt-4"><Plus className="w-4 h-4 mr-2" />Criar Primeiro Pedido</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => {
            const st = STATUS_MAP[o.status as POStatus] || STATUS_MAP.rascunho;
            const expanded = expandedId === o.id;
            return (
              <Card key={o.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button onClick={() => setExpandedId(expanded ? null : o.id)} className="text-muted-foreground">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{o.number}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{o.supplierName} · {o.orderDate ? new Date(o.orderDate).toLocaleDateString('pt-BR') : ''}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold">{formatCurrency(o.total)}</p>
                      {o.expectedDate && <p className="text-xs text-muted-foreground">Prev: {new Date(o.expectedDate).toLocaleDateString('pt-BR')}</p>}
                    </div>
                    <div className="flex gap-1">
                      {o.status === 'rascunho' && <button onClick={() => handleAction(o.id, 'approve', 'Aprovado!')} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title="Aprovar"><CheckCircle className="w-4 h-4" /></button>}
                      {o.status === 'aprovado' && <button onClick={() => handleAction(o.id, 'receive', 'Recebido!')} className="p-1.5 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg" title="Marcar Recebido"><PackageCheck className="w-4 h-4" /></button>}
                      {['rascunho'].includes(o.status) && <button onClick={() => openEdit(o)} className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg"><Pencil className="w-4 h-4" /></button>}
                      {['rascunho', 'cancelado'].includes(o.status) && <button onClick={() => handleDelete(o.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>}
                      {['rascunho', 'aprovado'].includes(o.status) && <button onClick={() => handleAction(o.id, 'cancel', 'Cancelado')} className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg" title="Cancelar"><XCircle className="w-4 h-4" /></button>}
                    </div>
                  </div>

                  {expanded && o.items?.length > 0 && (
                    <div className="mt-4 border-t border-border/40 pt-4">
                      <table className="w-full text-sm">
                        <thead><tr className="text-muted-foreground text-xs">
                          <th className="text-left pb-2">Produto</th>
                          <th className="text-right pb-2">Qtd</th>
                          <th className="text-right pb-2">Unit.</th>
                          <th className="text-right pb-2">Total</th>
                        </tr></thead>
                        <tbody>
                          {o.items.map((item: any, i: number) => (
                            <tr key={i} className="border-t border-border/20">
                              <td className="py-1.5">{item.productName}</td>
                              <td className="text-right py-1.5">{item.qty}</td>
                              <td className="text-right py-1.5">{formatCurrency(item.unitCost)}</td>
                              <td className="text-right py-1.5 font-medium">{formatCurrency(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {o.notes && <p className="mt-3 text-xs text-muted-foreground bg-muted/40 rounded-lg p-2">{o.notes}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Pedido' : 'Novo Pedido de Compra'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>Fornecedor *</Label>
                <Input value={form.supplierName} onChange={e => setForm((p: any) => ({ ...p, supplierName: e.target.value }))} placeholder="Nome do fornecedor" className="mt-1" /></div>
              <div><Label>Data do Pedido</Label>
                <Input type="date" value={form.orderDate} onChange={e => setForm((p: any) => ({ ...p, orderDate: e.target.value }))} className="mt-1" /></div>
              <div><Label>Previsao de Entrega</Label>
                <Input type="date" value={form.expectedDate} onChange={e => setForm((p: any) => ({ ...p, expectedDate: e.target.value }))} className="mt-1" /></div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Itens do Pedido</Label>
                <button onClick={() => setForm((p: any) => ({ ...p, items: [...p.items, emptyItem()] }))} className="text-xs text-primary hover:underline">+ Adicionar Item</button>
              </div>
              <div className="space-y-2">
                {form.items.map((item: any, i: number) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5"><Input value={item.productName} onChange={e => updateItem(i, 'productName', e.target.value)} placeholder="Produto/servico" /></div>
                    <div className="col-span-2"><Input type="number" value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} min="1" placeholder="Qtd" /></div>
                    <div className="col-span-2"><Input type="number" value={item.unitCost} onChange={e => updateItem(i, 'unitCost', e.target.value)} min="0" step="0.01" placeholder="Unit." /></div>
                    <div className="col-span-2 text-sm font-medium text-right">{formatCurrency(item.total || 0)}</div>
                    <div className="col-span-1"><button onClick={() => setForm((p: any) => ({ ...p, items: p.items.filter((_: any, j: number) => j !== i) }))} className="text-red-400 hover:text-red-600 text-xs">✕</button></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label>Desconto (R$)</Label>
                <Input type="number" value={form.discount} onChange={e => setForm((p: any) => ({ ...p, discount: e.target.value }))} min="0" step="0.01" className="mt-1" /></div>
              <div><Label>Impostos (R$)</Label>
                <Input type="number" value={form.taxes} onChange={e => setForm((p: any) => ({ ...p, taxes: e.target.value }))} min="0" step="0.01" className="mt-1" /></div>
            </div>

            <div className="bg-muted/40 rounded-xl p-4 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(subtotal)}</span></div>
              {parseFloat(form.discount) > 0 && <div className="flex justify-between text-green-600"><span>Desconto:</span><span>-{formatCurrency(parseFloat(form.discount))}</span></div>}
              {parseFloat(form.taxes) > 0 && <div className="flex justify-between"><span>Impostos:</span><span>{formatCurrency(parseFloat(form.taxes))}</span></div>}
              <div className="flex justify-between font-bold border-t border-border/40 pt-1 mt-1"><span>Total:</span><span>{formatCurrency(total)}</span></div>
            </div>

            <div><Label>Observacoes</Label>
              <textarea value={form.notes} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))} rows={2} className="w-full mt-1 border rounded-lg p-3 text-sm bg-background" /></div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar Pedido'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
