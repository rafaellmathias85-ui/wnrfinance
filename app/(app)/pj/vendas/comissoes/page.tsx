'use client';
import { apiFetch } from '@/lib/fetch';
import { useState, useEffect } from 'react';
import { DollarSign, Percent, Users, Pencil, Plus, Trash2, Save, X } from 'lucide-react';
import { PageHeader } from '@/components/enterprise';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFormatCurrency } from '@/hooks/use-format-currency';

interface Seller {
  id: string;
  name: string;
  email: string | null;
  commissionRate: number;
  totalSales: number;
  totalCommission: number;
}

export default function ComissoesPage() {
  const formatCurrency = useFormatCurrency();
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Seller | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', commissionRate: '5' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/pj/vendas/sellers');
      const data = await res.json();
      setSellers(data.items || []);
    } catch { setSellers([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', commissionRate: '5' });
    setShowForm(true);
  };

  const openEdit = (s: Seller) => {
    setEditing(s);
    setForm({ name: s.name, email: s.email || '', commissionRate: String(s.commissionRate) });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: form.name, email: form.email || null, commissionRate: parseFloat(form.commissionRate) || 0 };
      if (editing) {
        await apiFetch(`/api/pj/vendas/sellers/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await apiFetch('/api/pj/vendas/sellers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover vendedor?')) return;
    await apiFetch(`/api/pj/vendas/sellers/${id}`, { method: 'DELETE' });
    load();
  };

  const totalCommission = sellers.reduce((s, v) => s + (v.totalCommission || 0), 0);
  const totalSales = sellers.reduce((s, v) => s + (v.totalSales || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comissões"
        subtitle="Gestão de vendedores e comissões"
        breadcrumbs={[{ label: 'Vendas', href: '/pj/vendas' }, { label: 'Comissões' }]}
        actions={
          <Button onClick={openCreate} className="bg-blue-500 hover:bg-blue-600 text-white">
            <Plus className="w-4 h-4 mr-2" /> Novo Vendedor
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Vendedores', value: sellers.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Total em Vendas', value: formatCurrency(totalSales), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Total Comissões', value: formatCurrency(totalCommission), icon: Percent, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-xl font-bold text-foreground">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sellers table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Vendedores
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sellers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum vendedor cadastrado.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {sellers.map(s => (
                <div key={s.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm">{s.name}</p>
                    {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground">Vendas</p>
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(s.totalSales || 0)}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground">Comissão</p>
                      <p className="text-sm font-semibold text-green-600">{formatCurrency(s.totalCommission || 0)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20">
                      <Percent className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">{s.commissionRate}%</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(s)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600" onClick={() => handleDelete(s.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Vendedor' : 'Novo Vendedor'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 mt-2">
            <div>
              <Label>Nome *</Label>
              <Input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome do vendedor" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
            </div>
            <div>
              <Label>Taxa de Comissão (%)</Label>
              <Input type="number" min="0" max="100" step="0.1" value={form.commissionRate} onChange={e => setForm(p => ({ ...p, commissionRate: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white">
                <Save className="w-4 h-4 mr-1" /> {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
