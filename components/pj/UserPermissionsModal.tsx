'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { X } from 'lucide-react';

// ─── Module + Feature definitions ──────────────────────────────────────────

type FeatureRow = { id: string; label: string };
type Section = { id: string; label: string; features: FeatureRow[] };
type ModuleDef = { id: string; label: string; sections: Section[] };

const MODULES_DEF: ModuleDef[] = [
  {
    id: 'financeiro',
    label: 'Financeiro',
    sections: [
      {
        id: 'dia-a-dia', label: 'Dia-a-Dia',
        features: [
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'contas-receber', label: 'Contas a Receber' },
          { id: 'contas-pagar', label: 'Contas a Pagar' },
          { id: 'movimentacao', label: 'Movimentação' },
          { id: 'faturamento', label: 'Faturamento' },
          { id: 'inadimplencia', label: 'Inadimplência' },
          { id: 'conciliacao', label: 'Conciliação' },
          { id: 'contratos', label: 'Contratos' },
          { id: 'aprovacao-financeira', label: 'Aprovação Financeira' },
          { id: 'envio-remessa', label: 'Envio de Remessa' },
          { id: 'retorno-remessa', label: 'Retorno Remessa' },
          { id: 'historico-movimentacao', label: 'Histórico de Movimentação' },
          { id: 'fatura-cartao', label: 'Fatura Cartão de Crédito' },
        ],
      },
      {
        id: 'cadastros', label: 'Cadastros',
        features: [
          { id: 'servico', label: 'Serviço' },
          { id: 'tipo-servico', label: 'Tipo de Serviço' },
          { id: 'minhas-empresas', label: 'Minhas Empresas' },
          { id: 'fornecedor', label: 'Fornecedor' },
          { id: 'cliente', label: 'Cliente' },
          { id: 'plano-contas', label: 'Plano de Contas' },
          { id: 'contas-bancarias', label: 'Contas Bancárias' },
          { id: 'departamento', label: 'Departamento' },
          { id: 'funcionario', label: 'Funcionário' },
          { id: 'ramo-atividade', label: 'Ramo de Atividade' },
          { id: 'tipo-atividade', label: 'Tipo de Atividade' },
          { id: 'etiqueta', label: 'Etiqueta' },
        ],
      },
      {
        id: 'visoes', label: 'Visões',
        features: [
          { id: 'resumo-empresas', label: 'Resumo das Empresas' },
          { id: 'fluxo-caixa', label: 'Fluxo de Caixa' },
          { id: 'dre', label: 'DRE' },
          { id: 'relatorio', label: 'Relatório' },
          { id: 'extrato', label: 'Extrato' },
          { id: 'relatorio-avancado', label: 'Relatório Avançado' },
          { id: 'relatorio-comparativo', label: 'Relatório Comparativo' },
          { id: 'previsao-orcamentaria', label: 'Previsão Orçamentária' },
        ],
      },
      {
        id: 'avancado', label: 'Avançado',
        features: [
          { id: 'caixa-email', label: 'Caixa de E-mail' },
          { id: 'configuracoes-gerais', label: 'Configurações Gerais' },
        ],
      },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque',
    sections: [
      {
        id: 'dia-a-dia', label: 'Dia-a-Dia',
        features: [
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'entrada-produto', label: 'Entrada de Produto' },
          { id: 'saida-estoque', label: 'Saída de Estoque' },
          { id: 'ajuste-estoque', label: 'Ajuste de Estoque' },
          { id: 'transferencia', label: 'Transferência' },
          { id: 'pedidos', label: 'Pedidos' },
          { id: 'pedido-compra', label: 'Pedido de Compra' },
          { id: 'processo-compra', label: 'Processo de Compra' },
          { id: 'consultar-movimentacoes', label: 'Consultar Movimentações' },
          { id: 'consulta-estoque', label: 'Consulta de Estoque' },
        ],
      },
      {
        id: 'cadastros', label: 'Cadastros',
        features: [
          { id: 'produto', label: 'Produto' },
          { id: 'estoque-satelite', label: 'Estoque Satélite' },
          { id: 'minhas-empresas', label: 'Minhas Empresas' },
          { id: 'departamento', label: 'Departamento' },
          { id: 'fornecedor', label: 'Fornecedor' },
          { id: 'classe-produto', label: 'Classe de Produto' },
          { id: 'grupo-produto', label: 'Grupo de Produto' },
          { id: 'familia-produto', label: 'Família Produto' },
          { id: 'unidade-produto', label: 'Unidade de Produto' },
          { id: 'caracteristica-grade', label: 'Característica de Grade' },
        ],
      },
      {
        id: 'visoes', label: 'Visões',
        features: [
          { id: 'relatorio', label: 'Relatório' },
          { id: 'relatorio-avancado', label: 'Relatório Avançado' },
        ],
      },
      {
        id: 'avancado', label: 'Avançado',
        features: [
          { id: 'configuracoes-gerais', label: 'Configurações Gerais' },
          { id: 'portal-intranet', label: 'Portal Intranet' },
        ],
      },
    ],
  },
  {
    id: 'vendas',
    label: 'Vendas',
    sections: [
      {
        id: 'dia-a-dia', label: 'Dia-a-Dia',
        features: [
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'cadastros', label: 'Cadastros' },
          { id: 'relatorios', label: 'Relatórios' },
        ],
      },
      {
        id: 'avancado', label: 'Avançado',
        features: [
          { id: 'configuracoes', label: 'Configurações' },
        ],
      },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    sections: [
      {
        id: 'dia-a-dia', label: 'Dia-a-Dia',
        features: [
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'cadastros', label: 'Cadastros' },
          { id: 'relatorios', label: 'Relatórios' },
        ],
      },
      {
        id: 'avancado', label: 'Avançado',
        features: [
          { id: 'configuracoes', label: 'Configurações' },
        ],
      },
    ],
  },
  {
    id: 'servicedesk',
    label: 'ServiceDesk',
    sections: [
      {
        id: 'dia-a-dia', label: 'Dia-a-Dia',
        features: [
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'cadastros', label: 'Cadastros' },
          { id: 'relatorios', label: 'Relatórios' },
        ],
      },
      {
        id: 'avancado', label: 'Avançado',
        features: [
          { id: 'configuracoes', label: 'Configurações' },
        ],
      },
    ],
  },
  {
    id: 'bpm',
    label: 'BPM',
    sections: [
      {
        id: 'dia-a-dia', label: 'Dia-a-Dia',
        features: [
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'cadastros', label: 'Cadastros' },
          { id: 'relatorios', label: 'Relatórios' },
        ],
      },
      {
        id: 'avancado', label: 'Avançado',
        features: [
          { id: 'configuracoes', label: 'Configurações' },
        ],
      },
    ],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    sections: [
      {
        id: 'configuracoes', label: 'Configurações',
        features: [
          { id: 'notificacoes-email', label: 'Notificações por e-mail' },
          { id: 'api-key', label: 'Configuração de API Key' },
          { id: 'integracoes', label: 'Integrações' },
          { id: 'importacao-dados', label: 'Importação de Dados' },
          { id: 'usuarios', label: 'Usuários' },
          { id: 'meu-plano', label: 'Meu Plano' },
        ],
      },
    ],
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────

