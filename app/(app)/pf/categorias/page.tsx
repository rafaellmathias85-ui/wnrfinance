'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Check, X, Tag, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const GROUP_TYPES: Record<string, 'income' | 'expense' | 'savings'> = {
  Receita: 'income', Habitação: 'expense', Filhos: 'expense',
  Automóvel: 'expense', Diversos: 'expense', Poupança: 'savings',
};
const GROUP_COLORS: Record<string, string> = {
  Receita: 'bg-green-900/30 text-green-400 border-green-700/40',
  Poupança: 'bg-blue-900/30 text-blue-400 border-blue-700/40',
};
const DEFAULT_GROUPS = ['Receita', 'Habitação', 'Filhos', 'Automóvel', 'Diversos', 'Poupança'];
const PALETTE = ['#64748B','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#F97316','#06B6D4','#84CC16'];

type Cat = { id: string; group: string; subgroup: string; type: string; color: string; isActive: boolean };

export default function CategoriasPage() {
  const [grouped, setGrouped] = useState<Record<string, Cat[]>>({});
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const [newGroup, setNewGroup] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/pf/categorias');
      if (res.ok) {
        const d = await res.json();
        setGrouped(d.grouped ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addSubgroup = async (group: string) => {
    const sub = newItem[group]?.trim();
    if (!sub) return;
    const type = GROUP_TYPES[group] ?? 'expense';
    const res = await apiFetch('/api/pf/categorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, subgroup: sub, type }),
    });
    if (res.ok) {
      toast.success(`"${sub}" adicionado em ${group}`);
      setNewItem((p) => ({ ...p, [group]: '' }));
      load();
    } else toast.error('Erro ao adicionar');
  };

  const addGroup = async () => {
    const g = newGroup.trim();
    if (!g) return;
    const res = await apiFetch('/api/pf/categorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: g, subgroup: 'Geral', type: 'expense' }),
    });
    if (res.ok) { toast.success(`Grupo "${g}" criado!`); setNewGroup(''); load(); }
    else toast.error('Erro ao criar grupo');
  };

  const saveEdit = async (cat: Cat) => {
    const res = await apiFetch(`/api/pf/categorias/${cat.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subgroup: editVal }),
    });
    if (res.ok) { toast.success('Atualizado!'); setEditingId(null); load(); }
    else toast.error('Erro ao editar');
  };

  const remove = async (cat: Cat) => {
    if (!confirm(`Remover "${cat.subgroup}"?`)) return;
    const res = await apiFetch(`/api/pf/categorias/${cat.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Removido!'); load(); }
    else toast.error('Erro ao remover');
  };

  const inputCls = 'bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500';

  const allGroups = [...new Set([...DEFAULT_GROUPS, ...Object.keys(grouped)])];

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/pf/orcamento" className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Categorias PF</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Adicione e remova grupos e subgrupos livremente</p>
        </div>
      </div>

      {/* Criar novo grupo */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-foreground font-medium mb-3 flex items-center gap-2">
          <Tag className="w-4 h-4 text-blue-400" /> Novo Grupo
        </h3>
        <div className="flex gap-2">
          <input value={newGroup} onChange={e => setNewGroup(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addGroup()}
            placeholder="Nome do grupo (ex: Saúde, Viagem...)"
            className={`${inputCls} flex-1`} />
          <button onClick={addGroup}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Criar
          </button>
        </div>
      </div>

      {/* Grupos e subgrupos */}
      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Carregando...</div>
      ) : (
        <div className="space-y-4">
          {allGroups.map((group) => {
            const cats = (grouped[group] ?? []).filter(c => c.isActive);
            const colorCls = GROUP_COLORS[group] ?? 'bg-muted/40 text-foreground border-border/40';

            return (
              <div key={group} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${colorCls}`}>{group}</span>
                  <span className="text-xs text-muted-foreground">{cats.length} subgrupo{cats.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="p-4 space-y-2">
                  {cats.length === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-2">Nenhum subgrupo ativo</p>
                  )}
                  {cats.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between px-3 py-2 bg-muted/40 rounded-lg group">
                      {editingId === cat.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat); if (e.key === 'Escape') setEditingId(null); }}
                            className="bg-muted border border-blue-500 text-white rounded px-2 py-1 text-sm flex-1 focus:outline-none" />
                          <button onClick={() => saveEdit(cat)} className="p-1 text-green-400 hover:text-green-300"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span className="text-foreground text-sm">{cat.subgroup}</span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingId(cat.id); setEditVal(cat.subgroup); }}
                              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => remove(cat)}
                              className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-muted rounded">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Adicionar subgrupo */}
                  <div className="flex gap-2 mt-2 pt-2 border-t border-border/40">
                    <input
                      value={newItem[group] ?? ''}
                      onChange={e => setNewItem(p => ({ ...p, [group]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addSubgroup(group)}
                      placeholder={`Novo subgrupo em ${group}...`}
                      className={`${inputCls} flex-1 text-xs py-1.5`}
                    />
                    <button onClick={() => addSubgroup(group)}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-900/20 hover:bg-blue-900/40 px-3 py-1.5 rounded-lg">
                      <Plus className="w-3.5 h-3.5" /> Adicionar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
