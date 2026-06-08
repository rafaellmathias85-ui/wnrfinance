'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Oportunidades"
      subtitle="Pipeline de vendas e oportunidades"
      apiUrl="/api/pj/crm/opportunities"
      entityName="oportunidade"
      newLabel="Nova Oportunidade"
      columns={[
    { key: 'title', label: 'Título' },
    { key: 'company', label: 'Empresa' },
    { key: 'value', label: 'Valor', render: (v: any) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—' },
    { key: 'probability', label: 'Probabilidade', render: (v: any) => v ? `${v}%` : '—' },
    { key: 'status', label: 'Status', render: (v: any) => { const m: Record<string,string> = { 'aberta': 'Aberta', 'ganha': 'Ganha', 'perdida': 'Perdida' }; return m[v] || v || '—'; } },
    { key: 'contactName', label: 'Contato' }
  ]}
      fields={[
    { key: 'title', label: 'Título', required: true },
    { key: 'company', label: 'Empresa' },
    { key: 'value', label: 'Valor', type: 'number' },
    { key: 'probability', label: 'Probabilidade (%)', type: 'number' },
    { key: 'contactName', label: 'Nome do Contato' },
    { key: 'contactEmail', label: 'E-mail do Contato', type: 'email' },
    { key: 'expectedClose', label: 'Previsão de Fechamento', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', defaultValue: 'aberta', options: [{ value: 'aberta', label: 'Aberta' }, { value: 'ganha', label: 'Ganha' }, { value: 'perdida', label: 'Perdida' }] },
    { key: 'notes', label: 'Observações', type: 'textarea' }
  ]}
    />
  );
}
