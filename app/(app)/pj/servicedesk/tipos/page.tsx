'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Tipos de Ocorrência"
      subtitle="Categorias e tipos de chamados"
      apiUrl="/api/pj/servicedesk/ticket-types"
      entityName="tipo"
      newLabel="Novo Tipo"
      columns={[
        { key: 'name', label: 'Nome' },
        { key: 'description', label: 'Descrição', render: (v: any) => v || '—' },
        { key: 'priority', label: 'Prioridade', render: (v: any) => { const m: Record<string,string> = { 'low': '🟢 Baixa', 'medium': '🟡 Média', 'high': '🟠 Alta', 'critical': '🔴 Crítica' }; return m[v] || v || '—'; } },
        { key: 'sla', label: 'SLA (horas)', render: (v: any) => v ? `${v}h` : '—' },
        { key: 'status', label: 'Status', render: (v: any) => v === 'active' ? '🟢 Ativo' : '🔴 Inativo' },
      ]}
      fields={[
        { key: 'name', label: 'Nome do Tipo', required: true },
        { key: 'description', label: 'Descrição', type: 'textarea' },
        { key: 'priority', label: 'Prioridade Padrão', type: 'select', defaultValue: 'medium', options: [{ value: 'low', label: 'Baixa' }, { value: 'medium', label: 'Média' }, { value: 'high', label: 'Alta' }, { value: 'critical', label: 'Crítica' }] },
        { key: 'sla', label: 'SLA (horas)', type: 'number' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] },
      ]}
    />
  );
}
