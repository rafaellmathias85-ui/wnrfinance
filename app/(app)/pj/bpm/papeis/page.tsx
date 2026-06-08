'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Papéis Organizacionais"
      subtitle="Definição de papéis e responsabilidades"
      apiUrl="/api/pj/bpm/departments"
      entityName="papel"
      newLabel="Novo Papel"
      columns={[
        { key: 'name', label: 'Nome' },
        { key: 'description', label: 'Descrição', render: (v: any) => v || '—' },
        { key: 'responsible', label: 'Responsável', render: (v: any) => v || '—' },
        { key: 'status', label: 'Status', render: (v: any) => v === 'active' ? '🟢 Ativo' : '🔴 Inativo' },
      ]}
      fields={[
        { key: 'name', label: 'Nome do Papel', required: true },
        { key: 'description', label: 'Descrição', type: 'textarea' },
        { key: 'responsible', label: 'Responsável' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] },
      ]}
    />
  );
}
