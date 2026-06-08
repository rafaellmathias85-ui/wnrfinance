'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/fetch';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Loader2, MessageSquare, Lock, Send, Pencil, CheckCircle,
  Clock, AlertTriangle, User, Calendar, Tag, Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

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
  aberto: 'Aberto', em_atendimento: 'Em Atendimento', pendente: 'Pendente', resolvido: 'Resolvido', fechado: 'Fechado',
};
const PRIORITY_LABELS: Record<string, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa',
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tr, cr] = await Promise.all([
        apiFetch(`/api/pj/servicedesk/tickets/${id}`).then(r => r.json()),
        apiFetch(`/api/pj/servicedesk/tickets/${id}/comments`).then(r => r.json()),
      ]);
      setTicket(tr.item);
      setComments(cr.items || []);
      setNewStatus(tr.item?.status || '');
    } catch { toast({ title: 'Erro ao carregar ticket', variant: 'destructive' }); }
    setLoading(false);
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const sendComment = async () => {
    if (!commentBody.trim()) return;
    setSendingComment(true);
    try {
      const r = await apiFetch(`/api/pj/servicedesk/tickets/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody, isInternal }),
      });
      if (!r.ok) throw new Error('Erro');
      setCommentBody('');
      load();
      toast({ title: 'Comentário adicionado!' });
    } catch { toast({ title: 'Erro ao comentar', variant: 'destructive' }); }
    setSendingComment(false);
  };

  const saveStatus = async () => {
    if (!newStatus || newStatus === ticket?.status) { setEditingStatus(false); return; }
    setSavingStatus(true);
    try {
      const r = await apiFetch(`/api/pj/servicedesk/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) throw new Error('Erro');
      toast({ title: 'Status atualizado!' });
      setEditingStatus(false);
      load();
    } catch { toast({ title: 'Erro ao atualizar status', variant: 'destructive' }); }
    setSavingStatus(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (!ticket) return (
    <div className="text-center py-24">
      <p className="text-muted-foreground">Ticket não encontrado.</p>
      <Link href="/pj/servicedesk/tickets"><Button variant="outline" className="mt-4">Voltar</Button></Link>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/pj/servicedesk/tickets">
          <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground font-mono">#{ticket.number}</span>
            <h1 className="text-xl font-bold">{ticket.subject}</h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-card border border-border/60 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Descrição</h3>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {ticket.description || 'Sem descrição informada.'}
            </p>
          </div>

          {/* Resolution */}
          {ticket.resolution && (
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <h3 className="text-sm font-semibold text-green-700 dark:text-green-400">Resolução</h3>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{ticket.resolution}</p>
            </div>
          )}

          {/* Comments */}
          <div className="bg-card border border-border/60 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Histórico ({comments.length})
            </h3>
            <div className="space-y-4">
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma mensagem ainda. Inicie a conversa abaixo.</p>
              ) : comments.map(c => (
                <div key={c.id} className={`flex gap-3 ${c.isInternal ? 'opacity-75' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">{c.authorName}</span>
                      {c.isInternal && (
                        <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-1.5 py-0.5 rounded">
                          <Lock className="w-3 h-3" /> Interno
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className={`bg-muted/50 rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap ${c.isInternal ? 'border border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/5' : ''}`}>
                      {c.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* New comment */}
            <div className="mt-6 pt-4 border-t border-border/50">
              <textarea
                value={commentBody}
                onChange={e => setCommentBody(e.target.value)}
                placeholder="Escreva uma resposta ou nota..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[90px] resize-none"
              />
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)}
                    className="rounded" />
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Nota interna (não visível ao cliente)
                  </span>
                </label>
                <Button size="sm" onClick={sendComment} disabled={sendingComment || !commentBody.trim()}>
                  {sendingComment ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                  Enviar
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-4">
          {/* Status */}
          <div className="bg-card border border-border/60 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Status</h3>
              <button onClick={() => setEditingStatus(!editingStatus)} className="text-xs text-primary hover:underline">
                {editingStatus ? 'Cancelar' : 'Alterar'}
              </button>
            </div>
            {editingStatus ? (
              <div className="space-y-2">
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm">
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <Button size="sm" className="w-full" onClick={saveStatus} disabled={savingStatus}>
                  {savingStatus && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Salvar
                </Button>
              </div>
            ) : (
              <span className={`inline-flex text-sm px-3 py-1 rounded-full font-medium ${STATUS_COLORS[ticket.status] || ''}`}>
                {STATUS_LABELS[ticket.status] || ticket.status}
              </span>
            )}
          </div>

          {/* Details */}
          <div className="bg-card border border-border/60 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold mb-1">Detalhes</h3>
            <div className="flex items-center gap-2 text-sm">
              <Tag className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Prioridade:</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[ticket.priority] || ''}`}>
                {PRIORITY_LABELS[ticket.priority] || ticket.priority}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Solicitante:</span>
              <span className="font-medium truncate">{ticket.requester || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Agente:</span>
              <span className="font-medium truncate">{ticket.agentName || '—'}</span>
            </div>
            {ticket.category && (
              <div className="flex items-center gap-2 text-sm">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Categoria:</span>
                <span className="font-medium">{ticket.category}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Criado:</span>
              <span className="font-medium">{new Date(ticket.createdAt).toLocaleDateString('pt-BR')}</span>
            </div>
            {ticket.slaDeadline && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">SLA:</span>
                <span className={`font-medium ${new Date(ticket.slaDeadline) < new Date() && !['resolvido','fechado'].includes(ticket.status) ? 'text-red-500' : ''}`}>
                  {new Date(ticket.slaDeadline).toLocaleDateString('pt-BR')}
                </span>
              </div>
            )}
            {ticket.resolvedAt && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                <span className="text-muted-foreground">Resolvido:</span>
                <span className="font-medium">{new Date(ticket.resolvedAt).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-card border border-border/60 rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-3">Ações Rápidas</h3>
            <div className="space-y-2">
              <Link href={`/pj/servicedesk/tickets/${id}/editar`}>
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Pencil className="w-4 h-4 mr-2" /> Editar Ticket
                </Button>
              </Link>
              {ticket.status !== 'resolvido' && (
                <Button variant="outline" size="sm" className="w-full justify-start text-green-600 border-green-200 hover:bg-green-50" onClick={async () => {
                  setSavingStatus(true);
                  await apiFetch(`/api/pj/servicedesk/tickets/${id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'resolvido' }),
                  });
                  toast({ title: 'Ticket marcado como resolvido!' });
                  load();
                  setSavingStatus(false);
                }}>
                  <CheckCircle className="w-4 h-4 mr-2" /> Marcar Resolvido
                </Button>
              )}
              {ticket.status !== 'fechado' && (
                <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground" onClick={async () => {
                  setSavingStatus(true);
                  await apiFetch(`/api/pj/servicedesk/tickets/${id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'fechado' }),
                  });
                  toast({ title: 'Ticket fechado!' });
                  load();
                  setSavingStatus(false);
                }}>
                  <AlertTriangle className="w-4 h-4 mr-2" /> Fechar Ticket
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
