'use client';

import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, Plus, Search, TicketCheck, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/enterprise';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STATUS_COLORS: Record<string, string> = {
  aberto: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  em_atendimento: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  pendente: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  resolvido: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  fechado: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em Atendimento',
  pendente: 'Pendente',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

const PRIORITY_COLORS: Record<string, string> = {
  critica: 'text-red-500',
  alta: 'text-orange-500',
  media: 'text-yellow-500',
  baixa: 'text-green-500',
};

export default function PortalPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    apiFetch('/api/pj/servicedesk/tickets')
      .then(r => r.json())
      .then(d => setTickets(d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = tickets.filter(t =>
    (!search || t.subject?.toLowerCase().includes(search.toLowerCase()) || t.requester?.toLowerCase().includes(search.toLowerCase())) &&
    (!filterStatus || t.status === filterStatus)
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Portal do Cliente" subtitle="Central de chamados abertos pelos clientes" />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por assunto ou solicitante..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Link href="/pj/servicedesk/tickets">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" /> Novo Chamado
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border/60 rounded-xl p-12 text-center">
          <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Nenhum chamado encontrado</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            {search || filterStatus ? 'Tente outros filtros.' : 'Abra o primeiro chamado clicando em "Novo Chamado".'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <Link key={t.id} href={`/pj/servicedesk/tickets/${t.id}`}
              className="block bg-card border border-border/60 rounded-xl p-5 hover:shadow-md hover:border-primary/20 transition-all group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <TicketCheck className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold group-hover:text-primary transition-colors">
                      <span className="text-muted-foreground font-mono text-sm">#{t.number} </span>{t.subject}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t.requester || 'Sem solicitante'} · {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                      {t.agentName && ` · Agente: ${t.agentName}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[t.status] || ''}`}>
                    {STATUS_LABELS[t.status] || t.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
