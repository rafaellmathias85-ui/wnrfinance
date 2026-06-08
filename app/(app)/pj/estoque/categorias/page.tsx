'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Categorias de Produtos"
      subtitle="Classificação e organização de produtos"
      apiUrl="/api/pj/estoque/categories"
      entityName="categoria"
      newLabel="Nova Categoria"
      columns={[
        { key: 'name', label: 'Nome' },
        { key: 'description', label: 'Descrição', render: (v: any) => v || '—' },
        { key: 'status', label: 'Status', render: (v: any) => v === 'active' ? '🟢 Ativo' : '🔴 Inativo' },
        { key: 'createdAt', label: 'Criado em', render: (v: any) => v ? new Date(v).toLocaleDateString('pt-BR') : '—' },
      ]}
      fields={[
        { key: 'name', label: 'Nome da Categoria', required: true },
        { key: 'description', label: 'Descrição', type: 'textarea' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] },
      ]}
    />
  );
}
