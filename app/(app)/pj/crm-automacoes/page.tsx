'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Zap, X, ToggleLeft, ToggleRight } from 'lucide-react';

interface Action {
  type: 'email' | 'whatsapp' | 'tag' | 'task';
  template?: string;
  to?: string;
  tag?: string;
  taskTitle?: string;
}

interface Automation {
  id: string;
  name: string;
  isActive: boolean;
  trigger: string;
  conditions: any;
  actions: Action[];
  lastRunAt?: string;
  runCount: number;
}

const TRIGGERS: Record<string, string> = {
  new_client: 'Novo Cliente',
  new_receivable: 'Nova Cobrança',
  payment_received: 'Pagamento Recebido',
  overdue: 'Cobrança Vencida',
  contract_expiring: 'Contrato a Vencer',
};

const ACTION_TYPES: Record<string, string> = {
  email: 'Enviar E-mail',
  whatsapp: 'Enviar WhatsApp',
  tag: 'Adicionar Tag',
  task: 'Criar Tarefa',
};

export default function CRMAutomationsPage() {
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);

  const [form, setForm] = useState({
    name: '',
    trigger: 'new_client',
    isActive: true,
    actions: [{ type: 'email' as const, template: '', to: '' }] as Action[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch('/api/pj/crm-automations');
    setItems(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', trigger: 'new_client', isActive: true, actions: [{ type: 'email', template: '', to: '' }] });
    setShowForm(true);
  };

  const openEdit = (item: Automation) => {
    setEditing(item);
    setForm({
      name: item.name,
      trigger: item.trigger,
      isActive: item.isActive,
      actions: item.actions as Action[],
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return; }
    if (!form.actions.length) { toast.error('Ao menos uma ação é obrigatória'); return; }
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `/api/pj/crm-automations?id=${editing.id}` : '/api/pj/crm-automations';
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success(editing ? 'Automação atualizada' : 'Automação criada');
      setShowForm(false);
      load();
    } else {
      const d = await res.json();
      toast.error(d.error || 'Erro ao salvar');
    }
  };

  const toggleActive = async (item: Automation) => {
    const res = await apiFetch(`/api/pj/crm-automations?id=${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    if (res.ok) { load(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta automação?')) return;
    const res = await apiFetch(`/api/pj/crm-automations?id=${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Excluída'); load(); }
  };

  const addAction = () => setForm((p) => ({ ...p, actions: [...p.actions, { type: 'email', template: '', to: '' }] }));
  const removeAction = (idx: number) => setForm((p) => ({ ...p, actions: p.actions.filter((_, i) => i !== idx) }));
  const updateAction = (idx: number, field: string, value: string) => {
    setForm((p) => ({
      ...p,
      actions: p.actions.map((a, i) => i === idx ? { ...a, [field]: value } : a),
    }));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automações CRM</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Regras automáticas para e-mail, WhatsApp e tarefas</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> Nova Automação
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-muted-foreground text-sm">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <Zap className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-muted-foreground">Nenhuma automação configurada</p>
            <p className="text-muted-foreground text-xs mt-1">Crie regras automáticas para engajar seus clientes</p>
          </div>
        ) : items.map((item) => (
          <div key={item.id} className={`bg-card border rounded-xl p-4 ${item.isActive ? 'border-border' : 'border-border/50 opacity-60'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.isActive ? 'bg-blue-600' : 'bg-muted'}`}>
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-foreground font-medium">{item.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="px-2 py-0.5 bg-muted rounded-full">{TRIGGERS[item.trigger] ?? item.trigger}</span>
                    <span>{item.actions.length} ação(ões)</span>
                    {item.runCount > 0 && <span>Executou {item.runCount}×</span>}
                    {item.lastRunAt && <span>Última: {new Date(item.lastRunAt).toLocaleDateString('pt-BR')}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(item.actions as Action[]).map((a, i) => (
                      <span key={i} className="px-2 py-0.5 bg-muted/60 border border-border rounded text-xs text-foreground">
                        {ACTION_TYPES[a.type] ?? a.type}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => toggleActive(item)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg">
                  {item.isActive ? <ToggleRight className="w-5 h-5 text-blue-400" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(item.id)} className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-900/20 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-white font-bold">{editing ? 'Editar Automação' : 'Nova Automação CRM'}</h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Nome *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="ex: Boas-vindas novo cliente"
                  className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Gatilho *</label>
                <select value={form.trigger} onChange={(e) => setForm((p) => ({ ...p, trigger: e.target.value }))}
                  className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm">
                  {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {/* Actions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground">Ações *</label>
                  <button onClick={addAction} className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>
                <div className="space-y-2">
                  {form.actions.map((action, idx) => (
                    <div key={idx} className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <select value={action.type}
                          onChange={(e) => updateAction(idx, 'type', e.target.value)}
                          className="bg-muted border border-border text-foreground rounded px-2 py-1.5 text-xs flex-1">
                          {Object.entries(ACTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        {form.actions.length > 1 && (
                          <button onClick={() => removeAction(idx)} className="text-red-400 hover:text-red-300">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {(action.type === 'email' || action.type === 'whatsapp') && (
                        <>
                          <input value={action.to || ''} onChange={(e) => updateAction(idx, 'to', e.target.value)}
                            placeholder={action.type === 'email' ? 'Destinatário (ou {client_email})' : 'Número (ou {client_phone})'}
                            className="w-full bg-muted border border-border text-foreground rounded px-2 py-1.5 text-xs" />
                          <textarea value={action.template || ''} onChange={(e) => updateAction(idx, 'template', e.target.value)}
                            placeholder="Mensagem... Use {client_name}, {amount}, {due_date}"
                            rows={3}
                            className="w-full bg-muted border border-border text-foreground rounded px-2 py-1.5 text-xs" />
                        </>
                      )}
                      {action.type === 'tag' && (
                        <input value={action.tag || ''} onChange={(e) => updateAction(idx, 'tag', e.target.value)}
                          placeholder="Nome da tag"
                          className="w-full bg-muted border border-border text-foreground rounded px-2 py-1.5 text-xs" />
                      )}
                      {action.type === 'task' && (
                        <input value={action.taskTitle || ''} onChange={(e) => updateAction(idx, 'taskTitle', e.target.value)}
                          placeholder="Título da tarefa"
                          className="w-full bg-muted border border-border text-foreground rounded px-2 py-1.5 text-xs" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
                Ativar automação
              </label>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-muted hover:bg-muted text-foreground py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={handleSave}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
