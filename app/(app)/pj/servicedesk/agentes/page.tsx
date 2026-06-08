'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Agentes"
      subtitle="Equipe de suporte"
      apiUrl="/api/pj/servicedesk/agents"
      entityName="agente"
      newLabel="Novo Agente"
      columns={[
    { key: 'name', label: 'Nome' },
    { key: 'email', label: 'E-mail' },
    { key: 'status', label: 'Status', render: (v: any) => { const m: Record<string,string> = { 'active': 'Ativo', 'inactive': 'Inativo' }; return m[v] || v || '\u2014'; } }
  ]}
      fields={[
    { key: 'name', label: 'Nome', required: true },
    { key: 'email', label: 'E-mail', type: 'email' },
    { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] }
  ]}
    />
  );
}
