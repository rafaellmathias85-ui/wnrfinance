'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Tabelas de Preços"
      subtitle="Tabelas de preço e condições comerciais"
      apiUrl="/api/pj/vendas/price-tables"
      entityName="tabela"
      newLabel="Nova Tabela"
      columns={[
        { key: 'name', label: 'Nome' },
        { key: 'description', label: 'Descrição', render: (v: any) => v || '—' },
        { key: 'discount', label: 'Desconto %', render: (v: any) => v ? `${v}%` : '—' },
        { key: 'markup', label: 'Markup %', render: (v: any) => v ? `${v}%` : '—' },
        { key: 'status', label: 'Status', render: (v: any) => v === 'active' ? '🟢 Ativa' : '🔴 Inativa' },
      ]}
      fields={[
        { key: 'name', label: 'Nome da Tabela', required: true },
        { key: 'description', label: 'Descrição', type: 'textarea' },
        { key: 'discount', label: 'Desconto Padrão (%)', type: 'number' },
        { key: 'markup', label: 'Markup (%)', type: 'number' },
        { key: 'validFrom', label: 'Válido de', type: 'date' },
        { key: 'validUntil', label: 'Válido até', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativa' }, { value: 'inactive', label: 'Inativa' }] },
      ]}
    />
  );
}
