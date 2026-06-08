'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Produtos para Venda"
      subtitle="Catálogo de produtos e serviços comercializados"
      apiUrl="/api/pj/estoque/products"
      entityName="produto"
      newLabel="Novo Produto"
      columns={[
        { key: 'sku', label: 'SKU', render: (v: any) => v || '—' },
        { key: 'name', label: 'Nome' },
        { key: 'salePrice', label: 'Preço Venda', render: (v: any) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—' },
        { key: 'currentStock', label: 'Estoque', render: (v: any) => v ?? 0 },
        { key: 'status', label: 'Status', render: (v: any) => v === 'active' ? '🟢 Ativo' : '🔴 Inativo' },
      ]}
      fields={[
        { key: 'name', label: 'Nome do Produto', required: true },
        { key: 'sku', label: 'SKU' },
        { key: 'description', label: 'Descrição', type: 'textarea' },
        { key: 'costPrice', label: 'Preço de Custo', type: 'number' },
        { key: 'salePrice', label: 'Preço de Venda', type: 'number', required: true },
        { key: 'currentStock', label: 'Estoque Atual', type: 'number' },
        { key: 'unit', label: 'Unidade', defaultValue: 'un' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] },
      ]}
    />
  );
}
