'use client';
import { apiFetch } from '@/lib/fetch';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Calendar, CheckCircle2, Clock, Filter, Mail, Phone, Target, Trophy, UserPlus, Users } from 'lucide-react';
import { KpiStrip, PageHeader, type KpiItem } from '@/components/enterprise';
import { Card, CardContent } from '@/components/ui/card';


const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

const ACTIVITY_TYPE: Record<string, { label: string; icon: any; color: string }> = {
  ligacao: { label: 'Ligação', icon: Phone, color: 'text-blue-500' },
  email: { label: 'Email', icon: Mail, color: 'text-green-500' },
  reuniao: { label: 'Reunião', icon: Users, color: 'text-purple-500' },
  tarefa: { label: 'Tarefa', icon: CheckCircle2, color: 'text-amber-500' },
  nota: { label: 'Nota', icon: Calendar, color: 'text-slate-400' },
};

export default function CRMDashboard() {
  const { activeCompanyId } = usePJ();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const res = await apiFetch('/api/pj/crm/stats');
      if (res.ok) setStats(await res.json());
    } catch {}
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const kpis: KpiItem[] = [
    { label: 'Pipeline', value: loading ? '...' : fmt(stats?.valorPipeline ?? 0), icon: <Target className="w-5 h-5" /> },
    { label: 'Leads', value: loading ? '...' : String(stats?.totalLeads ?? 0), icon: <UserPlus className="w-5 h-5" /> },
    { label: 'Conquistas (Mês)', value: loading ? '...' : String(stats?.conquistasMes ?? 0), icon: <Trophy className="w-5 h-5" /> },
    { label: 'Pendências', value: loading ? '...' : String(stats?.atividadesPendentes ?? 0), icon: <Clock className="w-5 h-5" />, color: (stats?.atividadesPendentes ?? 0) > 0 ? 'danger' : 'default' },
  ];

  const quickLinks = [
    { href: '/pj/crm/oportunidades', label: 'Oportunidades', icon: Target, color: 'text-blue-500' },
    { href: '/pj/crm/leads', label: 'Leads', icon: UserPlus, color: 'text-green-500' },
    { href: '/pj/crm/funil', label: 'Funil', icon: Filter, color: 'text-purple-500' },
    { href: '/pj/crm/agenda', label: 'Agenda', icon: Calendar, color: 'text-amber-500' },
    { href: '/pj/crm/relatorios', label: 'Relatórios', icon: BarChart3, color: 'text-cyan-500' },
    { href: '/pj/crm/metas', label: 'Metas', icon: Trophy, color: 'text-red-500' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="CRM" subtitle="Gestão de relacionamento com clientes" />
      <KpiStrip items={kpis} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {quickLinks.map(link => (
          <Link key={link.href} href={link.href}
            className="bg-card border border-border/60 rounded-xl p-5 flex flex-col items-center gap-3 hover:shadow-lg hover:border-primary/30 transition-all group">
            <link.icon className={`w-8 h-8 ${link.color} group-hover:scale-110 transition-transform`} />
            <span className="text-sm font-medium text-foreground">{link.label}</span>
          </Link>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Oportunidades Abertas', value: stats?.oportunidadesAbertas ?? 0 },
          { label: 'Novos Leads (Mês)', value: stats?.novosLeadsMes ?? 0 },
          { label: 'Perdas (Mês)', value: stats?.perdasMes ?? 0 },
          { label: 'Tx. Conversão', value: `${stats?.taxaConversao ?? 0}%` },
        ].map(item => (
          <Card key={item.label}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{loading ? '—' : item.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Atividades recentes */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Atividades Recentes</h3>
              <Link href="/pj/crm/agenda" className="text-xs text-primary hover:underline">Ver agenda</Link>
            </div>
            {loading ? (
              <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : !stats?.recentActivities?.length ? (
              <p className="text-muted-foreground text-sm">Nenhuma atividade registrada.</p>
            ) : (
              <div className="space-y-2">
                {stats.recentActivities.map((a: any) => {
                  const cfg = ACTIVITY_TYPE[a.type] || ACTIVITY_TYPE.nota;
                  const Icon = cfg.icon;
                  const overdue = !a.completed && a.dueDate && new Date(a.dueDate) < new Date();
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                      <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{a.title}</p>
                        <p className={`text-xs ${overdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {a.dueDate ? fmtDate(a.dueDate) : fmtDate(a.createdAt)}
                          {overdue && ' · Vencida'}
                        </p>
                      </div>
                      {a.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <Clock className={`w-4 h-4 flex-shrink-0 ${overdue ? 'text-red-500' : 'text-muted-foreground'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Funil resumo */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Pipeline de Vendas</h3>
              <Link href="/pj/crm/funil" className="text-xs text-primary hover:underline">Ver funil completo</Link>
            </div>
            {loading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : !stats?.funnelDistribution?.length ? (
              <p className="text-muted-foreground text-sm">Adicione oportunidades para visualizar o pipeline.</p>
            ) : (
              <div className="space-y-3">
                {stats.funnelDistribution.map((f: any, i: number) => {
                  const totalValue = stats.valorPipeline || 1;
                  const pct = Math.round((f.value / totalValue) * 100);
                  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-green-500', 'bg-red-500'];
                  return (
                    <div key={f.funnelId || i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Estágio {i + 1}</span>
                        <span className="font-medium">{f.count} oport. · {fmt(f.value)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${colors[i % colors.length]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 flex justify-between text-sm font-semibold border-t border-border/40">
                  <span>Total Pipeline</span>
                  <span className="text-primary">{fmt(stats.valorPipeline ?? 0)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
