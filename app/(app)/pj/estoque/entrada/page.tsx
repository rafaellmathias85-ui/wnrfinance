'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Entrada de Estoque"
      subtitle="Registrar entradas de produtos no estoque"
      apiUrl="/api/pj/estoque/movements"
      entityName="entrada"
      newLabel="Nova Entrada"
      columns={[
        { key: 'productName', label: 'Produto', render: (v: any, row: any) => row.product?.name || v || '—' },
        { key: 'warehouseName', label: 'Depósito', render: (v: any, row: any) => row.warehouse?.name || v || '—' },
        { key: 'quantity', label: 'Quantidade' },
        { key: 'notes', label: 'Observações', render: (v: any) => v || '—' },
        { key: 'createdAt', label: 'Data', render: (v: any) => v ? new Date(v).toLocaleDateString('pt-BR') : '—' },
      ]}
      fields={[
        { key: 'productId', label: 'ID do Produto', required: true, placeholder: 'ID do produto' },
        { key: 'warehouseId', label: 'ID do Depósito', placeholder: 'ID do depósito (opcional)' },
        { key: 'type', label: 'Tipo', type: 'select', required: true, defaultValue: 'entrada', options: [{ value: 'entrada', label: 'Entrada' }] },
        { key: 'quantity', label: 'Quantidade', type: 'number', required: true },
        { key: 'unitCost', label: 'Custo Unitário', type: 'number' },
        { key: 'notes', label: 'Observações', type: 'textarea' },
      ]}
    />
  );
}
