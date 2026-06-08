import { prisma } from '@/lib/db';

/* ================================================================== */
/*  Permission System Constants                                        */
/* ================================================================== */

export const ROLES = ['master', 'admin', 'gestor', 'operador', 'cliente', 'user'] as const;
export type AppRole = typeof ROLES[number];

export const ROLE_HIERARCHY: Record<string, number> = {
  master: 100, admin: 80, gestor: 60, operador: 40, cliente: 20, user: 10,
};

export const ROLE_LABELS: Record<string, string> = {
  master: 'Master', admin: 'Administrador', gestor: 'Gestor',
  operador: 'Operador', cliente: 'Cliente', user: 'Usu\u00e1rio',
};

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approve'] as const;
export type AppAction = typeof ACTIONS[number];

export const ACTION_LABELS: Record<string, string> = {
  view: 'Visualizar', create: 'Criar', edit: 'Editar',
  delete: 'Excluir', export: 'Exportar', approve: 'Aprovar',
};

/* ================================================================== */
/*  Module Structure — Granular sub-items organized in columns          */
/* ================================================================== */

export interface PermSubItem {
  id: string;       // e.g. "financeiro.contas_pagar"
  label: string;
}

export interface PermColumn {
  title: string;    // "Dia a Dia", "Cadastros", "Vis\u00f5es"
  items: PermSubItem[];
}

export interface PermModule {
  id: string;
  label: string;
  icon?: string;
  columns: PermColumn[];
}

/** PF (Pessoa Física) permission modules */
export const PF_PERM_MODULES: PermModule[] = [
  {
    id: 'pf:receitas',
    label: 'Receitas',
    columns: [
      {
        title: 'Operações',
        items: [
          { id: 'pf:receitas.dashboard', label: 'Dashboard' },
          { id: 'pf:receitas.lancamentos', label: 'Lançamentos' },
          { id: 'pf:receitas.recorrentes', label: 'Recorrentes' },
          { id: 'pf:receitas.categorias', label: 'Categorias' },
        ],
      },
      {
        title: 'Visões',
        items: [
          { id: 'pf:receitas.relatorio', label: 'Relatório' },
          { id: 'pf:receitas.grafico', label: 'Gráfico' },
        ],
      },
    ],
  },
  {
    id: 'pf:despesas',
    label: 'Despesas',
    columns: [
      {
        title: 'Operações',
        items: [
          { id: 'pf:despesas.dashboard', label: 'Dashboard' },
          { id: 'pf:despesas.lancamentos', label: 'Lançamentos' },
          { id: 'pf:despesas.recorrentes', label: 'Recorrentes' },
          { id: 'pf:despesas.categorias', label: 'Categorias' },
        ],
      },
      {
        title: 'Visões',
        items: [
          { id: 'pf:despesas.relatorio', label: 'Relatório' },
          { id: 'pf:despesas.grafico', label: 'Gráfico' },
        ],
      },
    ],
  },
  {
    id: 'pf:cartoes',
    label: 'Cartões',
    columns: [
      {
        title: 'Operações',
        items: [
          { id: 'pf:cartoes.cartoes', label: 'Meus Cartões' },
          { id: 'pf:cartoes.faturas', label: 'Faturas' },
          { id: 'pf:cartoes.lancamentos', label: 'Lançamentos' },
        ],
      },
      {
        title: 'Visões',
        items: [
          { id: 'pf:cartoes.relatorio', label: 'Relatório' },
        ],
      },
    ],
  },
  {
    id: 'pf:investimentos',
    label: 'Investimentos',
    columns: [
      {
        title: 'Operações',
        items: [
          { id: 'pf:investimentos.dashboard', label: 'Dashboard' },
          { id: 'pf:investimentos.carteira', label: 'Carteira' },
          { id: 'pf:investimentos.aportes', label: 'Aportes / Resgates' },
          { id: 'pf:investimentos.ativos', label: 'Ativos' },
        ],
      },
      {
        title: 'Visões',
        items: [
          { id: 'pf:investimentos.relatorio', label: 'Relatório' },
          { id: 'pf:investimentos.rentabilidade', label: 'Rentabilidade' },
        ],
      },
    ],
  },
  {
    id: 'pf:metas',
    label: 'Metas',
    columns: [
      {
        title: 'Operações',
        items: [
          { id: 'pf:metas.metas', label: 'Minhas Metas' },
          { id: 'pf:metas.aportes', label: 'Aportes' },
          { id: 'pf:metas.caixinhas', label: 'Caixinhas' },
        ],
      },
      {
        title: 'Visões',
        items: [
          { id: 'pf:metas.relatorio', label: 'Relatório' },
        ],
      },
    ],
  },
  {
    id: 'pf:alertas',
    label: 'Alertas',
    columns: [
      {
        title: 'Operações',
        items: [
          { id: 'pf:alertas.alertas', label: 'Meus Alertas' },
          { id: 'pf:alertas.configurar', label: 'Configurar Alertas' },
        ],
      },
    ],
  },
  {
    id: 'pf:relatorios',
    label: 'Relatórios',
    columns: [
      {
        title: 'Relatórios',
        items: [
          { id: 'pf:relatorios.resumo', label: 'Resumo Financeiro' },
          { id: 'pf:relatorios.fluxo_caixa', label: 'Fluxo de Caixa' },
          { id: 'pf:relatorios.patrimonio', label: 'Patrimônio' },
          { id: 'pf:relatorios.imposto', label: 'Imposto de Renda' },
          { id: 'pf:relatorios.avancado', label: 'Relatório Avançado' },
        ],
      },
    ],
  },
  {
    id: 'pf:configuracoes',
    label: 'Configurações',
    columns: [
      {
        title: 'Geral',
        items: [
          { id: 'pf:configuracoes.perfil', label: 'Perfil' },
          { id: 'pf:configuracoes.bancos', label: 'Contas Bancárias' },
          { id: 'pf:configuracoes.integracoes', label: 'Integrações' },
          { id: 'pf:configuracoes.usuarios', label: 'Usuários' },
        ],
      },
    ],
  },
];

