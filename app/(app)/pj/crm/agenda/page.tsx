'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Agenda Comercial"
      subtitle="Atividades, reuniões e follow-ups"
      apiUrl="/api/pj/crm/activities"
      entityName="atividade"
      newLabel="Nova Atividade"
      columns={[
        { key: 'type', label: 'Tipo', render: (v: any) => { const m: Record<string,string> = { 'call': '📞 Ligação', 'meeting': '🤝 Reunião', 'email': '📧 E-mail', 'visit': '🏢 Visita', 'task': '✅ Tarefa', 'followup': '🔄 Follow-up' }; return m[v] || v || '—'; } },
        { key: 'title', label: 'Título' },
        { key: 'contactName', label: 'Contato', render: (v: any) => v || '—' },
        { key: 'dueDate', label: 'Data', render: (v: any) => v ? new Date(v).toLocaleDateString('pt-BR') : '—' },
        { key: 'status', label: 'Status', render: (v: any) => { const m: Record<string,string> = { 'pending': '⏳ Pendente', 'done': '✅ Concluída', 'cancelled': '❌ Cancelada' }; return m[v] || v || '—'; } },
      ]}
      fields={[
        { key: 'type', label: 'Tipo', type: 'select', required: true, defaultValue: 'task', options: [{ value: 'call', label: 'Ligação' }, { value: 'meeting', label: 'Reunião' }, { value: 'email', label: 'E-mail' }, { value: 'visit', label: 'Visita' }, { value: 'task', label: 'Tarefa' }, { value: 'followup', label: 'Follow-up' }] },
        { key: 'title', label: 'Título', required: true },
        { key: 'description', label: 'Descrição', type: 'textarea' },
        { key: 'contactName', label: 'Contato' },
        { key: 'dueDate', label: 'Data/Hora', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'pending', options: [{ value: 'pending', label: 'Pendente' }, { value: 'done', label: 'Concluída' }, { value: 'cancelled', label: 'Cancelada' }] },
      ]}
    />
  );
}
