'use client';

// Conciliação PF — "Arquivos de conciliação" (lotes)
// Lista de lotes de importação OFX/CSV da pessoa física.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, RefreshCw, Trash2, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/fetch';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  CONCILIADO: { label: 'CONCILIADO', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  PARCIAL:    { label: 'PARCIAL',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  PENDENTE:   { label: 'PENDENTE',   cls: 'bg-slate-100 text-slate-700 dark:bg-card dark:text-foreground' },
};

const TYPE_BADGE: Record<string, string> = {
  AUTOMATICO: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  MANUAL:     'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
};

function fmtDateTime(d: string | Date) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDate(d: string | Date | null) {
  return d ? new Date(d).toLocaleDateString('pt-BR') : '—';
}

export default function ConciliacaoPFLotesPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope: 'pf', page: String(page) });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch(`/api/reconciliation/batches?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBatches(data.batches || []);
      setPages(data.pages || 1);
    } catch {
      toast.error('Erro ao carregar lotes de conciliação');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const deleteBatch = async (id: string) => {
    if (!confirm('Excluir este lote vazio?')) return;
    const res = await apiFetch(`/api/reconciliation/batches?batchId=${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Lote excluído');
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Não foi possível excluir');
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Conciliação | Arquivos de conciliação</h1>
          <p className="text-sm text-muted-foreground">
            Lotes de importações manuais OFX/CSV por conta bancária PF
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">Todos os status</option>
            <option value="PENDENTE">Pendente</option>
            <option value="PARCIAL">Parcial</option>
            <option value="CONCILIADO">Conciliado</option>
          </select>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1 h-4 w-4" /> Atualizar
          </Button>
          <Button size="sm" onClick={() => router.push('/conciliacao')}>
            <Upload className="mr-1 h-4 w-4" /> Importar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Banco / Conta</th>
                  <th className="px-4 py-3">Período</th>
                  <th className="px-4 py-3 text-center">Conciliados</th>
                  <th className="px-4 py-3 text-center">Ignorados</th>
                  <th className="px-4 py-3 text-center">Pendentes</th>
                  <th className="px-4 py-3 text-center">Total</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Carregando…</td></tr>
                ) : batches.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Nenhum lote encontrado. Importe um arquivo OFX do seu banco para iniciar a conciliação.</td></tr>
                ) : (
                  batches.map((b) => (
                    <tr
                      key={b.id}
                      className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                      onClick={() => router.push(`/conciliacao/lotes/${b.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[b.type] || ''}`}>{b.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[b.status]?.cls || ''}`}>
                          {STATUS_BADGE[b.status]?.label || b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(b.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{b.connection?.bankName || b.source}</div>
                        {b.connection && (
                          <div className="text-xs text-muted-foreground">
                            Agência: {b.connection.agency || '—'} | Conta: {b.connection.accountNumber || '—'}{b.connection.accountDigit ? ` - ${b.connection.accountDigit}` : ''}
                          </div>
                        )}
                        {b.connection?.syncError && (
                          <div className="mt-0.5 text-xs text-red-600" title={b.connection.syncError}>
                            ⚠️ {b.connection.syncError.slice(0, 80)}{b.connection.syncError.length > 80 ? '…' : ''}
                          </div>
                        )}
                        {b.fileName && <div className="text-xs text-muted-foreground">{b.fileName}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {b.periodStart || b.periodEnd
                          ? `De ${fmtDate(b.periodStart)} à ${fmtDate(b.periodEnd)}`
                          : <span className="text-muted-foreground italic">Sem transações</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-green-600">{b.reconciledCount}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{b.ignoredCount}</td>
                      <td className="px-4 py-3 text-center font-medium text-amber-600">{b.pendingCount}</td>
                      <td className="px-4 py-3 text-center font-semibold">{b.totalCount}</td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Abrir" onClick={() => router.push(`/conciliacao/lotes/${b.id}`)}>
                            <Search className="h-4 w-4" />
                          </Button>
                          {b.totalCount === 0 && (
                            <Button variant="ghost" size="icon" title="Excluir lote vazio" onClick={() => deleteBatch(b.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft className="h-4 w-4" /> Anterior
        </Button>
        <span className="text-sm text-muted-foreground">Página {page} de {pages}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
          Próxima <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
