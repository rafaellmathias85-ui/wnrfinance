'use client';

import { CrudPage } from '@/components/enterprise';

export default function Page() {
  return (
    <CrudPage
      title="Metas Comerciais"
      subtitle="Metas e objetivos da equipe de vendas"
      apiUrl="/api/pj/vendas/targets"
      entityName="meta"
      newLabel="Nova Meta"
      columns={[
        { key: 'period', label: 'Período' },
        { key: 'targetValue', label: 'Meta', render: (v: any) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—' },
        { key: 'currentValue', label: 'Realizado', render: (v: any) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00' },
        { key: 'progress', label: '%', render: (_: any, row: any) => { const pct = row.targetValue > 0 ? ((row.currentValue || 0) / row.targetValue * 100).toFixed(0) : '0'; return `${pct}%`; } },
        { key: 'status', label: 'Status', render: (v: any) => v === 'active' ? '🟢 Ativa' : '✅ Concluída' },
      ]}
      fields={[
        { key: 'period', label: 'Período', required: true, placeholder: 'Ex: 2026-05' },
        { key: 'targetValue', label: 'Meta (R$)', type: 'number', required: true },
        { key: 'currentValue', label: 'Realizado (R$)', type: 'number' },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'active', options: [{ value: 'active', label: 'Ativa' }, { value: 'completed', label: 'Concluída' }] },
      ]}
    />
  );
}
