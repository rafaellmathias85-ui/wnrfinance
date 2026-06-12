'use client';

// Timeline de auditoria por entidade (paridade BomControle: aba "Histórico"
// do detalhe da fatura — "Quitada", "Conciliado", "Valor alterado de X para Y",
// com usuário e data).

import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/fetch';

interface TimelineProps {
  entity: string; // receivable, boleto, nfe, contract...
  entityId: string;
  limit?: number;
}

const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Criado',
  UPDATE: 'Alterado',
  DELETE: 'Excluído',
  SEND: 'Enviado',
  CANCEL: 'Cancelado',
  PAY: 'Quitado',
  EXPORT: 'Exportado',
  APPROVE: 'Aprovado',
};

function describe(log: any): string {
  const meta = log.metadata || {};
  if (meta.event === 'billing_status_transition') {
    const map: Record<string, string> = {
      FATURADA: 'Faturada',
      QUITADA: 'Quitada',
      CONCILIADA: 'Conciliada',
      VENCIDA: 'Vencida',
      CANCELADA: 'Cancelada',
      PREVISTA: 'Prevista',
    };
    return `${map[meta.to] || meta.to}${meta.notes ? ` — ${meta.notes}` : ''}`;
  }
  if (meta.event === 'faturar_parcela') {
    const parts = [];
    if (meta.nfe) parts.push(`NF: ${meta.nfe}`);
    if (meta.boleto) parts.push(`Boleto: ${meta.boleto}`);
    if (meta.email) parts.push(`E-mail: ${meta.email}`);
    return `Faturamento executado (${parts.join(' · ') || 'sem artefatos'})`;
  }
  if (meta.event === 'contract_adjustment') {
    return `Reajuste de ${meta.percent}%: R$ ${Number(meta.valueBefore).toFixed(2)} → R$ ${Number(meta.valueAfter).toFixed(2)}`;
  }
  if (log.oldData || log.newData) {
    const changes: string[] = [];
    const oldD = log.oldData || {};
    const newD = log.newData || {};
    for (const k of Object.keys(newD)) {
      if (oldD[k] !== undefined && String(oldD[k]) !== String(newD[k])) {
        changes.push(`${k}: ${oldD[k]} → ${newD[k]}`);
      }
    }
    if (changes.length) return changes.slice(0, 3).join('; ');
  }
  return meta.description || meta.event || ACTION_LABEL[log.action] || log.action;
}

export function EntityTimeline({ entity, entityId, limit = 20 }: TimelineProps) {
  const [logs, setLogs] = useState<any[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/audit-logs?entity=${entity}&entityId=${entityId}&limit=${limit}`);
        if (res.ok && active) {
          const data = await res.json();
          setLogs(data.logs || data.auditLogs || data.items || []);
        } else if (active) setLogs([]);
      } catch {
        if (active) setLogs([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [entity, entityId, limit]);

  if (logs === null) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (logs.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem histórico registrado.</p>;
  }

  return (
    <div className="space-y-0">
      {logs.map((log, i) => (
        <div key={log.id || i} className="relative flex gap-3 pb-4 pl-1">
          {/* linha vertical */}
          {i < logs.length - 1 && <span className="absolute left-[13px] top-6 h-full w-px bg-border" />}
          <span className="z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background">
            <History className="h-3 w-3 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-medium">{ACTION_LABEL[log.action] || log.action}</span>
              <span className="text-muted-foreground"> — {describe(log)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(log.createdAt).toLocaleString('pt-BR')}
              {log.userName ? ` · ${log.userName}` : log.userId && log.userId !== 'system' ? '' : ' · sistema'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
