import {
  LayoutDashboard, TrendingDown, TrendingUp, PiggyBank, Wallet,
  CreditCard, LineChart, Bell, BarChart3, Building2, Bot,
  Settings, FileCheck, ArrowDownCircle, ArrowUpCircle, Activity, Tag,
  Users, AlertTriangle, DollarSign, FileSpreadsheet, Target, Plug, ShieldCheck,
  UserCheck, Truck, Receipt, Landmark, ArrowLeftRight, FileText, Banknote,
  Calculator, FolderOpen, ClipboardList, Layers, BellRing, Sparkles, Key,
  Link2, BookOpen, PieChart, TrendingUp as TrendUp,
  Package, ShoppingCart, Handshake, Headphones, Workflow,
  PackagePlus, PackageMinus, ArrowRightLeft, Search, Warehouse,
  Ruler, FileBarChart, ClipboardCheck, ShoppingBag, Percent,
  UserPlus, UsersRound, Award, TruckIcon, TableProperties,
  Megaphone, Trophy, Frown, Calendar, Filter,
  Globe, Mail, TicketCheck, Cog, Briefcase, GitBranch,
  Building, MailOpen, ListChecks, PlayCircle, CheckCircle, Clock,
  QrCode, Shield, Download, Scroll, Laptop, MessageCircle, Sun, Server, CheckSquare, Zap,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface MenuItem {
  href: string;
  label: string;
  icon: any;
  description?: string;
  adminOnly?: boolean;
  masterOnly?: boolean;
}

export interface MegaMenuColumn {
  title: string;        // e.g. "Dia a Dia", "Cadastros", "Relatórios", "Avançado"
  items: MenuItem[];
}

export interface ModuleTab {
  id: string;           // unique key
  label: string;        // display name in nav
  icon: any;            // icon component
  columns: MegaMenuColumn[];
  singleLink?: string;  // if module is a single link (no mega menu)
}

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

/* ------------------------------------------------------------------ */
/*  PF Modules (Pessoa Física)                                        */
/* ------------------------------------------------------------------ */
const PF_MODULES: ModuleTab[] = [
  {
    id: 'pf-dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    singleLink: '/dashboard',
    columns: [],
  },
  {
    id: 'pf-financeiro',
    label: 'Financeiro',
    icon: Wallet,
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { href: '/despesas', label: 'Despesas', icon: TrendingDown, description: 'Registrar e controlar gastos' },
          { href: '/receitas', label: 'Receitas', icon: TrendingUp, description: 'Gerenciar entradas' },
          { href: '/conciliacao', label: 'Conciliação', icon: FileCheck, description: 'Conferir extratos' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { href: '/bancos', label: 'Bancos', icon: Building2, description: 'Contas bancárias' },
          { href: '/cartoes', label: 'Cartões', icon: CreditCard, description: 'Cartões de crédito' },
        ],
      },
      {
        title: 'Relatórios',
        items: [
          { href: '/relatorios', label: 'Relatórios', icon: BarChart3, description: 'Análises e gráficos' },
        ],
      },
    ],
  },
  {
    id: 'pf-patrimonio',
    label: 'Patrimônio',
    icon: LineChart,
    columns: [
      {
        title: 'Investimentos',
        items: [
          { href: '/investimentos', label: 'Investimentos', icon: LineChart, description: 'Carteira de investimentos' },
          { href: '/caixinhas', label: 'Caixinhas', icon: PiggyBank, description: 'Reservas e metas' },
        ],
      },
    ],
  },
  {
    id: 'pf-impostos',
    label: 'Impostos',
    icon: Calculator,
    columns: [
      {
        title: 'IRPF',
        items: [
          { href: '/pf/impostos', label: 'Calculadora IRPF', icon: Calculator, description: 'Cálculo mensal e anual' },
          { href: '/pf/impostos?tab=carne', label: 'Carnê-Leão', icon: Receipt, description: 'Rendimentos de autônomos' },
          { href: '/pf/impostos?tab=anual', label: 'Declaração Anual', icon: FileText, description: 'Simulação da declaração' },
        ],
      },
    ],
  },
  {
    id: 'pf-alertas',
    label: 'Alertas',
    icon: Bell,
    singleLink: '/alertas',
    columns: [],
  },
  {
    id: 'pf-ia',
    label: 'IA',
    icon: Sparkles,
    singleLink: '/assistente',
    columns: [],
  },
  {
    id: 'pf-config',
    label: 'Configurações',
    icon: Settings,
    columns: [
      {
        title: 'Geral',
        items: [
          { href: '/configuracoes', label: 'Preferências', icon: Settings, description: 'Configurações gerais' },
          { href: '/configuracoes/chaves-api', label: 'Chaves de API', icon: Key, description: 'Provedores de IA', adminOnly: true },
          { href: '/configuracoes/integracoes', label: 'Integrações', icon: Link2, description: 'Serviços conectados', adminOnly: true },
          { href: '/configuracoes/sessoes', label: 'Sessões Ativas', icon: Laptop, description: 'Dispositivos conectados' },
        ],
      },
      {
        title: 'Automações & Canais',
        items: [
          { href: '/configuracoes/smtp', label: 'E-mail SMTP', icon: Mail, description: 'Configurar servidor de e-mail' },
          { href: '/configuracoes/whatsapp', label: 'WhatsApp', icon: MessageCircle, description: 'Configurar WhatsApp Business' },
          { href: '/configuracoes/whatsapp-financeiro', label: 'WhatsApp Financeiro', icon: MessageCircle, description: 'Enviar NFS-e, boletos e PIX' },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  PJ Modules (Pessoa Jurídica)                                      */
/* ------------------------------------------------------------------ */
const PJ_MODULES: ModuleTab[] = [
  {
    id: 'pj-sophi',
    label: 'Sophi IA',
    icon: Sparkles,
    singleLink: '/pj/sophi',
    columns: [],
  },
  {
    id: 'pj-hoje',
    label: 'Hoje',
    icon: Sun,
    singleLink: '/hoje',
    columns: [],
  },
  {
    id: 'pj-dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    columns: [
      {
        title: 'Visão Geral',
        items: [
          { href: '/pj/dashboard', label: 'Dashboard PJ', icon: LayoutDashboard, description: 'Visão geral da empresa' },
          { href: '/pj/dashboard-executivo', label: 'Dashboard Executivo', icon: BarChart3, description: 'KPIs consolidados com comparativo mensal' },
        ],
      },
    ],
  },
  {
    id: 'pj-financeiro',
    label: 'Financeiro',
    icon: Wallet,
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { href: '/pj/contas-pagar', label: 'Contas a Pagar', icon: ArrowDownCircle, description: 'Gerenciar pagamentos' },
          { href: '/pj/contas-receber', label: 'Contas a Receber', icon: ArrowUpCircle, description: 'Gerenciar cobranças' },
          { href: '/pj/faturamento', label: 'Faturamento', icon: DollarSign, description: 'Notas e faturamento' },
          { href: '/pj/inadimplencia', label: 'Inadimplência', icon: AlertTriangle, description: 'Cobranças em atraso' },
          { href: '/pj/movimentacoes', label: 'Movimentação', icon: ArrowLeftRight, description: 'Entradas e saídas unificadas' },
          { href: '/pj/aprovacao-financeira', label: 'Aprovação Financeira', icon: CheckSquare, description: 'Aprovar despesas e receitas' },
          { href: '/pj/extrato', label: 'Extrato Bancário', icon: Scroll, description: 'Extrato por conta e período' },
          { href: '/pj/calendario', label: 'Calendário Financeiro', icon: Calendar, description: 'Vencimentos em visão de calendário' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { href: '/pj/plano-contas', label: 'Plano de Contas', icon: FolderOpen, description: 'Hierarquia de categorias gerenciais' },
          { href: '/pj/bancos', label: 'Bancos', icon: Building2, description: 'Contas bancárias' },
          { href: '/pj/cartoes', label: 'Cartões', icon: CreditCard, description: 'Cartões corporativos' },
          { href: '/pj/clientes', label: 'Clientes', icon: UserCheck, description: 'Base de clientes' },
          { href: '/pj/fornecedores', label: 'Fornecedores', icon: Truck, description: 'Cadastro de fornecedores' },
          { href: '/pj/funcionarios', label: 'Funcionários', icon: Users, description: 'Colaboradores da empresa' },
        ],
      },
      {
        title: 'NFS-e & Cobranças',
        items: [
          { href: '/pj/nfe', label: 'NFS-e / NF-e', icon: FileText, description: 'Emitir Notas Fiscais' },
          { href: '/pj/nfce', label: 'NFC-e', icon: Receipt, description: 'Nota Fiscal do Consumidor — Série 65' },
          { href: '/pj/nfs-recebidas', label: 'NF-e Recebidas', icon: Download, description: 'Notas de fornecedores — SEFAZ' },
          { href: '/pj/cobrancas', label: 'Boletos & PIX', icon: QrCode, description: 'Gerar cobranças automaticamente' },
          { href: '/pj/regua-cobranca', label: 'Régua de Cobrança', icon: Bell, description: 'Automação de lembretes e cobranças' },
          { href: '/pj/remessa-bancaria', label: 'Remessa Bancária', icon: FileBarChart, description: 'CNAB 240 — remessa e retorno' },
          { href: '/pj/certificados', label: 'Certificado Digital', icon: ShieldCheck, description: 'Certificados A1/A3' },
        ],
      },
      {
        title: 'Impostos',
        items: [
          { href: '/pj/fiscal', label: 'DAS / Simples Nacional', icon: Calculator, description: 'Calcular e controlar DAS' },
          { href: '/pj/fiscal?type=ICMS', label: 'ICMS / ISS', icon: Receipt, description: 'Impostos estaduais e municipais' },
        ],
      },
      {
        title: 'Relatórios',
        items: [
          { href: '/pj/fluxo-caixa', label: 'Fluxo de Caixa', icon: Activity, description: 'Entradas e saídas' },
          { href: '/pj/dre', label: 'DRE', icon: FileSpreadsheet, description: 'Demonstrativo de resultados' },
          { href: '/pj/conciliacao', label: 'Conciliação', icon: FileCheck, description: 'Conferir extratos' },
          { href: '/pj/orcamento', label: 'Previsão Orçamentária', icon: Target, description: 'Planejado vs. realizado por período' },
          { href: '/pj/relatorios/comparativo', label: 'Comparativo de Períodos', icon: BarChart3, description: 'Compare dois períodos lado a lado' },
          { href: '/pj/relatorios', label: 'Relatórios Financeiros', icon: PieChart, description: 'Análise consolidada do período' },
          { href: '/pj/metas', label: 'Metas & OKRs', icon: Trophy, description: 'Acompanhe as metas e objetivos da empresa' },
          { href: '/pj/relatorios/aging', label: 'Aging de Vencimentos', icon: AlertTriangle, description: 'Títulos em aberto por faixa de atraso' },
          { href: '/pj/exportacao', label: 'Exportação de Dados', icon: Download, description: 'Baixar relatórios em CSV' },
          { href: '/pj/relatorios/comissoes', label: 'Relatório de Comissões', icon: DollarSign, description: 'Comissões agrupadas por vendedor' },
        ],
      },
      {
        title: 'Avançado',
        items: [
          { href: '/pj/investimentos', label: 'Investimentos', icon: LineChart, description: 'Aplicações da empresa' },
          { href: '/pj/centros-custo', label: 'Centros de Custo', icon: Target, description: 'Gestão por centro' },
          { href: '/pj/categorias', label: 'Categorias', icon: Tag, description: 'Organizar transações' },
          { href: '/pj/compras', label: 'Pedidos de Compra', icon: ShoppingCart, description: 'Ordens de compra para fornecedores' },
          { href: '/pj/contratos', label: 'Contratos Recorrentes', icon: Scroll, description: 'Contratos de serviço e fornecimento' },
        ],
      },
    ],
  },
  {
    id: 'pj-estoque',
    label: 'Estoque',
    icon: Package,
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { href: '/pj/estoque', label: 'Dashboard', icon: LayoutDashboard, description: 'Visão geral do estoque' },
          { href: '/pj/estoque/entrada', label: 'Entrada', icon: PackagePlus, description: 'Registrar entradas' },
          { href: '/pj/estoque/saida', label: 'Saída', icon: PackageMinus, description: 'Registrar saídas' },
          { href: '/pj/estoque/transferencia', label: 'Transferência', icon: ArrowRightLeft, description: 'Transferir entre depósitos' },
          { href: '/pj/estoque/consulta', label: 'Consulta', icon: Search, description: 'Consultar movimentações' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { href: '/pj/estoque/produtos', label: 'Produtos', icon: Package, description: 'Catálogo de produtos' },
          { href: '/pj/estoque/categorias', label: 'Categorias', icon: Tag, description: 'Categorias de produtos' },
          { href: '/pj/estoque/depositos', label: 'Depósitos', icon: Warehouse, description: 'Locais de armazenagem' },
          { href: '/pj/estoque/fornecedores', label: 'Fornecedores', icon: Truck, description: 'Fornecedores de produtos' },
        ],
      },
      {
        title: 'Relatórios',
        items: [
          { href: '/pj/estoque/relatorios', label: 'Relatórios', icon: FileBarChart, description: 'Análises de estoque' },
          { href: '/pj/estoque/inventario', label: 'Inventário', icon: ClipboardCheck, description: 'Contagem de estoque' },
        ],
      },
    ],
  },
  {
    id: 'pj-vendas',
    label: 'Vendas',
    icon: ShoppingCart,
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { href: '/pj/vendas', label: 'Dashboard', icon: LayoutDashboard, description: 'Visão geral de vendas' },
          { href: '/pj/vendas/orcamentos', label: 'Orçamentos', icon: FileText, description: 'Propostas e orçamentos' },
          { href: '/pj/vendas/ordens-servico', label: 'Ordens de Serviço', icon: ClipboardList, description: 'Gerenciar OS' },
          { href: '/pj/comissoes', label: 'Comissões', icon: Percent, description: 'Controle de comissões de vendedores' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { href: '/pj/vendas/produtos', label: 'Produtos', icon: ShoppingBag, description: 'Produtos para venda' },
          { href: '/pj/vendas/tabela-precos', label: 'Tabela de Preços', icon: TableProperties, description: 'Preços e descontos' },
          { href: '/pj/vendas/vendedores', label: 'Vendedores', icon: UserPlus, description: 'Equipe comercial' },
          { href: '/pj/vendas/transportadoras', label: 'Transportadoras', icon: TruckIcon, description: 'Logística de entrega' },
        ],
      },
      {
        title: 'Relatórios',
        items: [
          { href: '/pj/vendas/relatorios', label: 'Relatórios', icon: FileBarChart, description: 'Análises de vendas' },
          { href: '/pj/vendas/metas', label: 'Metas', icon: Target, description: 'Acompanhar metas' },
        ],
      },
    ],
  },
  {
    id: 'pj-crm',
    label: 'CRM',
    icon: Handshake,
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { href: '/pj/crm', label: 'Dashboard', icon: LayoutDashboard, description: 'Visão geral CRM' },
          { href: '/pj/crm/oportunidades', label: 'Oportunidades', icon: Target, description: 'Pipeline de vendas' },
          { href: '/pj/crm/agenda', label: 'Agenda', icon: Calendar, description: 'Agenda comercial' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { href: '/pj/crm/leads', label: 'Leads', icon: UserPlus, description: 'Prospecção de clientes' },
          { href: '/pj/crm/funil', label: 'Funil de Vendas', icon: Filter, description: 'Etapas do funil' },
          { href: '/pj/crm/vendedores', label: 'Vendedores', icon: UsersRound, description: 'Equipe CRM' },
        ],
      },
      {
        title: 'Relatórios',
        items: [
          { href: '/pj/crm/relatorios', label: 'Relatórios', icon: FileBarChart, description: 'Análises de CRM' },
          { href: '/pj/crm/metas', label: 'Metas', icon: Award, description: 'Metas comerciais' },
          { href: '/pj/crm-automacoes', label: 'Automações CRM', icon: Zap, description: 'Regras automáticas por gatilho' },
        ],
      },
    ],
  },
  {
    id: 'pj-servicedesk',
    label: 'ServiceDesk',
    icon: Headphones,
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { href: '/pj/servicedesk', label: 'Dashboard', icon: LayoutDashboard, description: 'Visão geral suporte' },
          { href: '/pj/servicedesk/tickets', label: 'Tickets', icon: TicketCheck, description: 'Gerenciar chamados' },
          { href: '/pj/servicedesk/agenda', label: 'Agenda', icon: Calendar, description: 'Agenda de atendimento' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { href: '/pj/servicedesk/agentes', label: 'Agentes', icon: Headphones, description: 'Equipe de suporte' },
          { href: '/pj/servicedesk/grupos', label: 'Grupos', icon: UsersRound, description: 'Grupos de suporte' },
          { href: '/pj/servicedesk/tipos', label: 'Tipos', icon: Layers, description: 'Tipos de ocorrência' },
          { href: '/pj/servicedesk/fluxos', label: 'Fluxos', icon: GitBranch, description: 'Fluxos de trabalho' },
        ],
      },
      {
        title: 'Relatórios',
        items: [
          { href: '/pj/servicedesk/relatorios', label: 'Relatórios', icon: FileBarChart, description: 'Análises de suporte' },
          { href: '/pj/servicedesk/portal', label: 'Portal Cliente', icon: Globe, description: 'Portal do cliente' },
        ],
      },
    ],
  },
  {
    id: 'pj-bpm',
    label: 'BPM',
    icon: Workflow,
    columns: [
      {
        title: 'Dia a Dia',
        items: [
          { href: '/pj/bpm', label: 'Dashboard', icon: LayoutDashboard, description: 'Visão geral processos' },
          { href: '/pj/bpm/solicitacoes', label: 'Solicitações', icon: PlayCircle, description: 'Novas solicitações' },
          { href: '/pj/bpm/em-andamento', label: 'Em Andamento', icon: Clock, description: 'Processos ativos' },
          { href: '/pj/bpm/finalizados', label: 'Finalizados', icon: CheckCircle, description: 'Processos concluídos' },
        ],
      },
      {
        title: 'Cadastros',
        items: [
          { href: '/pj/bpm/processos', label: 'Processos', icon: Workflow, description: 'Modelos de processos' },
          { href: '/pj/bpm/departamentos', label: 'Departamentos', icon: Building, description: 'Departamentos' },
          { href: '/pj/bpm/papeis', label: 'Papéis', icon: Briefcase, description: 'Papéis organizacionais' },
        ],
      },
      {
        title: 'Relatórios',
        items: [
          { href: '/pj/bpm/relatorios', label: 'Relatórios', icon: FileBarChart, description: 'Análises de processos' },
        ],
      },
    ],
  },
  {
    id: 'pj-empresa',
    label: 'Empresa',
    icon: Building2,
    columns: [
      {
        title: 'Gestão',
        items: [
          { href: '/pj/empresa', label: 'Dados da Empresa', icon: Building2, description: 'Informações cadastrais' },
          { href: '/pj/usuarios', label: 'Usuários', icon: Users, description: 'Equipe e permissões' },
          { href: '/pj/conexoes', label: 'Conexões', icon: Plug, description: 'APIs e integrações' },
        ],
      },
    ],
    // adminOnly: true — filtered at render time
  },
  {
    id: 'pj-alertas',
    label: 'Alertas',
    icon: Bell,
    singleLink: '/alertas',
    columns: [],
  },
  {
    id: 'pj-ia',
    label: 'IA',
    icon: Sparkles,
    singleLink: '/assistente',
    columns: [],
  },
  {
    id: 'pj-config',
    label: 'Configurações',
    icon: Settings,
    columns: [
      {
        title: 'Geral',
        items: [
          { href: '/configuracoes', label: 'Preferências', icon: Settings, description: 'Configurações gerais' },
          { href: '/configuracoes/chaves-api', label: 'Chaves de API', icon: Key, description: 'Provedores de IA', adminOnly: true },
          { href: '/configuracoes/integracoes', label: 'Integrações', icon: Link2, description: 'Serviços conectados', adminOnly: true },
          { href: '/configuracoes/sessoes', label: 'Sessões Ativas', icon: Laptop, description: 'Dispositivos conectados' },
        ],
      },
      {
        title: 'Automações & Canais',
        items: [
          { href: '/configuracoes/smtp', label: 'E-mail SMTP', icon: Mail, description: 'Configurar servidor de e-mail' },
          { href: '/configuracoes/whatsapp', label: 'WhatsApp', icon: MessageCircle, description: 'Configurar WhatsApp Business' },
          { href: '/configuracoes/whatsapp-financeiro', label: 'WhatsApp Financeiro', icon: MessageCircle, description: 'Enviar NFS-e, boletos e PIX' },
        ],
      },
      {
        title: 'Personalização',
        items: [
          { href: '/pj/campos-customizados', label: 'Campos Customizados', icon: Layers, description: 'Campos extras para clientes, contas e produtos' },
        ],
      },
      {
        title: 'Segurança',
        items: [
          { href: '/pj/audit-log', label: 'Log de Auditoria', icon: Shield, description: 'Histórico de ações e alterações', adminOnly: true },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Admin Module (shared)                                              */
/* ------------------------------------------------------------------ */
const ADMIN_MODULE: ModuleTab = {
  id: 'admin',
  label: 'Admin',
  icon: ShieldCheck,
  columns: [
    {
      title: 'Administração',
      items: [
        { href: '/admin', label: 'Painel Admin', icon: ShieldCheck, description: 'Métricas e visão geral' },
        { href: '/admin/usuarios', label: 'Usuários', icon: Users, description: 'Gerenciar usuários e planos' },
        { href: '/admin/permissoes', label: 'Permissões', icon: Shield, description: 'Permissões granulares por módulo' },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  Getters                                                            */
/* ------------------------------------------------------------------ */
export function getModulesForContext(context: 'pf' | 'pj'): ModuleTab[] {
  return context === 'pj' ? PJ_MODULES : PF_MODULES;
}

export function getAdminModule(): ModuleTab {
  return ADMIN_MODULE;
}

/** Backward-compat: flat MenuGroup[] for mobile drawer / legacy usage */
export function getMenuForContext(context: 'pf' | 'pj'): MenuGroup[] {
  const modules = getModulesForContext(context);
  return modules
    .filter(m => !m.singleLink || m.columns.length > 0)
    .map(m => ({
      label: m.label,
      items: m.columns.flatMap(c => c.items),
    }))
    .concat(
      modules
        .filter(m => m.singleLink && m.columns.length === 0)
        .map(m => ({
          label: m.label,
          items: [{ href: m.singleLink!, label: m.label, icon: m.icon }],
        }))
    );
}

export function getAllMenuItems(context: 'pf' | 'pj'): MenuItem[] {
  const modules = getModulesForContext(context);
  const items: MenuItem[] = [];
  for (const m of modules) {
    if (m.singleLink && m.columns.length === 0) {
      items.push({ href: m.singleLink, label: m.label, icon: m.icon });
    }
    for (const col of m.columns) {
      items.push(...col.items);
    }
  }
  return items;
}
