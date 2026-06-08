'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Solicitações"
      subtitle="Iniciar novos processos"
      apiUrl="/api/pj/bpm/instances"
      entityName="solicitação"
      newLabel="Nova Solicitação"
      columns={[
    { key: 'requester', label: 'Solicitante' },
    { key: 'currentStep', label: 'Etapa Atual' },
    { key: 'priority', label: 'Prioridade' },
    { key: 'status', label: 'Status', render: (v: any) => { const m: Record<string,string> = { 'em_andamento': 'Em Andamento', 'finalizado': 'Finalizado', 'cancelado': 'Cancelado' }; return m[v] || v || '—'; } }
  ]}
      fields={[
    { key: 'requester', label: 'Solicitante', required: true },
    { key: 'currentStep', label: 'Etapa Atual' },
    { key: 'priority', label: 'Prioridade', type: 'select', defaultValue: 'normal', options: [{ value: 'baixa', label: 'Baixa' }, { value: 'normal', label: 'Normal' }, { value: 'alta', label: 'Alta' }, { value: 'urgente', label: 'Urgente' }] },
    { key: 'status', label: 'Status', type: 'select', defaultValue: 'em_andamento', options: [{ value: 'em_andamento', label: 'Em Andamento' }, { value: 'finalizado', label: 'Finalizado' }, { value: 'cancelado', label: 'Cancelado' }] }
  ]}
    />
  );
}
