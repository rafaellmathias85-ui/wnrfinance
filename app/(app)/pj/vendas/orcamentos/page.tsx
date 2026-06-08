'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Orçamentos e Vendas"
      subtitle="Propostas, orçamentos e vendas"
      apiUrl="/api/pj/vendas/orders"
      entityName="orçamento"
      newLabel="Novo Orçamento"
      columns={[
    { key: 'number', label: 'Nº' },
    { key: 'customerName', label: 'Cliente' },
    { key: 'type', label: 'Tipo', render: (v: any) => { const m: Record<string,string> = { 'orcamento': 'Orçamento', 'ordem_servico': 'Ordem de Serviço', 'venda': 'Venda' }; return m[v] || v || '—'; } },
    { key: 'total', label: 'Valor', render: (v: any) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—' },
    { key: 'status', label: 'Status', render: (v: any) => { const m: Record<string,string> = { 'rascunho': 'Rascunho', 'enviado': 'Enviado', 'aprovado': 'Aprovado', 'rejeitado': 'Rejeitado', 'concluido': 'Concluído', 'cancelado': 'Cancelado' }; return m[v] || v || '—'; } }
  ]}
      fields={[
    { key: 'type', label: 'Tipo', type: 'select', required: true, defaultValue: 'orcamento', options: [{ value: 'orcamento', label: 'Orçamento' }, { value: 'ordem_servico', label: 'Ordem de Serviço' }, { value: 'venda', label: 'Venda' }] },
    { key: 'number', label: 'Número' },
    { key: 'customerName', label: 'Nome do Cliente', required: true },
    { key: 'sellerName', label: 'Vendedor' },
    { key: 'subtotal', label: 'Subtotal', type: 'number' },
    { key: 'discount', label: 'Desconto', type: 'number' },
    { key: 'total', label: 'Total', type: 'number', required: true },
    { key: 'validUntil', label: 'Válido até', type: 'date' },
    { key: 'notes', label: 'Observações', type: 'textarea' },
    { key: 'status', label: 'Status', type: 'select', defaultValue: 'rascunho', options: [{ value: 'rascunho', label: 'Rascunho' }, { value: 'enviado', label: 'Enviado' }, { value: 'aprovado', label: 'Aprovado' }, { value: 'rejeitado', label: 'Rejeitado' }, { value: 'concluido', label: 'Concluído' }, { value: 'cancelado', label: 'Cancelado' }] }
  ]}
    />
  );
}
