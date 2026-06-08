'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/enterprise';
import { apiFetch } from '@/lib/fetch';
import { Plus, Search, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Eye, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

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
  fechado: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em Atendimento',
  pendente: 'Pendente',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

const PRIORITY_LABELS: Record<string, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa',
};

const FIELDS = [
  { key: 'subject', label: 'Assunto', required: true },
  { key: 'description', label: 'Descrição', type: 'textarea' },
  { key: 'requester', label: 'Solicitante' },
  { key: 'requesterEmail', label: 'E-mail do Solicitante', type: 'email' },
  { key: 'agentName', label: 'Agente Responsável' },
  { key: 'category', label: 'Categoria' },
  { key: 'priority', label: 'Prioridade', type: 'select', defaultValue: 'media', options: [
    { value: 'baixa', label: 'Baixa' },
    { value: 'media', label: 'Média' },
    { value: 'alta', label: 'Alta' },
    { value: 'critica', label: 'Crítica' },
  ]},
  { key: 'status', label: 'Status', type: 'select', defaultValue: 'aberto', options: [
    { value: 'aberto', label: 'Aberto' },
    { value: 'em_atendimento', label: 'Em Atendimento' },
    { value: 'pendente', label: 'Pendente' },
    { value: 'resolvido', label: 'Resolvido' },
    { value: 'fechado', label: 'Fechado' },
  ]},
];

export default function TicketsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/pj/servicedesk/tickets');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro ao carregar');
      setItems(d.items || []);
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao carregar', variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    const defaults: Record<string, any> = {};
    FIELDS.forEach(f => { defaults[f.key] = (f as any).defaultValue ?? ''; });
    setForm(defaults);
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    const vals: Record<string, any> = {};
    FIELDS.forEach(f => { vals[f.key] = item[f.key] ?? ''; });
    setForm(vals);
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const payload = editing ? { ...form, id: editing.id } : form;
      const r = await apiFetch('/api/pj/servicedesk/tickets', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
      toast({ title: editing ? 'Ticket atualizado!' : 'Ticket criado!' });
      setShowForm(false);
      load();
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao salvar', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este ticket?')) return;
    try {
      const r = await apiFetch(`/api/pj/servicedesk/tickets?id=${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Erro');
      toast({ title: 'Ticket excluído!' });
      load();
    } catch { toast({ title: 'Erro ao excluir', variant: 'destructive' }); }
  };

  const filtered = items.filter(item => {
    const matchSearch = !search || [item.subject, item.requester, item.agentName, item.category].some(
      v => v && String(v).toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = !filterStatus || item.status === filterStatus;
    const matchPriority = !filterPriority || item.priority === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);

  return (
    <div className="space-y-6">
      <PageHeader title="Tickets" subtitle="Gerenciar chamados de suporte" />

      <div className="bg-card border border-border/60 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por assunto, solicitante, agente..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-10" />
          </div>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm min-w-[140px]">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filterPriority} onChange={e => { setFilterPriority(e.target.value); setPage(0); }}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm min-w-[140px]">
            <option value="">Todas prioridades</option>
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1.5" /> Novo Ticket
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-14">Nº</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assunto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Solicitante</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Agente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prioridade</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Data</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {paged.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    {search || filterStatus || filterPriority ? 'Nenhum ticket com esses filtros.' : 'Nenhum ticket ainda. Crie o primeiro chamado.'}
                  </td></tr>
                ) : paged.map(item => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">#{item.number}</td>
                    <td className="px-4 py-3 text-sm font-medium max-w-xs">
                      <Link href={`/pj/servicedesk/tickets/${item.id}`} className="hover:text-primary transition-colors line-clamp-1">
                        {item.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{item.requester || '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">{item.agentName || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[item.priority] || ''}`}>
                        {PRIORITY_LABELS[item.priority] || item.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] || ''}`}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden xl:table-cell">
                      {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/pj/servicedesk/tickets/${item.id}`}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Ver detalhes">
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </Link>
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Editar">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
            <span className="text-xs text-muted-foreground">{filtered.length} ticket(s)</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-2">{page + 1} / {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-card border-b border-border/60 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-semibold">{editing ? 'Editar Ticket' : 'Novo Ticket'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label className="text-sm font-medium mb-1.5 block">
                    {f.label}{f.required && <span className="text-red-500"> *</span>}
                  </label>
                  {f.type === 'select' ? (
                    <select value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm">
                      {(f as any).options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[100px] resize-none" />
                  ) : (
                    <Input type={f.type || 'text'} value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 bg-card border-t border-border/60 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                {editing ? 'Salvar' : 'Criar Ticket'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
