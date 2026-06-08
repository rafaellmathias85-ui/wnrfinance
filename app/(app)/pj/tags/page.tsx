'use client';
import { apiFetch } from '@/lib/fetch';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';


const PRESET_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b', '#84cc16'];

export default function TagsPage() {
  const { activeCompanyId } = usePJ();
  const { toast } = useToast();
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', color: '#3b82f6', description: '', scope: 'PJ' });

  const fetchTags = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/pj/tags');
      if (res.ok) setTags(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', color: '#3b82f6', description: '', scope: 'PJ' });
    setShowForm(true);
  };

  const openEdit = (tag: any) => {
    setEditing(tag);
    setForm({ name: tag.name, color: tag.color, description: tag.description || '', scope: tag.scope });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editing ? `/api/pj/tags/${editing.id}` : '/api/pj/tags';
    const method = editing ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) {
      toast({ title: editing ? 'Tag atualizada' : 'Tag criada' });
      setShowForm(false);
      setEditing(null);
      fetchTags();
    } else {
      const err = await res.json();
      toast({ title: 'Erro', description: err.error, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta tag?')) return;
    const res = await apiFetch(`/api/pj/tags/${id}`, { method: 'DELETE' });
    if (res.ok) { fetchTags(); toast({ title: 'Tag excluída' }); }
    else { const err = await res.json(); toast({ title: 'Erro', description: err.error, variant: 'destructive' }); }
  };

  if (!activeCompanyId) return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="w-6 h-6 text-primary" />Gerenciar Tags</h1>
          <p className="text-muted-foreground">Organize suas contas com tags personalizadas</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nova Tag</Button>
      </div>

      {showForm && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base flex justify-between">
              {editing ? 'Editar Tag' : 'Nova Tag'}
              <button onClick={() => { setShowForm(false); setEditing(null); }}><X className="w-5 h-5" /></button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Nome *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Ex: Urgente" />
                </div>
                <div>
                  <Label>Escopo</Label>
                  <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                    <option value="PJ">Apenas PJ</option>
                    <option value="PF">Apenas PF</option>
                    <option value="AMBOS">PF e PJ</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" />
              </div>
              <div>
                <Label>Cor</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${form.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                  <Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-8 p-0 border-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</Button>
                <Button type="submit">{editing ? 'Salvar' : 'Criar'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : tags.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma tag cadastrada. Crie sua primeira tag!</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map(tag => (
            <Card key={tag.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                    <div>
                      <p className="font-semibold">{tag.name}</p>
                      {tag.description && <p className="text-xs text-muted-foreground mt-0.5">{tag.description}</p>}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted mt-1 inline-block">
                        {tag.scope === 'AMBOS' ? 'PF + PJ' : tag.scope}
                      </span>
                      {tag.isSystem && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 ml-1">Sistema</span>}
                    </div>
                  </div>
                  {!tag.isSystem && (
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(tag)} className="p-1.5 rounded-lg hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(tag.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
