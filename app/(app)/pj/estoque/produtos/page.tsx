'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Produtos"
      subtitle="Catálogo de produtos da empresa"
      apiUrl="/api/pj/estoque/products"
      entityName="produto"
      newLabel="Novo Produto"
      columns={[
    { key: 'code', label: 'Código' },
    { key: 'name', label: 'Nome' },
    { key: 'category', label: 'Categoria' },
    { key: 'unit', label: 'Unidade' },
    { key: 'currentStock', label: 'Estoque', render: (v: any) => v?.toFixed(0) ?? '0' },
    { key: 'costPrice', label: 'Custo', render: (v: any) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—' },
    { key: 'salePrice', label: 'Venda', render: (v: any) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—' },
    { key: 'status', label: 'Status', render: (v: any) => { const m: Record<string,string> = { 'active': 'Ativo', 'inactive': 'Inativo' }; return m[v] || v || '—'; } }
  ]}
      fields={[
    { key: 'name', label: 'Nome', required: true },
    { key: 'code', label: 'Código' },
    { key: 'category', label: 'Categoria' },
    { key: 'description', label: 'Descrição', type: 'textarea' },
    { key: 'unit', label: 'Unidade', type: 'select', defaultValue: 'UN', options: [{ value: 'UN', label: 'Unidade' }, { value: 'KG', label: 'Kg' }, { value: 'LT', label: 'Litro' }, { value: 'MT', label: 'Metro' }, { value: 'CX', label: 'Caixa' }, { value: 'PC', label: 'Peça' }] },
    { key: 'costPrice', label: 'Preço de Custo', type: 'number' },
    { key: 'salePrice', label: 'Preço de Venda', type: 'number' },
    { key: 'minStock', label: 'Estoque Mínimo', type: 'number' },
    { key: 'currentStock', label: 'Estoque Inicial', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] }
  ]}
    />
  );
}
