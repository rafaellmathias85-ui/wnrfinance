'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, FolderOpen, Folder, Plus, Pencil, X } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  type: string;
  code: string | null;
  isSystem: boolean;
  isActive: boolean;
  parentId: string | null;
  children: Category[];
}

const TYPE_BADGE: Record<string, string> = {
  receita: 'bg-green-900/30 text-green-300',
  despesa: 'bg-red-900/30 text-red-300',
  ambos: 'bg-blue-900/30 text-blue-300',
  EXPENSE: 'bg-red-900/30 text-red-300',
  INCOME: 'bg-green-900/30 text-green-300',
};

const TYPE_LABEL: Record<string, string> = {
  receita: 'Receita', despesa: 'Despesa', ambos: 'Ambos',
  EXPENSE: 'Despesa', INCOME: 'Receita',
};

const SEED_GROUPS = [
  { name: 'Receitas Operacionais', code: '1', type: 'receita', isSystem: true, children: [
    { name: 'Vendas de Produtos', code: '1.1', type: 'receita', isSystem: true },
    { name: 'Prestação de Serviços', code: '1.2', type: 'receita', isSystem: true },
  ]},
  { name: 'Receitas Não-Operacionais', code: '2', type: 'receita', isSystem: true, children: [
    { name: 'Rendimentos Financeiros', code: '2.1', type: 'receita', isSystem: true },
  ]},
  { name: 'Despesas Operacionais', code: '3', type: 'despesa', isSystem: true, children: [
    { name: 'Fornecedores', code: '3.1', type: 'despesa', isSystem: true },
    { name: 'Folha de Pagamento', code: '3.2', type: 'despesa', isSystem: true },
    { name: 'Aluguel', code: '3.3', type: 'despesa', isSystem: true },
    { name: 'Utilities (Energia, Água, Internet)', code: '3.4', type: 'despesa', isSystem: true },
  ]},
  { name: 'Despesas Administrativas', code: '4', type: 'despesa', isSystem: true, children: [
    { name: 'Material de Escritório', code: '4.1', type: 'despesa', isSystem: true },
    { name: 'Viagens e Representação', code: '4.2', type: 'despesa', isSystem: true },
  ]},
  { name: 'Impostos e Tributos', code: '5', type: 'despesa', isSystem: true, children: [
    { name: 'DAS / Simples Nacional', code: '5.1', type: 'despesa', isSystem: true },
    { name: 'ICMS', code: '5.2', type: 'despesa', isSystem: true },
    { name: 'ISS', code: '5.3', type: 'despesa', isSystem: true },
    { name: 'Contribuições Federais', code: '5.4', type: 'despesa', isSystem: true },
  ]},
  { name: 'Investimentos', code: '6', type: 'ambos', isSystem: true, children: [] },
];

function CategoryRow({ cat, depth, onEdit, onRefresh }: { cat: Category; depth: number; onEdit: (c: Category) => void; onRefresh: () => void }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = cat.children && cat.children.length > 0;

  return (
    <>
      <tr className={`hover:bg-slate-700/20 ${!cat.isActive ? 'opacity-50' : ''}`}>
        <td className="px-4 py-2">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              <button onClick={() => setOpen((o) => !o)} className="p-0.5 text-slate-400 hover:text-white">
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <span className="w-5" />
            )}
            {hasChildren
              ? (open ? <FolderOpen className="w-4 h-4 text-amber-400" /> : <Folder className="w-4 h-4 text-amber-400" />)
              : <span className="w-4" />
            }
            <span className="text-white text-sm font-medium ml-1">{cat.name}</span>
            {cat.isSystem && <span className="ml-2 px-1.5 py-0.5 bg-slate-600 text-slate-400 text-xs rounded">Sistema</span>}
          </div>
        </td>
        <td className="px-4 py-2 text-slate-400 text-xs">{cat.code || '—'}</td>
        <td className="px-4 py-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[cat.type] || 'bg-slate-700 text-slate-300'}`}>
            {TYPE_LABEL[cat.type] || cat.type}
          </span>
        </td>
        <td className="px-4 py-2 text-center">
          {!cat.isSystem && (
            <button onClick={() => onEdit(cat)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </td>
      </tr>
      {open && hasChildren && cat.children.map((child) => (
        <CategoryRow key={child.id} cat={child} depth={depth + 1} onEdit={onEdit} onRefresh={onRefresh} />
      ))}
    </>
  );
}

export default function PlanoContasPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [allFlat, setAllFlat] = useState<Category[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [treeRes, flatRes] = await Promise.all([
      apiFetch('/api/pj/categories?tree=true'),
      apiFetch('/api/pj/categories'),
    ]);
    setCategories(await treeRes.json());
    setAllFlat(await flatRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const seedDefault = async () => {
    if (!confirm('Criar plano de contas gerencial padrão? Isso adicionará as categorias-base.')) return;
    for (const group of SEED_GROUPS) {
      const res = await apiFetch('/api/pj/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: group.name, type: group.type, code: group.code, isSystem: group.isSystem }),
      });
      const parent = await res.json();
      for (const child of (group as any).children || []) {
        await apiFetch('/api/pj/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: child.name, type: child.type, code: child.code, isSystem: child.isSystem, parentId: parent.id }),
        });
      }
    }
    toast.success('Plano de contas padrão criado');
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Plano de Contas</h1>
          <p className="text-slate-400 text-sm mt-0.5">Hierarquia de categorias gerenciais</p>
        </div>
        <div className="flex items-center gap-2">
          {categories.length === 0 && (
            <button onClick={seedDefault} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium">
              Criar Padrão
            </button>
          )}
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Nova Conta
          </button>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Nome</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Código</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center">
                  <FolderOpen className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400">Nenhuma categoria cadastrada</p>
                  <p className="text-slate-500 text-xs mt-1">Use "Criar Padrão" para gerar o plano gerencial brasileiro</p>
                </td>
              </tr>
            ) : categories.map((cat) => (
              <CategoryRow key={cat.id} cat={cat} depth={0} onEdit={(c) => { setEditing(c); setShowForm(true); }} onRefresh={load} />
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <CategoryFormModal
          editing={editing}
          allFlat={allFlat}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function CategoryFormModal({ editing, allFlat, onClose, onSaved }: { editing: Category | null; allFlat: Category[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: editing?.name || '',
    type: editing?.type || 'despesa',
    code: editing?.code || '',
    parentId: editing?.parentId || '',
    isActive: editing?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return; }
    setSaving(true);
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `/api/pj/categories?id=${editing.id}` : '/api/pj/categories';
    const r = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, parentId: form.parentId || null, code: form.code || null }),
    });
    if (r.ok) { toast.success(editing ? 'Conta atualizada' : 'Conta criada'); onSaved(); onClose(); }
    else { const d = await r.json(); toast.error(d.error || 'Erro ao salvar'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold">{editing ? 'Editar Conta' : 'Nova Conta'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Nome *</label>
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Código</label>
            <input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              placeholder="ex: 3.1.2"
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tipo</label>
            <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm">
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
              <option value="ambos">Ambos</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Conta pai (opcional)</label>
            <select value={form.parentId} onChange={(e) => setForm((p) => ({ ...p, parentId: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm">
              <option value="">Nenhuma (conta raiz)</option>
              {allFlat.filter((c) => c.id !== editing?.id).map((c) => (
                <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
            Ativa
          </label>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
