'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Equipe CRM"
      subtitle="Vendedores e consultores comerciais"
      apiUrl="/api/pj/vendas/sellers"
      entityName="vendedor"
      newLabel="Novo Vendedor"
      columns={[
        { key: 'name', label: 'Nome' },
        { key: 'email', label: 'E-mail', render: (v: any) => v || '—' },
        { key: 'phone', label: 'Telefone', render: (v: any) => v || '—' },
        { key: 'commission', label: 'Comissão %', render: (v: any) => v ? `${v}%` : '—' },
        { key: 'status', label: 'Status', render: (v: any) => v === 'active' ? '🟢 Ativo' : '🔴 Inativo' },
      ]}
      fields={[
        { key: 'name', label: 'Nome', required: true },
        { key: 'email', label: 'E-mail', type: 'email' },
        { key: 'phone', label: 'Telefone' },
        { key: 'commission', label: 'Comissão (%)', type: 'number' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] },
      ]}
    />
  );
}