/** PJ (Pessoa Jurídica) permission modules */
export const PJ_PERM_MODULES: PermModule[] = [
  {
    id: 'financeiro',
    label: 'Financeiro',
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { id: 'financeiro.dashboard', label: 'Dashboard' },
          { id: 'financeiro.contas_receber', label: 'Contas a Receber' },
          { id: 'financeiro.contas_pagar', label: 'Contas a Pagar' },
          { id: 'financeiro.movimentacao', label: 'Movimenta\u00e7\u00e3o' },
          { id: 'financeiro.faturamento', label: 'Faturamento' },
          { id: 'financeiro.inadimplencia', label: 'Inadimpl\u00eancia' },
          { id: 'financeiro.conciliacao', label: 'Concilia\u00e7\u00e3o' },
          { id: 'financeiro.cartoes', label: 'Cart\u00f5es' },
          { id: 'financeiro.investimentos', label: 'Investimentos' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { id: 'financeiro.bancos', label: 'Contas Banc\u00e1rias' },
          { id: 'financeiro.categorias', label: 'Categorias' },
          { id: 'financeiro.centros_custo', label: 'Centros de Custo' },
          { id: 'financeiro.clientes', label: 'Clientes' },
          { id: 'financeiro.fornecedores', label: 'Fornecedores' },
          { id: 'financeiro.tags', label: 'Tags' },
        ],
      },
      {
        title: 'Vis\u00f5es',
        items: [
          { id: 'financeiro.fluxo_caixa', label: 'Fluxo de Caixa' },
          { id: 'financeiro.dre', label: 'DRE' },
          { id: 'financeiro.relatorios', label: 'Relat\u00f3rios' },
          { id: 'financeiro.relatorio_avancado', label: 'Relat\u00f3rio Avan\u00e7ado' },
        ],
      },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque',
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { id: 'estoque.dashboard', label: 'Dashboard' },
          { id: 'estoque.entrada', label: 'Entrada de Produto' },
          { id: 'estoque.saida', label: 'Sa\u00edda de Estoque' },
          { id: 'estoque.ajuste', label: 'Ajuste de Estoque' },
          { id: 'estoque.transferencia', label: 'Transfer\u00eancia' },
          { id: 'estoque.pedidos', label: 'Pedidos' },
          { id: 'estoque.pedido_compra', label: 'Pedido de Compra' },
          { id: 'estoque.consulta_movimentacao', label: 'Consultar Movimenta\u00e7\u00f5es' },
          { id: 'estoque.consulta_estoque', label: 'Consulta de Estoque' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { id: 'estoque.produtos', label: 'Produtos' },
          { id: 'estoque.categorias', label: 'Categorias' },
          { id: 'estoque.fornecedores', label: 'Fornecedores' },
          { id: 'estoque.depositos', label: 'Dep\u00f3sitos' },
          { id: 'estoque.unidades', label: 'Unidades de Medida' },
        ],
      },
      {
        title: 'Vis\u00f5es',
        items: [
          { id: 'estoque.relatorio', label: 'Relat\u00f3rio' },
          { id: 'estoque.relatorio_avancado', label: 'Relat\u00f3rio Avan\u00e7ado' },
          { id: 'estoque.inventario', label: 'Invent\u00e1rio' },
        ],
      },
    ],
  },
  {
    id: 'vendas',
    label: 'Vendas',
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { id: 'vendas.dashboard', label: 'Dashboard' },
          { id: 'vendas.ordem_servico', label: 'Ordem de Servi\u00e7o' },
          { id: 'vendas.orcamento', label: 'Or\u00e7amento / Venda' },
          { id: 'vendas.comissao', label: 'Lote Comiss\u00e3o' },
          { id: 'vendas.nfe_produto', label: 'Nota Fiscal de Produto' },
          { id: 'vendas.nfe_consumidor', label: 'Nota Fiscal de Consumidor' },
          { id: 'vendas.nfe_servico', label: 'Nota Fiscal de Servi\u00e7os' },
          { id: 'vendas.agenda', label: 'Agenda Vendas' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { id: 'vendas.produtos', label: 'Produtos' },
          { id: 'vendas.tabela_preco', label: 'Tabela de Pre\u00e7o' },
          { id: 'vendas.clientes', label: 'Clientes' },
          { id: 'vendas.vendedores', label: 'Vendedores' },
          { id: 'vendas.equipe', label: 'Equipe' },
          { id: 'vendas.regra_comissao', label: 'Regra Comiss\u00e3o' },
          { id: 'vendas.transportadora', label: 'Transportadora' },
        ],
      },
      {
        title: 'Vis\u00f5es',
        items: [
          { id: 'vendas.relatorio', label: 'Relat\u00f3rio' },
          { id: 'vendas.relatorio_metas', label: 'Relat\u00f3rio de Metas' },
          { id: 'vendas.relatorio_avancado', label: 'Relat\u00f3rio Avan\u00e7ado' },
        ],
      },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { id: 'crm.dashboard', label: 'Dashboard' },
          { id: 'crm.oportunidades', label: 'Oportunidades' },
          { id: 'crm.conquistas', label: 'Conquistas' },
          { id: 'crm.perdas', label: 'Perdas' },
          { id: 'crm.agenda', label: 'Agenda CRM' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { id: 'crm.leads', label: 'Leads' },
          { id: 'crm.funil', label: 'Funil de Vendas' },
          { id: 'crm.origem', label: 'Origem Oportunidade' },
          { id: 'crm.vendedores', label: 'Vendedores' },
          { id: 'crm.propostas', label: 'Propostas' },
          { id: 'crm.templates', label: 'Templates de E-mail' },
        ],
      },
      {
        title: 'Vis\u00f5es',
        items: [
          { id: 'crm.relatorio', label: 'Relat\u00f3rio' },
          { id: 'crm.relatorio_avancado', label: 'Relat\u00f3rio Avan\u00e7ado' },
          { id: 'crm.relatorio_metas', label: 'Relat\u00f3rio de Metas' },
        ],
      },
    ],
  },
  {
    id: 'servicedesk',
    label: 'ServiceDesk',
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { id: 'servicedesk.dashboard', label: 'Dashboard' },
          { id: 'servicedesk.tickets', label: 'Tickets' },
          { id: 'servicedesk.agenda', label: 'Agenda ServiceDesk' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { id: 'servicedesk.grupo_suporte', label: 'Grupo de Suporte' },
          { id: 'servicedesk.tipo_ocorrencia', label: 'Tipo de Ocorr\u00eancia' },
          { id: 'servicedesk.agentes', label: 'Agentes' },
          { id: 'servicedesk.clientes', label: 'Clientes' },
          { id: 'servicedesk.templates', label: 'Templates de E-mail' },
          { id: 'servicedesk.tipo_atividade', label: 'Tipo Atividade' },
          { id: 'servicedesk.fluxo_trabalho', label: 'Fluxo de Trabalho' },
        ],
      },
      {
        title: 'Vis\u00f5es',
        items: [
          { id: 'servicedesk.relatorio', label: 'Relat\u00f3rio' },
          { id: 'servicedesk.relatorio_avancado', label: 'Relat\u00f3rio Avan\u00e7ado' },
          { id: 'servicedesk.portal_cliente', label: 'Portal do Cliente' },
        ],
      },
    ],
  },
  {
    id: 'bpm',
    label: 'BPM',
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { id: 'bpm.dashboard', label: 'Dashboard' },
          { id: 'bpm.solicitacao', label: 'Solicita\u00e7\u00e3o Processo' },
          { id: 'bpm.em_andamento', label: 'Processos em Andamento' },
          { id: 'bpm.finalizados', label: 'Processos Finalizados' },
          { id: 'bpm.agenda', label: 'Agenda BPM' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { id: 'bpm.processos', label: 'Processos' },
          { id: 'bpm.papel_organizacional', label: 'Papel Organizacional' },
          { id: 'bpm.departamento', label: 'Departamento' },
          { id: 'bpm.templates', label: 'Templates de E-mail' },
          { id: 'bpm.tipo_atividade', label: 'Tipo Atividade' },
          { id: 'bpm.fluxo_trabalho', label: 'Fluxo de Trabalho' },
        ],
      },
      {
        title: 'Vis\u00f5es',
        items: [
          { id: 'bpm.relatorio', label: 'Relat\u00f3rio' },
          { id: 'bpm.relatorio_avancado', label: 'Relat\u00f3rio Avan\u00e7ado' },
          { id: 'bpm.portal_intranet', label: 'Portal Intranet' },
        ],
      },
    ],
  },
  {
    id: 'configuracoes',
    label: 'Configura\u00e7\u00f5es',
    columns: [
      {
        title: 'Geral',
        items: [
          { id: 'configuracoes.preferencias', label: 'Prefer\u00eancias' },
          { id: 'configuracoes.chaves_api', label: 'Chaves de API' },
          { id: 'configuracoes.integracoes', label: 'Integra\u00e7\u00f5es' },
          { id: 'configuracoes.empresa', label: 'Dados da Empresa' },
          { id: 'configuracoes.usuarios', label: 'Usu\u00e1rios' },
        ],
      },
    ],
  },
];

