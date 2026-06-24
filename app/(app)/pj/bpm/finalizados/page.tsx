'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import { CheckCircle, Search } from 'lucide-react';
import { PageHeader } from '@/components/enterprise';
import { Input } from '@/components/ui/input';


export default function Page() {
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch('/api/pj/bpm/instances').then(r => r.json())
      .then(d => setInstances(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const completed = instances.filter((i: any) => 
    (i.status === 'completed' || i.status === 'cancelled') &&
    (i.title?.toLowerCase().includes(search.toLowerCase()) || i.processName?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Processos Finalizados" subtitle="Solicitações concluídas ou canceladas" />
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>
      ) : completed.length === 0 ? (
        <div className="bg-card border border-border/60 rounded-xl p-8 text-center">
          <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">Nenhum processo finalizado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {completed.map((inst: any) => (
            <div key={inst.id} className="bg-card border border-border/60 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold">{inst.title || 'Sem título'}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{inst.requester || '—'}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${inst.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-muted-foreground dark:bg-card dark:text-muted-foreground'}`}>
                  {inst.status === 'completed' ? '✅ Concluído' : '❌ Cancelado'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
