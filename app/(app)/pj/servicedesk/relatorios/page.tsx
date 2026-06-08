'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { PageHeader } from '@/components/enterprise';
import { TicketCheck, Clock, CheckCircle, AlertTriangle, TrendingUp, Users } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export default function ServiceDeskReportPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/pj/servicedesk/stats')
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const kpis = [
    { label: 'Total Tickets', value: stats?.total ?? 0, icon: TicketCheck, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Abertos', value: stats?.abertos ?? 0, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: 'Resolvidos (Mês)', value: stats?.resolvidosMes ?? 0, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: 'SLA Excedido', value: stats?.slaExcedido ?? 0, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
  ];

  const statusDistribution = [
    { key: 'abertos', label: 'Abertos', color: 'bg-blue-500' },
    { key: 'emAtendimento', label: 'Em Atendimento', color: 'bg-purple-500' },
    { key: 'pendentes', label: 'Pendentes', color: 'bg-yellow-500' },
    { key: 'resolvidos', label: 'Resolvidos', color: 'bg-green-500' },
    { key: 'fechados', label: 'Fechados', color: 'bg-gray-400' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios ServiceDesk" subtitle="Métricas e análises de atendimento" />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpis.map(k => (
              <div key={k.label} className="bg-card border border-border/60 rounded-xl p-5">
                <div className={`w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center mb-3`}>
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                </div>
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Status Distribution */}
            <div className="bg-card border border-border/60 rounded-xl p-6">
              <h3 className="font-semibold mb-4">Distribuição por Status</h3>
              <div className="space-y-3">
                {statusDistribution.map(s => {
                  const val = stats?.[s.key] ?? 0;
                  const total = stats?.total || 1;
                  const pct = Math.round((val / total) * 100);
                  return (
                    <div key={s.key} className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-32 shrink-0">{s.label}</span>
                      <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                        <div className={`${s.color} h-2.5 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-semibold w-12 text-right">{val}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent tickets summary */}
            <div className="bg-card border border-border/60 rounded-xl p-6">
              <h3 className="font-semibold mb-4">Últimos Tickets Registrados</h3>
              {(stats?.recentes ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum ticket registrado.</p>
              ) : (
                <div className="space-y-2">
                  {(stats?.recentes ?? []).slice(0, 6).map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">#{t.number} {t.subject}</p>
                        <p className="text-xs text-muted-foreground">{t.requester || 'Sem solicitante'}</p>
                      </div>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">
                        {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
