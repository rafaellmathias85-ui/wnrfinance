'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Plus, Save, Trash2, X, GitBranch, ArrowLeft } from 'lucide-react';
import dynamic from 'next/dynamic';

const FlowEditor = dynamic(() => import('@/components/pj/BPMFlowEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-slate-900/50 rounded-xl">
      <p className="text-slate-500 text-sm">Carregando editor...</p>
    </div>
  ),
});

interface FlowSummary {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  updatedAt: string;
}

export default function BPMPage() {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFlow, setEditingFlow] = useState<any | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch('/api/pj/bpm');
    setFlows(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openFlow = async (id: string) => {
    const r = await apiFetch(`/api/pj/bpm?id=${id}`);
    const flow = await r.json();
    setEditingFlow(flow);
  };

  const createFlow = async () => {
    if (!newName.trim()) { toast.error('Nome obrigatório'); return; }
    const res = await apiFetch('/api/pj/bpm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDesc }),
    });
    if (res.ok) {
      const flow = await res.json();
      toast.success('Fluxo criado');
      setShowNewForm(false);
      setNewName(''); setNewDesc('');
      setEditingFlow(flow);
      load();
    } else {
      const d = await res.json();
      toast.error(d.error || 'Erro');
    }
  };

  const deleteFlow = async (id: string) => {
    if (!confirm('Excluir este fluxo?')) return;
    const res = await apiFetch(`/api/pj/bpm?id=${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Excluído'); load(); }
  };

  const saveFlow = async (id: string, nodes: any[], edges: any[]) => {
    const res = await apiFetch(`/api/pj/bpm?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges }),
    });
    if (res.ok) toast.success('Fluxo salvo');
    else toast.error('Erro ao salvar');
  };

  if (editingFlow) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-700 flex-shrink-0 bg-slate-800">
          <div className="flex items-center gap-3">
            <button onClick={() => setEditingFlow(null)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-white font-medium">{editingFlow.name}</h2>
              {editingFlow.description && <p className="text-slate-400 text-xs">{editingFlow.description}</p>}
            </div>
          </div>
          <button
            onClick={() => saveFlow(editingFlow.id, editingFlow.nodes, editingFlow.edges)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
          >
            <Save className="w-4 h-4" /> Salvar
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <FlowEditor
            initialNodes={editingFlow.nodes || []}
            initialEdges={editingFlow.edges || []}
            onSave={(nodes: any[], edges: any[]) => {
              setEditingFlow((f: any) => ({ ...f, nodes, edges }));
              saveFlow(editingFlow.id, nodes, edges);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fluxos BPM</h1>
          <p className="text-slate-400 text-sm mt-0.5">Modelagem de processos de negócio com editor visual</p>
        </div>
        <button onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> Novo Fluxo
        </button>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm">Carregando...</div>
      ) : flows.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center">
          <GitBranch className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhum fluxo criado</p>
          <p className="text-slate-500 text-sm mt-1">Crie fluxos visuais para modelar seus processos</p>
          <button onClick={() => setShowNewForm(true)}
            className="mt-4 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">
            Criar primeiro fluxo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {flows.map((flow) => (
            <div key={flow.id}
              className="bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl p-4 cursor-pointer transition-colors"
              onClick={() => openFlow(flow.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <GitBranch className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{flow.name}</p>
                    {flow.description && <p className="text-slate-400 text-xs mt-0.5 truncate">{flow.description}</p>}
                    <p className="text-slate-500 text-xs mt-1">
                      Atualizado {new Date(flow.updatedAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteFlow(flow.id); }}
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded ml-2">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Novo Fluxo BPM</h3>
              <button onClick={() => setShowNewForm(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome *</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="ex: Processo de Onboarding"
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Descrição</label>
                <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowNewForm(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={createFlow}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium">
                Criar e Editar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
