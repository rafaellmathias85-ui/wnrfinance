'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Fluxos de Trabalho"
      subtitle="Automações e fluxos de atendimento"
      apiUrl="/api/pj/servicedesk/workflows"
      entityName="fluxo"
      newLabel="Novo Fluxo"
      columns={[
        { key: 'name', label: 'Nome' },
        { key: 'description', label: 'Descrição', render: (v: any) => v || '—' },
        { key: 'trigger', label: 'Gatilho', render: (v: any) => v || '—' },
        { key: 'status', label: 'Status', render: (v: any) => v === 'active' ? '🟢 Ativo' : '🔴 Inativo' },
      ]}
      fields={[
        { key: 'name', label: 'Nome do Fluxo', required: true },
        { key: 'description', label: 'Descrição', type: 'textarea' },
        { key: 'trigger', label: 'Gatilho', placeholder: 'Ex: Novo ticket, Mudança de status' },
        { key: 'steps', label: 'Etapas (descreva as etapas)', type: 'textarea' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] },
      ]}
    />
  );
}
