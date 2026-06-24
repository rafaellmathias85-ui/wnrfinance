'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/enterprise';
import { apiFetch } from '@/lib/fetch';
import { Headphones, TicketCheck, Clock, CheckCircle, AlertTriangle, Calendar, BarChart3, Users, Plus, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const PRIORITY_COLORS: Record<string, string> = {
  critica: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  alta: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  media: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  baixa: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const STATUS_COLORS: Record<string, string> = {
  aberto: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  em_atendimento: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  pendente: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  resolvido: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  fechado: 'bg-gray-100 text-gray-600 dark:bg-card dark:text-muted-foreground',
};

const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em Atendimento',
  pendente: 'Pendente',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

const PRIORITY_LABELS: Record<string, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export default function ServiceDeskDashboard() {
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
    { label: 'Abertos', value: stats?.abertos ?? 0, icon: TicketCheck, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Em Atendimento', value: stats?.emAtendimento ?? 0, icon: Clock, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { label: 'Resolvidos (Mês)', value: stats?.resolvidosMes ?? 0, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: 'SLA Excedido', value: stats?.slaExcedido ?? 0, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
  ];

  const quickLinks = [
    { href: '/pj/servicedesk/tickets', label: 'Tickets', icon: TicketCheck, color: 'text-blue-500' },
    { href: '/pj/servicedesk/agenda', label: 'Agenda', icon: Calendar, color: 'text-green-500' },
    { href: '/pj/servicedesk/agentes', label: 'Agentes', icon: Headphones, color: 'text-purple-500' },
    { href: '/pj/servicedesk/grupos', label: 'Grupos', icon: Users, color: 'text-amber-500' },
    { href: '/pj/servicedesk/relatorios', label: 'Relatórios', icon: BarChart3, color: 'text-cyan-500' },
    { href: '/pj/servicedesk/portal', label: 'Portal', icon: Headphones, color: 'text-red-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="ServiceDesk" subtitle="Gestão de chamados e atendimento ao cliente" />
        <Link href="/pj/servicedesk/tickets">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" /> Novo Ticket
          </Button>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-card border border-border/60 rounded-xl p-5">
            <div className={`w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center mb-3`}>
              <k.icon className={`w-5 h-5 ${k.color}`} />
            </div>
            {loading ? (
              <div className="h-8 w-12 bg-muted rounded animate-pulse mb-1" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{k.value}</p>
            )}
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {quickLinks.map(link => (
          <Link key={link.href} href={link.href}
            className="bg-card border border-border/60 rounded-xl p-5 flex flex-col items-center gap-3 hover:shadow-lg hover:border-primary/30 transition-all group">
            <link.icon className={`w-8 h-8 ${link.color} group-hover:scale-110 transition-transform`} />
            <span className="text-sm font-medium text-foreground">{link.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tickets */}
        <div className="bg-card border border-border/60 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Tickets Recentes</h3>
            <Link href="/pj/servicedesk/tickets" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
            </div>
          ) : stats?.recentes?.length === 0 ? (
            <div className="text-center py-8">
              <TicketCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum ticket ainda. Crie o primeiro chamado.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(stats?.recentes ?? []).map((t: any) => (
                <Link key={t.id} href={`/pj/servicedesk/tickets/${t.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      #{t.number} {t.subject}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.requester || 'Sem solicitante'} · {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[t.priority] || ''}`}>
                      {PRIORITY_LABELS[t.priority] || t.priority}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status] || ''}`}>
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-card border border-border/60 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Resumo por Status</h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { key: 'abertos', label: 'Abertos', color: 'bg-blue-500' },
                { key: 'emAtendimento', label: 'Em Atendimento', color: 'bg-purple-500' },
                { key: 'pendentes', label: 'Pendentes', color: 'bg-yellow-500' },
                { key: 'resolvidos', label: 'Resolvidos', color: 'bg-green-500' },
              ].map(s => {
                const val = stats?.[s.key] ?? 0;
                const total = stats?.total || 1;
                const pct = Math.round((val / total) * 100);
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-28 shrink-0">{s.label}</span>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div className={`${s.color} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-semibold w-8 text-right">{val}</span>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-border/50 flex justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold">{stats?.total ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
