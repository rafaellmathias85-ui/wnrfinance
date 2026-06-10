'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { X, Check, Shield } from 'lucide-react';

const MODULES = [
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'contas-pagar', label: 'Contas a Pagar' },
  { id: 'contas-receber', label: 'Contas a Receber' },
  { id: 'faturamento', label: 'Faturamento' },
  { id: 'inadimplencia', label: 'Inadimplência' },
  { id: 'conciliacao', label: 'Conciliação' },
  { id: 'contratos', label: 'Contratos' },
  { id: 'fluxo-caixa', label: 'Fluxo de Caixa' },
  { id: 'dre', label: 'DRE' },
  { id: 'extrato', label: 'Extrato' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'bancos', label: 'Bancos' },
  { id: 'cartoes', label: 'Cartões' },
  { id: 'investimentos', label: 'Investimentos' },
  { id: 'cobrancas', label: 'Cobranças' },
  { id: 'compras', label: 'Compras' },
  { id: 'centros-custo', label: 'Centros de Custo' },
  { id: 'nfe', label: 'NF-e' },
  { id: 'fiscal', label: 'Fiscal' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'vendas', label: 'Vendas' },
  { id: 'crm', label: 'CRM' },
  { id: 'servicedesk', label: 'ServiceDesk' },
  { id: 'bpm', label: 'BPM' },
  { id: 'configuracoes', label: 'Configurações' },
  { id: 'usuarios', label: 'Usuários' },
];

const ACTIONS = [
  { id: 'visualizar', label: 'Ver' },
  { id: 'criar', label: 'Criar' },
  { id: 'editar', label: 'Editar' },
  { id: 'deletar', label: 'Deletar' },
  { id: 'exportar', label: 'Exportar' },
  { id: 'aprovar', label: 'Aprovar' },
];

type PermMap = Record<string, Record<string, boolean>>;

const PROFILES = {
  owner: () => {
    const m: PermMap = {};
    MODULES.forEach((mod) => {
      m[mod.id] = {};
      ACTIONS.forEach((a) => { m[mod.id][a.id] = true; });
    });
    return m;
  },
  manager: () => {
    const m: PermMap = {};
    MODULES.forEach((mod) => {
      m[mod.id] = {};
      ACTIONS.forEach((a) => {
        m[mod.id][a.id] = !(a.id === 'deletar' || mod.id === 'usuarios');
      });
    });
    return m;
  },
  operator: () => {
    const m: PermMap = {};
    MODULES.forEach((mod) => {
      m[mod.id] = {};
      ACTIONS.forEach((a) => {
        m[mod.id][a.id] = ['visualizar', 'criar', 'editar'].includes(a.id);
      });
    });
    return m;
  },
  readonly: () => {
    const m: PermMap = {};
    MODULES.forEach((mod) => {
      m[mod.id] = {};
      ACTIONS.forEach((a) => { m[mod.id][a.id] = a.id === 'visualizar'; });
    });
    return m;
  },
};

function detectProfile(perms: PermMap): string {
  const allTrue = MODULES.every((mod) => ACTIONS.every((a) => perms[mod.id]?.[a.id]));
  if (allTrue) return 'Proprietário';
  const noneDelete = MODULES.every((mod) =>
    ACTIONS.every((a) => {
      if (a.id === 'deletar' || mod.id === 'usuarios') return !perms[mod.id]?.[a.id];
      return perms[mod.id]?.[a.id];
    })
  );
  if (noneDelete) return 'Gerente';
  const onlyBasic = MODULES.every((mod) =>
    ACTIONS.every((a) => {
      const expected = ['visualizar', 'criar', 'editar'].includes(a.id);
      return perms[mod.id]?.[a.id] === expected;
    })
  );
  if (onlyBasic) return 'Operador';
  const onlyView = MODULES.every((mod) =>
    ACTIONS.every((a) => perms[mod.id]?.[a.id] === (a.id === 'visualizar'))
  );
  if (onlyView) return 'Somente Leitura';
  return 'Personalizado';
}

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
}

export function UserPermissionsModal({ userId, userName, onClose }: Props) {
  const [perms, setPerms] = useState<PermMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`/api/pj/permissions?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        const map: PermMap = {};
        MODULES.forEach((mod) => {
          map[mod.id] = {};
          ACTIONS.forEach((a) => { map[mod.id][a.id] = false; });
        });
        (d.permissions || []).forEach((p: any) => {
          if (!map[p.module]) map[p.module] = {};
          map[p.module][p.action] = p.allowed;
        });
        setPerms(map);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const toggle = (mod: string, action: string) => {
    setPerms((prev) => ({
      ...prev,
      [mod]: { ...prev[mod], [action]: !prev[mod]?.[action] },
    }));
  };

  const applyProfile = (key: keyof typeof PROFILES) => {
    setPerms(PROFILES[key]());
  };

  const save = async () => {
    setSaving(true);
    const payload: Array<{ module: string; action: string; allowed: boolean }> = [];
    MODULES.forEach((mod) => {
      ACTIONS.forEach((a) => {
        payload.push({ module: mod.id, action: a.id, allowed: !!perms[mod.id]?.[a.id] });
      });
    });
    const r = await apiFetch('/api/pj/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, permissions: payload }),
    });
    if (r.ok) { toast.success('Permissões salvas'); onClose(); }
    else { const d = await r.json(); toast.error(d.error || 'Erro ao salvar'); }
    setSaving(false);
  };

  const profile = detectProfile(perms);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-white font-bold">Permissões — {userName}</h3>
              <p className="text-slate-400 text-xs">Perfil atual: <span className="text-blue-300 font-medium">{profile}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Quick profiles */}
        <div className="flex gap-2 px-6 py-3 border-b border-slate-700">
          <span className="text-slate-400 text-xs self-center mr-2">Perfil rápido:</span>
          {([
            { key: 'owner' as const, label: 'Proprietário', color: 'bg-amber-600 hover:bg-amber-500' },
            { key: 'manager' as const, label: 'Gerente', color: 'bg-blue-600 hover:bg-blue-500' },
            { key: 'operator' as const, label: 'Operador', color: 'bg-green-700 hover:bg-green-600' },
            { key: 'readonly' as const, label: 'Somente Leitura', color: 'bg-slate-600 hover:bg-slate-500' },
          ]).map((p) => (
            <button key={p.key} onClick={() => applyProfile(p.key)}
              className={`px-3 py-1.5 rounded-lg text-white text-xs font-medium ${p.color}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Matrix */}
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Carregando...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-300 font-medium w-48">Módulo</th>
                  {ACTIONS.map((a) => (
                    <th key={a.id} className="text-center px-3 py-3 text-slate-400 font-medium">{a.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {MODULES.map((mod) => (
                  <tr key={mod.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-2 text-slate-200 font-medium">{mod.label}</td>
                    {ACTIONS.map((a) => {
                      const checked = !!perms[mod.id]?.[a.id];
                      return (
                        <td key={a.id} className="px-3 py-2 text-center">
                          <button
                            onClick={() => toggle(mod.id, a.id)}
                            className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors ${
                              checked
                                ? 'bg-green-600 hover:bg-green-500'
                                : 'bg-slate-700 hover:bg-slate-600 border border-slate-600'
                            }`}
                          >
                            {checked && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">Cancelar</button>
          <button onClick={save} disabled={saving || loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar Permissões'}
          </button>
        </div>
      </div>
    </div>
  );
}
