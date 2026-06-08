'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Consulta de Estoque"
      subtitle="Consultar todas as movimentações e saldos"
      apiUrl="/api/pj/estoque/movements"
      entityName="movimentação"
      newLabel="Nova Movimentação"
      columns={[
        { key: 'type', label: 'Tipo', render: (v: any) => { const m: Record<string,string> = { 'entrada': '📥 Entrada', 'saida': '📤 Saída', 'transferencia': '🔄 Transferência', 'ajuste': '⚙️ Ajuste' }; return m[v] || v || '—'; } },
        { key: 'productName', label: 'Produto', render: (v: any, row: any) => row.product?.name || v || '—' },
        { key: 'warehouseName', label: 'Depósito', render: (v: any, row: any) => row.warehouse?.name || v || '—' },
        { key: 'quantity', label: 'Qtd' },
        { key: 'unitCost', label: 'Custo Unit.', render: (v: any) => v ? `R$ ${Number(v).toFixed(2)}` : '—' },
        { key: 'createdAt', label: 'Data', render: (v: any) => v ? new Date(v).toLocaleDateString('pt-BR') : '—' },
      ]}
      fields={[
        { key: 'productId', label: 'ID do Produto', required: true },
        { key: 'warehouseId', label: 'ID do Depósito' },
        { key: 'type', label: 'Tipo', type: 'select', required: true, defaultValue: 'entrada', options: [{ value: 'entrada', label: 'Entrada' }, { value: 'saida', label: 'Saída' }, { value: 'transferencia', label: 'Transferência' }, { value: 'ajuste', label: 'Ajuste' }] },
        { key: 'quantity', label: 'Quantidade', type: 'number', required: true },
        { key: 'unitCost', label: 'Custo Unitário', type: 'number' },
        { key: 'notes', label: 'Observações', type: 'textarea' },
      ]}
    />
  );
}
