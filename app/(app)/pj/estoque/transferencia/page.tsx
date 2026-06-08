'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Transferência de Estoque"
      subtitle="Transferir produtos entre depósitos"
      apiUrl="/api/pj/estoque/movements"
      entityName="transferência"
      newLabel="Nova Transferência"
      columns={[
        { key: 'productName', label: 'Produto', render: (v: any, row: any) => row.product?.name || v || '—' },
        { key: 'warehouseName', label: 'Depósito', render: (v: any, row: any) => row.warehouse?.name || v || '—' },
        { key: 'quantity', label: 'Quantidade' },
        { key: 'notes', label: 'Observações', render: (v: any) => v || '—' },
        { key: 'createdAt', label: 'Data', render: (v: any) => v ? new Date(v).toLocaleDateString('pt-BR') : '—' },
      ]}
      fields={[
        { key: 'productId', label: 'ID do Produto', required: true },
        { key: 'warehouseId', label: 'Depósito Origem', placeholder: 'ID do depósito de origem' },
        { key: 'type', label: 'Tipo', type: 'select', required: true, defaultValue: 'transferencia', options: [{ value: 'transferencia', label: 'Transferência' }] },
        { key: 'quantity', label: 'Quantidade', type: 'number', required: true },
        { key: 'notes', label: 'Observações (destino, etc.)', type: 'textarea' },
      ]}
    />
  );
}