/** Per-feature access level: 'view' | 'edit' | 'block' */
type AccessLevel = 'view' | 'edit' | 'block';

/** Per-module quick level */
type ModuleLevel = 'custom' | 'total' | 'blocked';

/** State: map of `moduleId.featureId` → AccessLevel */
type PermState = Record<string, AccessLevel>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function featureKey(moduleId: string, featureId: string): string {
  return `${moduleId}.${featureId}`;
}

function allFeaturesInModule(mod: ModuleDef): string[] {
  return mod.sections.flatMap((s) => s.features.map((f) => featureKey(mod.id, f.id)));
}

function detectModuleLevel(state: PermState, mod: ModuleDef): ModuleLevel {
  const keys = allFeaturesInModule(mod);
  if (keys.length === 0) return 'custom';
  if (keys.every((k) => state[k] === 'edit')) return 'total';
  if (keys.every((k) => state[k] === 'block')) return 'blocked';
  return 'custom';
}

/** Convert flat UserPermission[] from API to our PermState */
function apiPermissionsToState(apiPerms: Array<{ module: string; action: string; allowed: boolean }>): PermState {
  // Build a map: key -> { view: bool, edit: bool }
  const raw: Record<string, { view: boolean; edit: boolean }> = {};
  for (const p of apiPerms) {
    if (!raw[p.module]) raw[p.module] = { view: false, edit: false };
    if (p.action === 'view') raw[p.module].view = p.allowed;
    if (p.action === 'edit') raw[p.module].edit = p.allowed;
  }

  const state: PermState = {};
  for (const [key, v] of Object.entries(raw)) {
    if (!v.view && !v.edit) state[key] = 'block';
    else if (v.edit) state[key] = 'edit';
    else state[key] = 'view';
  }
  return state;
}

