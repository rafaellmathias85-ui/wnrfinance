'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Departamentos"
      subtitle="Departamentos da organização"
      apiUrl="/api/pj/bpm/departments"
      entityName="departamento"
      newLabel="Novo Departamento"
      columns={[
    { key: 'name', label: 'Nome' },
    { key: 'responsible', label: 'Responsável' },
    { key: 'status', label: 'Status', render: (v: any) => { const m: Record<string,string> = { 'active': 'Ativo', 'inactive': 'Inativo' }; return m[v] || v || '—'; } }
  ]}
      fields={[
    { key: 'name', label: 'Nome', required: true },
    { key: 'responsible', label: 'Responsável' },
    { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] }
  ]}
    />
  );
}
