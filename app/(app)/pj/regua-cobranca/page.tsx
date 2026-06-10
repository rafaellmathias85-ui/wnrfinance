'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Bell, Mail, MessageCircle, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react';

interface Trigger {
  type: 'before' | 'on' | 'after';
  days: number;
  channels: ('email' | 'whatsapp')[];
  template: string;
}

interface CollectionRule {
  id: string;
  name: string;
  isActive: boolean;
  triggers: Trigger[];
  createdAt: string;
}

const DEFAULT_TEMPLATE = 'Olá {nome}, você tem uma cobrança de {valor} com vencimento em {vencimento}. Acesse: {link_pagamento}';

export default function ReguaCobrancaPage() {
  const [rules, setRules] = useState<CollectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CollectionRule | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch('/api/pj/collection-rules');
    const d = await r.json();
    setRules(d.rules || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const toggleActive = async (rule: CollectionRule) => {
    await apiFetch(`/api/pj/collection-rules?id=${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    loadRules();
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Excluir esta régua de cobrança?')) return;
    await apiFetch(`/api/pj/collection-rules?id=${id}`, { method: 'DELETE' });
    toast.success('Régua excluída');
    loadRules();
  };

  const triggerLabel = (t: Trigger) => {
    if (t.type === 'on') return 'No dia do vencimento';
    if (t.type === 'before') return `${t.days} dia(s) ANTES`;
    return `${t.days} dia(s) APÓS`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Régua de Cobrança</h1>
          <p className="text-slate-400 text-sm mt-0.5">Automatize o envio de lembretes por email e WhatsApp</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nova Régua
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-4">
        <p className="text-blue-300 text-sm font-medium mb-1">Como funciona</p>
        <p className="text-blue-400/80 text-xs">
          Configure gatilhos temporais (antes, no dia, ou após o vencimento) e defina os canais de envio (email e/ou WhatsApp).
          Use variáveis: <code className="text-blue-300">{'{nome}'}</code>, <code className="text-blue-300">{'{valor}'}</code>, <code className="text-blue-300">{'{vencimento}'}</code>, <code className="text-blue-300">{'{link_pagamento}'}</code>
        </p>
      </div>

      {/* Rules list */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Carregando...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhuma régua cadastrada</p>
          <p className="text-slate-500 text-sm mt-1">Crie sua primeira régua de cobrança automática</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-white font-semibold">{rule.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      rule.isActive
                        ? 'bg-green-900/40 text-green-300'
                        : 'bg-slate-700 text-slate-400'
                    }`}>
                      {rule.isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(rule.triggers as Trigger[]).map((t, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-slate-900/60 rounded-lg px-2.5 py-1.5">
                        <span className="text-slate-300 text-xs">{triggerLabel(t)}</span>
                        <span className="text-slate-500">·</span>
                        {t.channels.includes('email') && <Mail className="w-3.5 h-3.5 text-blue-400" />}
                        {t.channels.includes('whatsapp') && <MessageCircle className="w-3.5 h-3.5 text-green-400" />}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(rule)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700" title="Ativar/Desativar">
                    {rule.isActive ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button onClick={() => { setEditing(rule); setShowModal(true); }} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteRule(rule.id)} className="p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-900/20">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <RuleModal
          rule={editing}
          onClose={() => setShowModal(false)}
          onSaved={loadRules}
        />
      )}
    </div>
  );
}

function RuleModal({ rule, onClose, onSaved }: { rule: CollectionRule | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(rule?.name || '');
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [triggers, setTriggers] = useState<Trigger[]>(
    rule?.triggers || [{ type: 'before', days: 3, channels: ['email'], template: DEFAULT_TEMPLATE }]
  );
  const [saving, setSaving] = useState(false);

  const addTrigger = () => {
    setTriggers((prev) => [...prev, { type: 'after', days: 1, channels: ['email'], template: DEFAULT_TEMPLATE }]);
  };

  const removeTrigger = (i: number) => {
    setTriggers((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateTrigger = (i: number, key: keyof Trigger, value: any) => {
    setTriggers((prev) => prev.map((t, idx) => idx === i ? { ...t, [key]: value } : t));
  };

  const toggleChannel = (i: number, ch: 'email' | 'whatsapp') => {
    setTriggers((prev) => prev.map((t, idx) => {
      if (idx !== i) return t;
      const channels = t.channels.includes(ch)
        ? t.channels.filter((c) => c !== ch)
        : [...t.channels, ch];
      return { ...t, channels };
    }));
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Nome obrigatório'); return; }
    if (triggers.length === 0) { toast.error('Adicione ao menos um gatilho'); return; }
    setSaving(true);
    const method = rule ? 'PUT' : 'POST';
    const url = rule ? `/api/pj/collection-rules?id=${rule.id}` : '/api/pj/collection-rules';
    const r = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), isActive, triggers }),
    });
    if (r.ok) { toast.success(rule ? 'Régua atualizada' : 'Régua criada'); onSaved(); onClose(); }
    else { const d = await r.json(); toast.error(d.error || 'Erro ao salvar'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h3 className="text-white font-bold">{rule ? 'Editar Régua' : 'Nova Régua de Cobrança'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nome da Régua *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              placeholder="Ex.: Cobrança padrão 30 dias"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Régua ativa
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-medium text-sm">Gatilhos</p>
              <button onClick={addTrigger} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Adicionar gatilho
              </button>
            </div>

            <div className="space-y-3">
              {triggers.map((t, i) => (
                <div key={i} className="bg-slate-900/60 border border-slate-600 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-300 text-xs font-medium">Gatilho {i + 1}</p>
                    {triggers.length > 1 && (
                      <button onClick={() => removeTrigger(i)} className="text-red-400 hover:text-red-300">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Quando</label>
                      <select
                        value={t.type}
                        onChange={(e) => updateTrigger(i, 'type', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="before">Dias ANTES do vencimento</option>
                        <option value="on">No dia do vencimento</option>
                        <option value="after">Dias APÓS o vencimento</option>
                      </select>
                    </div>
                    {t.type !== 'on' && (
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Dias</label>
                        <input
                          type="number"
                          min={1}
                          value={t.days}
                          onChange={(e) => updateTrigger(i, 'days', parseInt(e.target.value) || 1)}
                          className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Canal de envio</label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1.5 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={t.channels.includes('email')}
                          onChange={() => toggleChannel(i, 'email')}
                        />
                        <Mail className="w-4 h-4 text-blue-400" /> Email
                      </label>
                      <label className="flex items-center gap-1.5 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={t.channels.includes('whatsapp')}
                          onChange={() => toggleChannel(i, 'whatsapp')}
                        />
                        <MessageCircle className="w-4 h-4 text-green-400" /> WhatsApp
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Template da mensagem</label>
                    <textarea
                      value={t.template}
                      onChange={(e) => updateTrigger(i, 'template', e.target.value)}
                      rows={3}
                      className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm resize-none"
                      placeholder={DEFAULT_TEMPLATE}
                    />
                    <p className="text-slate-500 text-xs mt-1">
                      Variáveis: {'{nome}'}, {'{valor}'}, {'{vencimento}'}, {'{link_pagamento}'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar Régua'}
          </button>
        </div>
      </div>
    </div>
  );
}