/** Build the full default state (all features = 'edit') */
function buildDefaultState(): PermState {
  const state: PermState = {};
  for (const mod of MODULES_DEF) {
    for (const sec of mod.sections) {
      for (const feat of sec.features) {
        state[featureKey(mod.id, feat.id)] = 'edit';
      }
    }
  }
  return state;
}

/** Merge loaded API state onto default, so all keys are always present */
function mergeState(loaded: PermState): PermState {
  const base = buildDefaultState();
  return { ...base, ...loaded };
}

/** Convert PermState to the payload expected by the API */
function stateToPayload(state: PermState): Array<{ module: string; action: string; allowed: boolean }> {
  const payload: Array<{ module: string; action: string; allowed: boolean }> = [];
  for (const [key, level] of Object.entries(state)) {
    payload.push({ module: key, action: 'view', allowed: level === 'view' || level === 'edit' });
    payload.push({ module: key, action: 'edit', allowed: level === 'edit' });
  }
  return payload;
}

// ─── Radio circle component ──────────────────────────────────────────────────

function RadioCircle({ selected, color = 'text-blue-500' }: { selected: boolean; color?: string }) {
  return (
    <span className={`text-base leading-none select-none ${selected ? color : 'text-muted-foreground/40'}`}>
      {selected ? '●' : '○'}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
}

export function UserPermissionsModal({ userId, userName, onClose }: Props) {
  const [state, setState] = useState<PermState>(buildDefaultState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeModuleIdx, setActiveModuleIdx] = useState(0);

  // Load permissions from API
  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/pj/permissions?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        const loaded = apiPermissionsToState(d.permissions || []);
        setState(mergeState(loaded));
      })
      .catch(() => {
        toast.error('Erro ao carregar permissões');
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const activeMod = MODULES_DEF[activeModuleIdx];

  // Compute the current module-level for the active tab
  const moduleLevel = detectModuleLevel(state, activeMod);

  // Set a single feature's level
  const setFeatureLevel = useCallback((moduleId: string, featureId: string, level: AccessLevel) => {
    setState((prev) => ({ ...prev, [featureKey(moduleId, featureId)]: level }));
  }, []);

  // Apply a module-level shortcut
  const applyModuleLevel = useCallback((level: ModuleLevel) => {
    if (level === 'custom') return; // custom is only detected, not applied
    const keys = allFeaturesInModule(activeMod);
    setState((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        next[k] = level === 'total' ? 'edit' : 'block';
      }
      return next;
    });
  }, [activeMod]);

  const save = async () => {
    setSaving(true);
    const payload = stateToPayload(state);
    const r = await apiFetch('/api/pj/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, permissions: payload }),
    });
    if (r.ok) {
      toast.success('Permissões salvas');
      onClose();
    } else {
      const d = await r.json();
      toast.error(d.error || 'Erro ao salvar');
    }
    setSaving(false);
  };

  // Tab status icon
  const tabIcon = (mod: ModuleDef) => {
    const lvl = detectModuleLevel(state, mod);
    if (lvl === 'blocked') return '🚫';
    if (lvl === 'total') return '✓';
    return '⚙';
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background border border-border rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="font-bold text-base text-foreground">
            Cadastro de usuário — <span className="text-primary">{userName}</span>
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Module Tabs ── */}
        <div className="flex overflow-x-auto border-b border-border shrink-0 px-2">
          {MODULES_DEF.map((mod, idx) => {
            const isActive = idx === activeModuleIdx;
            return (
              <button
                key={mod.id}
                onClick={() => setActiveModuleIdx(idx)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {mod.label}
                <span className="text-xs">{tabIcon(mod)}</span>
              </button>
            );
          })}
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="p-5 space-y-4">

              {/* Quick access level radios */}
              <div className="flex flex-wrap gap-4 pb-4 border-b border-border">
                {(
                  [
                    { level: 'custom' as ModuleLevel, label: 'Acesso Personalizado' },
                    { level: 'total' as ModuleLevel, label: `Acesso Total ao Módulo ${activeMod.label}` },
                    { level: 'blocked' as ModuleLevel, label: `Acesso BLOQUEADO ao Módulo ${activeMod.label}` },
                  ] as const
                ).map(({ level, label }) => (
                  <button
                    key={level}
                    onClick={() => level !== 'custom' && applyModuleLevel(level)}
                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                      moduleLevel === level
                        ? 'border-primary/60 bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                    } ${level === 'custom' ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <RadioCircle
                      selected={moduleLevel === level}
                      color={
                        level === 'blocked'
                          ? 'text-red-500'
                          : level === 'total'
                          ? 'text-green-500'
                          : 'text-blue-500'
                      }
                    />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {/* Feature matrix */}
              <div className="rounded-lg border border-border overflow-hidden">
                {/* Column header */}
                <div className="grid grid-cols-[1fr_80px_80px_80px] bg-muted/60 border-b border-border">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Funcionalidade</div>
                  <div className="text-center py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">👁 Ver</div>
                  <div className="text-center py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">✏ Editar</div>
                  <div className="text-center py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">🔒 Bloquear</div>
                </div>

                {activeMod.sections.map((sec) => (
                  <div key={sec.id}>
                    {/* Section header row */}
                    <div className="bg-muted/30 px-4 py-1.5 border-b border-border">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{sec.label}</span>
                    </div>

                    {sec.features.map((feat, fi) => {
                      const key = featureKey(activeMod.id, feat.id);
                      const current: AccessLevel = state[key] ?? 'edit';
                      return (
                        <div
                          key={feat.id}
                          className={`grid grid-cols-[1fr_80px_80px_80px] items-center border-b border-border/50 hover:bg-muted/20 transition-colors ${
                            fi % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                          }`}
                        >
                          <div className="px-4 py-2 text-sm text-foreground">{feat.label}</div>

                          {/* Ver */}
                          <div className="flex justify-center py-2">
                            <button
                              onClick={() => setFeatureLevel(activeMod.id, feat.id, 'view')}
                              className="p-1 rounded hover:bg-blue-500/10 transition-colors"
                              title="Somente visualização"
                            >
                              <RadioCircle selected={current === 'view'} color="text-blue-500" />
                            </button>
                          </div>

                          {/* Editar */}
                          <div className="flex justify-center py-2">
                            <button
                              onClick={() => setFeatureLevel(activeMod.id, feat.id, 'edit')}
                              className="p-1 rounded hover:bg-green-500/10 transition-colors"
                              title="Pode editar (implica ver)"
                            >
                              <RadioCircle selected={current === 'edit'} color="text-green-500" />
                            </button>
                          </div>

                          {/* Bloquear */}
                          <div className="flex justify-center py-2">
                            <button
                              onClick={() => setFeatureLevel(activeMod.id, feat.id, 'block')}
                              className="p-1 rounded hover:bg-red-500/10 transition-colors"
                              title="Sem acesso"
                            >
                              <RadioCircle selected={current === 'block'} color="text-red-500" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || loading}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
