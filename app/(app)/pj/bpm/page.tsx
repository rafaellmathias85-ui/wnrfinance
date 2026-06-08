'use client';

import { useState, useEffect } from 'react';
import { PageHeader, KpiStrip, type KpiItem } from '@/components/enterprise';
import { Workflow, PlayCircle, Clock, CheckCircle, AlertTriangle, BarChart3, Building, Briefcase } from 'lucide-react';
import { usePJ } from '@/lib/pj-context';
import Link from 'next/link';

export default function BPMDashboard() {
  const { activeCompanyId } = usePJ();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const kpis: KpiItem[] = [
    { label: 'Processos Ativos', value: '0', icon: <PlayCircle className="w-5 h-5" /> },
    { label: 'Em Andamento', value: '0', icon: <Clock className="w-5 h-5" /> },
    { label: 'Finalizados (Mês)', value: '0', icon: <CheckCircle className="w-5 h-5" /> },
    { label: 'Atrasados', value: '0', icon: <AlertTriangle className="w-5 h-5" /> },
  ];

  if (!mounted) return null;

  const quickLinks = [
    { href: '/pj/bpm/solicitacoes', label: 'Nova Solicitação', icon: PlayCircle, color: 'text-blue-500' },
    { href: '/pj/bpm/em-andamento', label: 'Em Andamento', icon: Clock, color: 'text-amber-500' },
    { href: '/pj/bpm/finalizados', label: 'Finalizados', icon: CheckCircle, color: 'text-green-500' },
    { href: '/pj/bpm/processos', label: 'Processos', icon: Workflow, color: 'text-purple-500' },
    { href: '/pj/bpm/departamentos', label: 'Departamentos', icon: Building, color: 'text-cyan-500' },
    { href: '/pj/bpm/relatorios', label: 'Relatórios', icon: BarChart3, color: 'text-red-500' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="BPM" subtitle="Gestão de processos empresariais" />
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border/60 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Processos Recentes</h3>
          <p className="text-muted-foreground text-sm">Nenhum processo iniciado. Configure seus modelos de processo para começar.</p>
        </div>
        <div className="bg-card border border-border/60 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Visão por Departamento</h3>
          <p className="text-muted-foreground text-sm">Cadastre departamentos para visualizar a distribuição de processos.</p>
        </div>
      </div>
    </div>
  );
}