/** Combined list (backward compat) */
export const PERM_MODULES: PermModule[] = [...PJ_PERM_MODULES, ...PF_PERM_MODULES];

/** Flat list of all module IDs (backward compat) */
export const MODULES = PJ_PERM_MODULES.map(m => m.id);
export type AppModule = string;

export const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  PERM_MODULES.map(m => [m.id, m.label])
);

/* ================================================================== */
/*  Default permissions per role                                       */
/* ================================================================== */
function getDefaultPermission(role: string, module: string, action: string): boolean {
  const level = ROLE_HIERARCHY[role] || 0;
  if (level >= 100) return true;
  if (level >= 80) return true;
  if (level >= 60) {
    if (module === 'admin') return false;
    if (action === 'delete' || action === 'approve') return false;
    return true;
  }
  if (level >= 40) {
    if (['admin', 'empresa', 'configuracoes'].includes(module.split('.')[0])) return false;
    if (action === 'delete' || action === 'approve' || action === 'export') return false;
    return true;
  }
  if (level >= 20) {
    if (['dashboard', 'financeiro'].includes(module.split('.')[0]) && action === 'view') return true;
    return false;
  }
  if (['admin', 'empresa'].includes(module.split('.')[0])) return false;
  return action === 'view';
}

/* ================================================================== */
/*  Permission checking                                                */
/* ================================================================== */
export async function checkPermission(
  userId: string, module: string, action: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { role: true },
  });
  if (!user) return false;
  if (user.role === 'master') return true;
  const perm = await prisma.userPermission.findUnique({
    where: { userId_module_action: { userId, module, action } },
  });
  if (perm) return perm.allowed;
  return getDefaultPermission(user.role, module, action);
}

