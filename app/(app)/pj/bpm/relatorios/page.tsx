'use client';
import { apiFetch } from '@/lib/fetch';
import { PlayCircle, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CheckCircle, Clock } from 'lucide-react';
import { PageHeader } from '@/components/enterprise';


export default function Page() {
  const [processes, setProcesses] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/pj/bpm/processes').then(r => r.json()),
      apiFetch('/api/pj/bpm/instances').then(r => r.json()),
    ]).then(([p, i]) => {
      setProcesses(Array.isArray(p) ? p : []);
      setInstances(Array.isArray(i) ? i : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalProcesses = processes.length;
  const totalInstances = instances.length;
  const running = instances.filter((i: any) => i.status === 'running' || i.status === 'pending').length;
  const completed = instances.filter((i: any) => i.status === 'completed').length;

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios BPM" subtitle="Análises de processos e solicitações" />
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Processos', value: totalProcesses, icon: Workflow, color: 'text-blue-600' },
              { label: 'Solicitações', value: totalInstances, icon: PlayCircle, color: 'text-purple-600' },
              { label: 'Em Andamento', value: running, icon: Clock, color: 'text-amber-600' },
              { label: 'Concluídas', value: completed, icon: CheckCircle, color: 'text-green-600' },
            ].map(k => (
              <div key={k.label} className="bg-card border border-border/60 rounded-xl p-4 text-center">
                <k.icon className={`w-6 h-6 mx-auto mb-2 ${k.color}`} />
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border/60 rounded-xl p-4">
            <h3 className="font-semibold mb-3">Solicitações por Status</h3>
            {['pending', 'running', 'completed', 'cancelled'].map(st => {
              const count = instances.filter((i: any) => i.status === st).length;
              const labels: Record<string,string> = { 'pending': '⏳ Pendente', 'running': '🔄 Em Andamento', 'completed': '✅ Concluída', 'cancelled': '❌ Cancelada' };
              return (
                <div key={st} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <span className="text-sm">{labels[st] || st}</span>
                  <span className="font-bold">{count}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
