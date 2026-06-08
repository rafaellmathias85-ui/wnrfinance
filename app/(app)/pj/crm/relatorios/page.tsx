'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import { Handshake, Target, TrendingUp, Users } from 'lucide-react';
import { PageHeader } from '@/components/enterprise';


export default function Page() {
  const [leads, setLeads] = useState<any[]>([]);
  const [opps, setOpps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/pj/crm/leads').then(r => r.json()),
      apiFetch('/api/pj/crm/opportunities').then(r => r.json()),
    ]).then(([l, o]) => {
      setLeads(Array.isArray(l) ? l : []);
      setOpps(Array.isArray(o) ? o : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalLeads = leads.length;
  const totalOpps = opps.length;
  const wonOpps = opps.filter((o: any) => o.stage === 'won').length;
  const totalValue = opps.reduce((s: number, o: any) => s + (o.value || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios CRM" subtitle="Análises do funil e performance comercial" />
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Leads', value: totalLeads, icon: Users, color: 'text-blue-600' },
              { label: 'Oportunidades', value: totalOpps, icon: Target, color: 'text-purple-600' },
              { label: 'Ganhas', value: wonOpps, icon: Handshake, color: 'text-green-600' },
              { label: 'Valor Pipeline', value: `R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: 'text-amber-600' },
            ].map(k => (
              <div key={k.label} className="bg-card border border-border/60 rounded-xl p-4 text-center">
                <k.icon className={`w-6 h-6 mx-auto mb-2 ${k.color}`} />
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border/60 rounded-xl p-4">
              <h3 className="font-semibold mb-3">Leads por Status</h3>
              {['new', 'contacted', 'qualified', 'lost'].map(status => {
                const count = leads.filter((l: any) => l.status === status).length;
                const labels: Record<string,string> = { 'new': 'Novo', 'contacted': 'Contatado', 'qualified': 'Qualificado', 'lost': 'Perdido' };
                return (
                  <div key={status} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <span className="text-sm">{labels[status] || status}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="bg-card border border-border/60 rounded-xl p-4">
              <h3 className="font-semibold mb-3">Oportunidades por Estágio</h3>
              {['prospecting', 'proposal', 'negotiation', 'won', 'lost'].map(stage => {
                const count = opps.filter((o: any) => o.stage === stage).length;
                const labels: Record<string,string> = { 'prospecting': 'Prospecção', 'proposal': 'Proposta', 'negotiation': 'Negociação', 'won': 'Ganho', 'lost': 'Perdido' };
                return (
                  <div key={stage} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <span className="text-sm">{labels[stage] || stage}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