export async function getUserPermissions(
  userId: string
): Promise<Record<string, Record<string, boolean>>> {
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { role: true },
  });
  if (!user) return {};
  const explicit = await prisma.userPermission.findMany({ where: { userId } });
  const explicitMap = new Map(explicit.map(p => [`${p.module}:${p.action}`, p.allowed]));

  const result: Record<string, Record<string, boolean>> = {};
  // Build permissions for all sub-items
  for (const mod of PERM_MODULES) {
    for (const col of mod.columns) {
      for (const item of col.items) {
        result[item.id] = {};
        for (const act of ACTIONS) {
          const key = `${item.id}:${act}`;
          result[item.id][act] = explicitMap.has(key)
            ? explicitMap.get(key)!
            : getDefaultPermission(user.role, item.id, act);
        }
      }
    }
    // Also module-level
    result[mod.id] = {};
    for (const act of ACTIONS) {
      const key = `${mod.id}:${act}`;
      result[mod.id][act] = explicitMap.has(key)
        ? explicitMap.get(key)!
        : getDefaultPermission(user.role, mod.id, act);
    }
  }
  return result;
}

export async function setUserPermissions(
  userId: string,
  permissions: Array<{ module: string; action: string; allowed: boolean }>
): Promise<void> {
  // Batch in chunks to avoid transaction timeouts
  const chunkSize = 20;
  for (let i = 0; i < permissions.length; i += chunkSize) {
    const chunk = permissions.slice(i, i + chunkSize);
    const ops = chunk.map(p =>
      prisma.userPermission.upsert({
        where: { userId_module_action: { userId, module: p.module, action: p.action } },
        create: { userId, module: p.module, action: p.action, allowed: p.allowed },
        update: { allowed: p.allowed },
      })
    );
    await prisma.$transaction(ops);
  }
}
