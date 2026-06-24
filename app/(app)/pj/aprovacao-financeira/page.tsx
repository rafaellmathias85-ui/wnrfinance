'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Check, Clock, X, FileText, User } from 'lucide-react';
import { PermissionGuard } from '@/components/pj/PermissionGuard';

interface Approval {
  id: string;
  type: string;
  description: string;
  amount: number;
  status: string;
  notes: string | null;
  createdAt: string;
  requester: { id: string; name: string | null; email: string };
  approver: { id: string; name: string | null; email: string } | null;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  pending: { label: 'Pendente', class: 'bg-amber-900/30 text-amber-300' },
  approved: { label: 'Aprovado', class: 'bg-green-900/30 text-green-300' },
  rejected: { label: 'Rejeitado', class: 'bg-red-900/30 text-red-300' },
};

const TYPE_LABELS: Record<string, string> = {
  expense: 'Despesa',
  income: 'Receita',
  compra: 'Compra',
};

type Tab = 'pending' | 'approved' | 'rejected' | 'all';

export default function AprovacaoFinanceiraPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState<{ approval: Approval; action: 'approved' | 'rejected' } | null>(null);
  const [notes, setNotes] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(`/api/pj/approvals?status=${tab}`);
    const d = await r.json();
    setApprovals(d.approvals || []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async () => {
    if (!actionModal) return;
    setActing(true);
    const r = await apiFetch('/api/pj/approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: actionModal.approval.id, status: actionModal.action, notes }),
    });
    if (r.ok) {
      toast.success(actionModal.action === 'approved' ? 'Aprovado com sucesso' : 'Rejeitado');
      setActionModal(null);
      setNotes('');
      load();
    } else {
      const d = await r.json();
      toast.error(d.error || 'Erro ao processar');
    }
    setActing(false);
  };

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'pending', label: 'Pendentes' },
    { id: 'approved', label: 'Aprovados' },
    { id: 'rejected', label: 'Rejeitados' },
    { id: 'all', label: 'Todos' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Aprovação Financeira</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Gerencie solicitações de aprovação de despesas e receitas</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card/60 border border-border rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-muted text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Tipo</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Descrição</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Solicitante</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Aprovador</th>
              <th className="text-right px-4 py-3 text-muted-foreground font-medium">Valor</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Data</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : approvals.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-muted-foreground">Nenhuma solicitação {tab !== 'all' ? STATUS_CONFIG[tab]?.label.toLowerCase() : ''}</p>
                </td>
              </tr>
            ) : approvals.map((a) => (
              <tr key={a.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 bg-muted text-foreground rounded text-xs">
                    {TYPE_LABELS[a.type] || a.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground max-w-xs truncate">{a.description}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-foreground text-xs">{a.requester.name || a.requester.email}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {a.approver ? (
                    <span className="text-foreground text-xs">{a.approver.name || a.approver.email}</span>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-foreground font-semibold">{fmt(a.amount)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(a.createdAt)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[a.status]?.class || ''}`}>
                    {a.status === 'pending' ? <Clock className="w-3 h-3" /> : a.status === 'approved' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    {STATUS_CONFIG[a.status]?.label || a.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {a.status === 'pending' && (
                    <PermissionGuard module="financeiro" action="aprovar">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setActionModal({ approval: a, action: 'approved' })}
                          className="p-1.5 bg-green-700/40 hover:bg-green-600/60 text-green-300 rounded-lg"
                          title="Aprovar"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setActionModal({ approval: a, action: 'rejected' })}
                          className="p-1.5 bg-red-700/40 hover:bg-red-600/60 text-red-300 rounded-lg"
                          title="Rejeitar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </PermissionGuard>
                  )}
                  {a.status !== 'pending' && a.notes && (
                    <span className="text-muted-foreground text-xs truncate max-w-[120px] block" title={a.notes}>
                      {a.notes}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-white font-bold">
              {actionModal.action === 'approved' ? 'Confirmar Aprovação' : 'Confirmar Rejeição'}
            </h3>
            <div className="bg-muted/60 rounded-lg p-3">
              <p className="text-white text-sm">{actionModal.approval.description}</p>
              <p className="text-muted-foreground text-xs mt-1">{fmt(actionModal.approval.amount)}</p>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Observação (opcional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm resize-none"
                placeholder="Justificativa..."
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setActionModal(null); setNotes(''); }}
                className="flex-1 bg-muted hover:bg-muted text-foreground py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={handleAction} disabled={acting}
                className={`flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-60 ${
                  actionModal.action === 'approved'
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                }`}>
                {acting ? 'Processando...' : actionModal.action === 'approved' ? 'Confirmar Aprovação' : 'Confirmar Rejeição'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
