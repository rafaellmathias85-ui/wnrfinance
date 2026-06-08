'use client';
import { apiFetch } from '@/lib/fetch';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';


export default function FornecedoresPage() {
  const { activeCompanyId } = usePJ();
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/pj/suppliers');
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch { setSuppliers([]); }
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get('name'),
      document: fd.get('document') || null,
      email: fd.get('email') || null,
      phone: fd.get('phone') || null,
      address: fd.get('address') || null,
      city: fd.get('city') || null,
      state: fd.get('state') || null,
      notes: fd.get('notes') || null,
    };
    const url = editing ? `/api/pj/suppliers?id=${editing.id}` : '/api/pj/suppliers';
    const method = editing ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      toast({ title: editing ? 'Fornecedor atualizado' : 'Fornecedor criado' });
      setShowForm(false);
      setEditing(null);
      load();
    } else {
      const err = await res.json();
      toast({ title: 'Erro', description: err.error, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este fornecedor?')) return;
    await apiFetch(`/api/pj/suppliers?id=${id}`, { method: 'DELETE' });
    load();
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) { toast({ title: 'CSV vazio', variant: 'destructive' }); return; }
    const headers = lines[0].split(';').map(h => h.trim().toLowerCase());
    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';').map(c => c.trim());
      const row: any = {};
      headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
      const body = { name: row.nome || row.name || '', document: row.cnpj || row.cpf || row.documento || '', email: row.email || '', phone: row.telefone || row.phone || '' };
      if (!body.name) continue;
      const res = await apiFetch('/api/pj/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) imported++;
    }
    toast({ title: `${imported} fornecedores importados` });
    load();
    e.target.value = '';
  };

  const filtered = suppliers.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.document?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q);
  });

  if (!activeCompanyId) return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fornecedores</h1>
          <p className="text-muted-foreground">Cadastro de fornecedores PJ</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
            <Button variant="outline" asChild><span><Upload className="w-4 h-4 mr-2" />Importar CSV</span></Button>
          </label>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="w-4 h-4 mr-2" />Novo Fornecedor</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, documento ou email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">{editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><Label>Nome *</Label><Input name="name" required defaultValue={editing?.name} /></div>
              <div><Label>CNPJ/CPF</Label><Input name="document" defaultValue={editing?.document} placeholder="00.000.000/0001-00" /></div>
              <div><Label>Email</Label><Input name="email" type="email" defaultValue={editing?.email} /></div>
              <div><Label>Telefone</Label><Input name="phone" defaultValue={editing?.phone} /></div>
              <div><Label>Endereco</Label><Input name="address" defaultValue={editing?.address} /></div>
              <div><Label>Cidade</Label><Input name="city" defaultValue={editing?.city} /></div>
              <div><Label>Estado</Label><Input name="state" defaultValue={editing?.state} /></div>
              <div className="sm:col-span-2"><Label>Observacoes</Label><Input name="notes" defaultValue={editing?.notes} /></div>
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</Button>
                <Button type="submit">{editing ? 'Salvar' : 'Criar'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
          <p>Nenhum fornecedor cadastrado</p>
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 font-medium">Nome</th>
                <th className="pb-3 font-medium hidden sm:table-cell">Documento</th>
                <th className="pb-3 font-medium hidden md:table-cell">Email</th>
                <th className="pb-3 font-medium hidden lg:table-cell">Telefone</th>
                <th className="pb-3 font-medium hidden xl:table-cell">Cidade/UF</th>
                <th className="pb-3 font-medium text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => (
                <tr key={s.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="py-3 font-medium">{s.name}</td>
                  <td className="py-3 hidden sm:table-cell text-muted-foreground">{s.document || '-'}</td>
                  <td className="py-3 hidden md:table-cell text-muted-foreground">{s.email || '-'}</td>
                  <td className="py-3 hidden lg:table-cell text-muted-foreground">{s.phone || '-'}</td>
                  <td className="py-3 hidden xl:table-cell text-muted-foreground">{[s.city, s.state].filter(Boolean).join('/') || '-'}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setEditing(s); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-muted"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
