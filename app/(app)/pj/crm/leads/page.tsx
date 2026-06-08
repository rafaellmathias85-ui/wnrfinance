'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Leads"
      subtitle="Prospecção de novos clientes"
      apiUrl="/api/pj/crm/leads"
      entityName="lead"
      newLabel="Novo Lead"
      columns={[
    { key: 'name', label: 'Nome' },
    { key: 'company', label: 'Empresa' },
    { key: 'email', label: 'E-mail' },
    { key: 'phone', label: 'Telefone' },
    { key: 'source', label: 'Origem', render: (v: any) => { const m: Record<string,string> = { 'site': 'Site', 'indicacao': 'Indicação', 'telefone': 'Telefone', 'email': 'E-mail', 'rede_social': 'Rede Social' }; return m[v] || v || '—'; } },
    { key: 'status', label: 'Status', render: (v: any) => { const m: Record<string,string> = { 'novo': 'Novo', 'contatado': 'Contatado', 'qualificado': 'Qualificado', 'descartado': 'Descartado' }; return m[v] || v || '—'; } }
  ]}
      fields={[
    { key: 'name', label: 'Nome', required: true },
    { key: 'company', label: 'Empresa' },
    { key: 'email', label: 'E-mail', type: 'email' },
    { key: 'phone', label: 'Telefone' },
    { key: 'source', label: 'Origem', type: 'select', options: [{ value: 'site', label: 'Site' }, { value: 'indicacao', label: 'Indicação' }, { value: 'telefone', label: 'Telefone' }, { value: 'email', label: 'E-mail' }, { value: 'rede_social', label: 'Rede Social' }] },
    { key: 'status', label: 'Status', type: 'select', defaultValue: 'novo', options: [{ value: 'novo', label: 'Novo' }, { value: 'contatado', label: 'Contatado' }, { value: 'qualificado', label: 'Qualificado' }, { value: 'descartado', label: 'Descartado' }] },
    { key: 'notes', label: 'Observações', type: 'textarea' }
  ]}
    />
  );
}
