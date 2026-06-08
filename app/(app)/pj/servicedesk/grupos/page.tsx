'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Grupos de Suporte"
      subtitle="Grupos de atendimento"
      apiUrl="/api/pj/servicedesk/groups"
      entityName="grupo"
      newLabel="Novo Grupo"
      columns={[
    { key: 'name', label: 'Nome' },
    { key: 'description', label: 'Descrição' }
  ]}
      fields={[
    { key: 'name', label: 'Nome', required: true },
    { key: 'description', label: 'Descrição', type: 'textarea' }
  ]}
    />
  );
}
