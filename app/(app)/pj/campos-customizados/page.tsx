'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Plus, Trash2, X, Layers, GripVertical, Edit2, Check } from 'lucide-react';

interface CustomField {
  id: string;
  entity: string;
  name: string;
  fieldKey: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  order: number;
  isActive: boolean;
}

const ENTITIES = [
  { value: 'client', label: 'Clientes' },
  { value: 'payable', label: 'Contas a Pagar' },
  { value: 'receivable', label: 'Contas a Receber' },
  { value: 'product', label: 'Produtos' },
];

const FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'boolean', label: 'Sim/Não' },
  { value: 'select', label: 'Lista de opções' },
];

const TYPE_BADGE: Record<string, string> = {
  text: 'bg-muted text-foreground',
  number: 'bg-blue-500/20 text-blue-400',
  date: 'bg-purple-500/20 text-purple-400',
  boolean: 'bg-green-500/20 text-green-400',
  select: 'bg-yellow-500/20 text-yellow-400',
};

export default function CamposCustomizadosPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // new field form
  const [fEntity, setFEntity] = useState('client');
  const [fName, setFName] = useState('');
  const [fKey, setFKey] = useState('');
  const [fType, setFType] = useState('text');
  const [fRequired, setFRequired] = useState(false);
  const [fOptions, setFOptions] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch('/api/pj/custom-fields');
    setFields(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = ENTITIES.map(e => ({
    ...e,
    items: fields.filter(f => f.entity === e.value),
  }));

  const autoKey = (name: string) =>
    name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  const handleNameChange = (v: string) => {
    setFName(v);
    setFKey(autoKey(v));
  };

  const create = async () => {
    if (!fName.trim() || !fKey.trim()) { toast.error('Nome obrigatório'); return; }
    const options = fType === 'select'
      ? fOptions.split('\n').map(s => s.trim()).filter(Boolean)
      : undefined;
    const res = await apiFetch('/api/pj/custom-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: fEntity, name: fName, fieldKey: fKey, fieldType: fType, required: fRequired, options }),
    });
    if (res.ok) {
      toast.success('Campo criado');
      setShowForm(false);
      setFName(''); setFKey(''); setFType('text'); setFRequired(false); setFOptions('');
      load();
    } else {
      const d = await res.json();
      toast.error(d.error || 'Erro ao criar');
    }
  };

  const saveEditName = async (id: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    const res = await apiFetch(`/api/pj/custom-fields?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    });
    if (res.ok) { toast.success('Atualizado'); load(); }
    setEditingId(null);
  };

  const toggleActive = async (field: CustomField) => {
    const res = await apiFetch(`/api/pj/custom-fields?id=${field.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !field.isActive }),
    });
    if (res.ok) load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este campo? Os valores já salvos serão removidos.')) return;
    const res = await apiFetch(`/api/pj/custom-fields?id=${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Campo removido'); load(); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center">
            <Layers className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Campos Customizados</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Adicione campos extras aos cadastros da empresa</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Novo Campo
        </button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Carregando...</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.value} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-foreground font-medium text-sm">{group.label}</h3>
                <span className="text-muted-foreground text-xs">{group.items.length} campo{group.items.length !== 1 ? 's' : ''}</span>
              </div>

              {group.items.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                  Nenhum campo customizado para {group.label.toLowerCase()}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {group.items.map(field => (
                    <div key={field.id} className={`flex items-center gap-3 px-4 py-3 ${!field.isActive ? 'opacity-50' : ''}`}>
                      <GripVertical className="w-4 h-4 text-slate-600 flex-shrink-0" />

                      <div className="flex-1 min-w-0">
                        {editingId === field.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEditName(field.id); if (e.key === 'Escape') setEditingId(null); }}
                              className="bg-muted border border-border text-foreground rounded px-2 py-1 text-sm flex-1"
                              autoFocus
                            />
                            <button onClick={() => saveEditName(field.id)} className="text-green-400 hover:text-green-300">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-medium">{field.name}</span>
                            {field.required && <span className="text-red-400 text-xs">obrigatório</span>}
                            <button
                              onClick={() => { setEditingId(field.id); setEditName(field.name); }}
                              className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <p className="text-muted-foreground text-xs font-mono mt-0.5">{field.fieldKey}</p>
                        {field.fieldType === 'select' && Array.isArray(field.options) && field.options.length > 0 && (
                          <p className="text-muted-foreground text-xs mt-0.5 truncate">
                            Opções: {field.options.join(', ')}
                          </p>
                        )}
                      </div>

                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${TYPE_BADGE[field.fieldType] ?? 'bg-muted text-foreground'}`}>
                        {FIELD_TYPES.find(t => t.value === field.fieldType)?.label ?? field.fieldType}
                      </span>

                      <button
                        onClick={() => toggleActive(field)}
                        title={field.isActive ? 'Desativar' : 'Ativar'}
                        className={`text-xs px-2 py-0.5 rounded flex-shrink-0 border ${field.isActive ? 'border-green-600 text-green-400 hover:bg-red-900/20 hover:text-red-400 hover:border-red-600' : 'border-border text-muted-foreground hover:text-green-400 hover:border-green-600'}`}
                      >
                        {field.isActive ? 'Ativo' : 'Inativo'}
                      </button>

                      <button onClick={() => remove(field.id)} className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-900/20 rounded flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New field modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Novo Campo Customizado</h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Entidade *</label>
                <select value={fEntity} onChange={e => setFEntity(e.target.value)}
                  className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm">
                  {ENTITIES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Nome do campo *</label>
                <input value={fName} onChange={e => handleNameChange(e.target.value)}
                  placeholder="ex: Segmento de Mercado"
                  className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Chave (gerada automaticamente)</label>
                <input value={fKey} onChange={e => setFKey(e.target.value)}
                  className="w-full bg-muted border border-border text-muted-foreground rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Tipo</label>
                <select value={fType} onChange={e => setFType(e.target.value)}
                  className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm">
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {fType === 'select' && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Opções (uma por linha)</label>
                  <textarea value={fOptions} onChange={e => setFOptions(e.target.value)}
                    rows={4}
                    placeholder={"Opção 1\nOpção 2\nOpção 3"}
                    className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm resize-none" />
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={fRequired} onChange={e => setFRequired(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-muted" />
                <span className="text-sm text-foreground">Campo obrigatório</span>
              </label>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-muted hover:bg-muted text-foreground py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={create}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium">
                Criar Campo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
