'use client';
import { apiFetch } from '@/lib/fetch';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useState } from 'react';
import { Layers, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';


export default function CategoriasPage() {
  const { activeCompanyId } = usePJ();
  const { toast } = useToast();
  const [categories, setCategories] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [editingCC, setEditingCC] = useState<any>(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showCCForm, setShowCCForm] = useState(false);

  const fetchData = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    const [catsRes, ccRes] = await Promise.all([
      apiFetch('/api/pj/categories'), apiFetch('/api/pj/cost-centers'),
    ]);
    setCategories(await catsRes.json());
    setCostCenters(await ccRes.json());
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCatSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { name: fd.get('name'), type: fd.get('type'), color: fd.get('color') };
    const url = editingCat ? `/api/pj/categories/${editingCat.id}` : '/api/pj/categories';
    const res = await apiFetch(url, { method: editingCat ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) { toast({ title: 'Categoria salva' }); setShowCatForm(false); setEditingCat(null); fetchData(); }
  };

  const handleCCSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { name: fd.get('name'), code: fd.get('code') };
    const url = editingCC ? `/api/pj/cost-centers/${editingCC.id}` : '/api/pj/cost-centers';
    const res = await apiFetch(url, { method: editingCC ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) { toast({ title: 'Centro de custo salvo' }); setShowCCForm(false); setEditingCC(null); fetchData(); }
  };

  const deleteCat = async (id: string) => { if (confirm('Excluir categoria?')) { await apiFetch(`/api/pj/categories/${id}`, { method: 'DELETE' }); fetchData(); } };
  const deleteCC = async (id: string) => { if (confirm('Excluir centro de custo?')) { await apiFetch(`/api/pj/cost-centers/${id}`, { method: 'DELETE' }); fetchData(); } };

  if (!activeCompanyId) return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Categorias & Centros de Custo</h1>

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories" className="flex items-center gap-2"><Tag className="w-4 h-4" />Categorias</TabsTrigger>
          <TabsTrigger value="cost-centers" className="flex items-center gap-2"><Layers className="w-4 h-4" />Centros de Custo</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditingCat(null); setShowCatForm(true); }}><Plus className="w-4 h-4 mr-2" />Nova Categoria</Button>
          </div>
          {showCatForm && (
            <Card className="border-primary">
              <CardHeader><CardTitle className="text-base flex justify-between">{editingCat ? 'Editar' : 'Nova'} Categoria<button onClick={() => { setShowCatForm(false); setEditingCat(null); }}><X className="w-5 h-5" /></button></CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleCatSubmit} className="flex flex-wrap gap-4 items-end">
                  <div><Label>Nome</Label><Input name="name" required defaultValue={editingCat?.name} /></div>
                  <div>
                    <Label>Tipo</Label>
                    <select name="type" defaultValue={editingCat?.type || 'EXPENSE'} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                      <option value="EXPENSE">Despesa</option><option value="INCOME">Receita</option>
                    </select>
                  </div>
                  <div><Label>Cor</Label><Input name="color" type="color" defaultValue={editingCat?.color || '#3b82f6'} className="w-16 h-10 p-1" /></div>
                  <Button type="submit">Salvar</Button>
                </form>
              </CardContent>
            </Card>
          )}
          {loading ? <div className="py-8 text-center">Carregando...</div> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map((c: any) => (
                <Card key={c.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: c.color }} />
                      <div>
                        <p className="font-medium text-sm">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.type === 'EXPENSE' ? 'Despesa' : 'Receita'}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingCat(c); setShowCatForm(true); }} className="p-1.5 rounded-lg hover:bg-muted"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => deleteCat(c.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {categories.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">Nenhuma categoria cadastrada.</p>}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cost-centers" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditingCC(null); setShowCCForm(true); }}><Plus className="w-4 h-4 mr-2" />Novo Centro de Custo</Button>
          </div>
          {showCCForm && (
            <Card className="border-primary">
              <CardHeader><CardTitle className="text-base flex justify-between">{editingCC ? 'Editar' : 'Novo'} Centro de Custo<button onClick={() => { setShowCCForm(false); setEditingCC(null); }}><X className="w-5 h-5" /></button></CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleCCSubmit} className="flex flex-wrap gap-4 items-end">
                  <div><Label>Nome</Label><Input name="name" required defaultValue={editingCC?.name} /></div>
                  <div><Label>Código</Label><Input name="code" defaultValue={editingCC?.code} /></div>
                  <Button type="submit">Salvar</Button>
                </form>
              </CardContent>
            </Card>
          )}
          {loading ? <div className="py-8 text-center">Carregando...</div> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {costCenters.map((c: any) => (
                <Card key={c.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{c.name}</p>
                      {c.code && <p className="text-xs text-muted-foreground">Cód: {c.code}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingCC(c); setShowCCForm(true); }} className="p-1.5 rounded-lg hover:bg-muted"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => deleteCC(c.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {costCenters.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">Nenhum centro de custo cadastrado.</p>}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
