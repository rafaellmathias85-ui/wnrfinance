'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Ordens de Serviço"
      subtitle="Gerenciar ordens de serviço"
      apiUrl="/api/pj/vendas/orders"
      entityName="ordem de serviço"
      newLabel="Nova OS"
      columns={[
        { key: 'number', label: 'Nº' },
        { key: 'customerName', label: 'Cliente' },
        { key: 'total', label: 'Valor', render: (v: any) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—' },
        { key: 'status', label: 'Status', render: (v: any) => { const m: Record<string,string> = { 'rascunho': 'Rascunho', 'enviado': 'Enviado', 'aprovado': 'Aprovado', 'rejeitado': 'Rejeitado', 'concluido': 'Concluído', 'cancelado': 'Cancelado' }; return m[v] || v || '—'; } },
        { key: 'createdAt', label: 'Data', render: (v: any) => v ? new Date(v).toLocaleDateString('pt-BR') : '—' },
      ]}
      fields={[
        { key: 'type', label: 'Tipo', type: 'select', required: true, defaultValue: 'ordem_servico', options: [{ value: 'ordem_servico', label: 'Ordem de Serviço' }] },
        { key: 'number', label: 'Número' },
        { key: 'customerName', label: 'Cliente', required: true },
        { key: 'sellerName', label: 'Responsável' },
        { key: 'subtotal', label: 'Subtotal', type: 'number' },
        { key: 'discount', label: 'Desconto', type: 'number' },
        { key: 'total', label: 'Total', type: 'number', required: true },
        { key: 'notes', label: 'Descrição do Serviço', type: 'textarea' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'rascunho', options: [{ value: 'rascunho', label: 'Rascunho' }, { value: 'enviado', label: 'Enviado' }, { value: 'aprovado', label: 'Aprovado' }, { value: 'concluido', label: 'Concluído' }, { value: 'cancelado', label: 'Cancelado' }] },
      ]}
    />
  );
}
