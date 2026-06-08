'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Modelos de Processo"
      subtitle="Configurar fluxos de processos"
      apiUrl="/api/pj/bpm/processes"
      entityName="processo"
      newLabel="Novo Processo"
      columns={[
    { key: 'name', label: 'Nome' },
    { key: 'department', label: 'Departamento' },
    { key: 'description', label: 'Descrição' },
    { key: 'status', label: 'Status', render: (v: any) => { const m: Record<string,string> = { 'active': 'Ativo', 'inactive': 'Inativo' }; return m[v] || v || '—'; } }
  ]}
      fields={[
    { key: 'name', label: 'Nome', required: true },
    { key: 'department', label: 'Departamento' },
    { key: 'description', label: 'Descrição', type: 'textarea' },
    { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] }
  ]}
    />
  );
}
