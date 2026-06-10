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

export default function FuncionariosPage() {
  const { activeCompanyId } = usePJ();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/pj/employees');
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } catch { setEmployees([]); }
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
      position: fd.get('position') || null,
      salary: fd.get('salary') ? Number(String(fd.get('salary')).replace(',', '.')) : null,
      hiredAt: fd.get('hiredAt') || null,
      address: fd.get('address') || null,
      city: fd.get('city') || null,
      state: fd.get('state') || null,
      notes: fd.get('notes') || null,
    };
    const url = editing ? `/api/pj/employees?id=${editing.id}` : '/api/pj/employees';
    const method = editing ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      toast({ title: editing ? 'Funcionário atualizado' : 'Funcionário cadastrado' });
      setShowForm(false);
      setEditing(null);
      load();
    } else {
      const err = await res.json();
      toast({ title: 'Erro', description: err.error, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este funcionário?')) return;
    await apiFetch(`/api/pj/employees?id=${id}`, { method: 'DELETE' });
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
      const body = {
        name: row.nome || row.name || '',
        document: row.cpf || row.documento || '',
        email: row.email || '',
        phone: row.telefone || row.phone || '',
        position: row.cargo || row.position || '',
      };
      if (!body.name) continue;
      const res = await apiFetch('/api/pj/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) imported++;
    }
    toast({ title: `${imported} funcionários importados` });
    load();
    e.target.value = '';
  };

  const filtered = employees.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.document?.toLowerCase().includes(q) || s.position?.toLowerCase().includes(q);
  });

  const fmt = (v: number | null) => v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';

  if (!activeCompanyId) return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Funcionários</h1>
          <p className="text-muted-foreground">Cadastro de colaboradores da empresa</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
            <Button variant="outline" asChild><span><Upload className="w-4 h-4 mr-2" />Importar CSV</span></Button>
          </label>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="w-4 h-4 mr-2" />Novo Funcionário</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CPF ou cargo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">{editing ? 'Editar Funcionário' : 'Novo Funcionário'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><Label>Nome *</Label><Input name="name" required defaultValue={editing?.name} /></div>
              <div><Label>CPF</Label><Input name="document" defaultValue={editing?.document} placeholder="000.000.000-00" /></div>
              <div><Label>Cargo / Função</Label><Input name="position" defaultValue={editing?.position} placeholder="Ex: Analista, Vendedor..." /></div>
              <div><Label>Email</Label><Input name="email" type="email" defaultValue={editing?.email} /></div>
              <div><Label>Telefone</Label><Input name="phone" defaultValue={editing?.phone} /></div>
              <div><Label>Salário</Label><Input name="salary" type="number" step="0.01" defaultValue={editing?.salary ?? ''} placeholder="0,00" /></div>
              <div><Label>Data de Admissão</Label><Input name="hiredAt" type="date" defaultValue={editing?.hiredAt ? new Date(editing.hiredAt).toISOString().slice(0, 10) : ''} /></div>
              <div><Label>Endereço</Label><Input name="address" defaultValue={editing?.address} /></div>
              <div><Label>Cidade</Label><Input name="city" defaultValue={editing?.city} /></div>
              <div><Label>Estado</Label><Input name="state" defaultValue={editing?.state} /></div>
              <div className="sm:col-span-2"><Label>Observações</Label><Input name="notes" defaultValue={editing?.notes} /></div>
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</Button>
                <Button type="submit">{editing ? 'Salvar' : 'Cadastrar'}</Button>
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
          <p>Nenhum funcionário cadastrado</p>
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 font-medium">Nome</th>
                <th className="pb-3 font-medium hidden sm:table-cell">CPF</th>
                <th className="pb-3 font-medium hidden md:table-cell">Cargo</th>
                <th className="pb-3 font-medium hidden lg:table-cell">Email</th>
                <th className="pb-3 font-medium hidden xl:table-cell">Salário</th>
                <th className="pb-3 font-medium hidden xl:table-cell">Admissão</th>
                <th className="pb-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp: any) => (
                <tr key={emp.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="py-3 font-medium">{emp.name}</td>
                  <td className="py-3 hidden sm:table-cell text-muted-foreground">{emp.document || '-'}</td>
                  <td className="py-3 hidden md:table-cell text-muted-foreground">{emp.position || '-'}</td>
                  <td className="py-3 hidden lg:table-cell text-muted-foreground">{emp.email || '-'}</td>
                  <td className="py-3 hidden xl:table-cell text-muted-foreground">{fmt(emp.salary)}</td>
                  <td className="py-3 hidden xl:table-cell text-muted-foreground">{emp.hiredAt ? new Date(emp.hiredAt).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setEditing(emp); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-muted"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(emp.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-600"><Trash2 className="w-4 h-4" /></button>
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
