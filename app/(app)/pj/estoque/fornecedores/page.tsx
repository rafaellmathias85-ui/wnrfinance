'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Fornecedores"
      subtitle="Cadastro de fornecedores de produtos"
      apiUrl="/api/pj/suppliers"
      entityName="fornecedor"
      newLabel="Novo Fornecedor"
      columns={[
        { key: 'name', label: 'Nome' },
        { key: 'cnpj', label: 'CNPJ', render: (v: any) => v || '—' },
        { key: 'email', label: 'E-mail', render: (v: any) => v || '—' },
        { key: 'phone', label: 'Telefone', render: (v: any) => v || '—' },
        { key: 'status', label: 'Status', render: (v: any) => v === 'active' ? '🟢 Ativo' : '🔴 Inativo' },
      ]}
      fields={[
        { key: 'name', label: 'Razão Social', required: true },
        { key: 'cnpj', label: 'CNPJ' },
        { key: 'email', label: 'E-mail', type: 'email' },
        { key: 'phone', label: 'Telefone' },
        { key: 'contactName', label: 'Contato' },
        { key: 'address', label: 'Endereço' },
        { key: 'notes', label: 'Observações', type: 'textarea' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] },
      ]}
    />
  );
}
