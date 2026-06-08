'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Depósitos"
      subtitle="Locais de armazenamento"
      apiUrl="/api/pj/estoque/warehouses"
      entityName="depósito"
      newLabel="Novo Depósito"
      columns={[
    { key: 'name', label: 'Nome' },
    { key: 'address', label: 'Endereço' },
    { key: 'responsible', label: 'Responsável' },
    { key: 'status', label: 'Status', render: (v: any) => { const m: Record<string,string> = { 'active': 'Ativo', 'inactive': 'Inativo' }; return m[v] || v || '—'; } }
  ]}
      fields={[
    { key: 'name', label: 'Nome', required: true },
    { key: 'address', label: 'Endereço' },
    { key: 'responsible', label: 'Responsável' },
    { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] }
  ]}
    />
  );
}
