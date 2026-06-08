'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Transportadoras"
      subtitle="Cadastro de transportadoras e logística"
      apiUrl="/api/pj/vendas/carriers"
      entityName="transportadora"
      newLabel="Nova Transportadora"
      columns={[
        { key: 'name', label: 'Nome' },
        { key: 'cnpj', label: 'CNPJ', render: (v: any) => v || '—' },
        { key: 'phone', label: 'Telefone', render: (v: any) => v || '—' },
        { key: 'email', label: 'E-mail', render: (v: any) => v || '—' },
        { key: 'status', label: 'Status', render: (v: any) => v === 'active' ? '🟢 Ativa' : '🔴 Inativa' },
      ]}
      fields={[
        { key: 'name', label: 'Nome da Transportadora', required: true },
        { key: 'cnpj', label: 'CNPJ' },
        { key: 'phone', label: 'Telefone' },
        { key: 'email', label: 'E-mail', type: 'email' },
        { key: 'address', label: 'Endereço' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativa' }, { value: 'inactive', label: 'Inativa' }] },
      ]}
    />
  );
}
