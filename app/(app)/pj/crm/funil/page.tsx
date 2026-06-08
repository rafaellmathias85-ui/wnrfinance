'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Funil de Vendas"
      subtitle="Etapas do funil de vendas"
      apiUrl="/api/pj/crm/funnels"
      entityName="etapa"
      newLabel="Nova Etapa"
      columns={[
    { key: 'name', label: 'Nome' },
    { key: 'position', label: 'Posição' },
    { key: 'color', label: 'Cor' }
  ]}
      fields={[
    { key: 'name', label: 'Nome', required: true },
    { key: 'position', label: 'Posição', type: 'number' },
    { key: 'color', label: 'Cor (hex)' }
  ]}
    />
  );
}
