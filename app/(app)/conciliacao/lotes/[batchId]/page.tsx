'use client';

// Conciliação PF — "Conciliação Extrato"
// Duas colunas: Extrato (banco) × Movimentações não conciliadas (despesas/receitas PF).

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Plus, Search, Check, X, Link2, EyeOff, RotateCcw, ChevronLeft, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/fetch';
import { useFormatCurrency } from '@/hooks/use-format-currency';

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('pt-BR');
}

export default function ConciliacaoPFExtratoPage() {
  const router = useRouter();
  const params = useParams<{ batchId: string }>();
  const formatCurrency = useFormatCurrency();

  const [batch, setBatch] = useState<any>(null);
  const [pairs, setPairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modal "Vincular"
  const [linkTx, setLinkTx] = useState<any>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkCandidates, setLinkCandidates] = useState<any[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);

  // Modal "+" criar lançamento
  const [createTx, setCreateTx] = useState<any>(null);
  const [createDesc, setCreateDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      if (search) qs.set('q', search);
      const res = await apiFetch(`/api/reconciliation/batches/${params.batchId}?${qs}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBatch(data.batch);
      setPairs(data.pairs || []);
    } catch {
      toast.error('Erro ao carregar o lote');
    } finally {
      setLoading(false);
    }
  }, [params.batchId, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const action = async (body: any, okMsg: string) => {
    const res = await apiFetch(`/api/reconciliation/batches/${params.batchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success(okMsg);
      load();
      return true;
    }
    const data = await res.json().catch(() => ({}));
    toast.error(data.error || 'Erro na ação');
    return false;
  };

  const confirmBatch = async () => {
    const suggested = pairs.filter((p) => p.transaction.status === 'SUGGESTED').length;
    if (suggested === 0) {
      toast.info('Nenhuma sugestão pendente para confirmar');
      return;
    }
    if (!confirm(`Confirmar ${suggested} sugestão(ões) de conciliação deste lote?`)) return;
    setConfirming(true);
    await action({ action: 'confirm' }, 'Lote conciliado');
    setConfirming(false);
  };

  // Busca candidatos PF (scope=pf → Expense/Income com companyId=null)
  const searchCandidates = useCallback(async (tx: any, q: string) => {
    setLinkLoading(true);
    try {
      const qs = new URLSearchParams({
        scope: 'pf',
        type: tx.type,
        amount: String(tx.amount),
        date: new Date(tx.date).toISOString(),
      });
      if (q) qs.set('q', q);
      const res = await apiFetch(`/api/reconciliation/candidates?${qs}`);
      const data = await res.json();
      setLinkCandidates(data.candidates || []);
    } catch {
      setLinkCandidates([]);
    } finally {
      setLinkLoading(false);
    }
  }, []);

  useEffect(() => {
    if (linkTx) {
      const t = setTimeout(() => searchCandidates(linkTx, linkQuery), 300);
      return () => clearTimeout(t);
    }
  }, [linkTx, linkQuery, searchCandidates]);

  const statusOfPair = (p: any) => p.transaction.status as string;

  const counters = {
    pending:    pairs.filter((p) => ['PENDING', 'SUGGESTED'].includes(statusOfPair(p))).length,
    suggested:  pairs.filter((p) => statusOfPair(p) === 'SUGGESTED').length,
    reconciled: pairs.filter((p) => statusOfPair(p) === 'RECONCILED').length,
    ignored:    pairs.filter((p) => statusOfPair(p) === 'IGNORED').length,
  };

  return (
    <div className="flex h-full flex-col space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/conciliacao/lotes')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Conciliação Extrato</h1>
            {batch && (
              <p className="text-sm text-muted-foreground">
                {batch.connection?.bankName || batch.source} — {counters.reconciled} conciliados ·{' '}
                {counters.suggested} sugeridos · {counters.pending - counters.suggested} pendentes · {counters.ignored} ignorados
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todas</option>
            <option value="PENDING">Pendentes</option>
            <option value="SUGGESTED">Sugeridas</option>
            <option value="RECONCILED">Conciliadas</option>
            <option value="IGNORED">Ignoradas</option>
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 w-48 pl-8" placeholder="Pesquisar" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Cabeçalho das colunas */}
      <div className="grid grid-cols-2 gap-6">
        <h2 className="text-center text-lg font-medium text-muted-foreground">Extrato</h2>
        <h2 className="text-center text-lg font-medium text-muted-foreground">Movimentações não conciliadas</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto pb-20">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : pairs.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">Nenhuma transação neste filtro.</p>
        ) : (
          pairs.map((p) => {
            const tx = p.transaction;
            const rec = p.reconciliation;
            const isCredit = tx.type === 'credit';
            const borderCls = isCredit ? 'border-b-2 border-b-green-500' : 'border-b-2 border-b-red-500';
            const done = tx.status === 'RECONCILED';
            const ignored = tx.status === 'IGNORED';

            return (
              <div key={tx.id} className="grid grid-cols-2 items-start gap-6">
                {/* ── Coluna Extrato ── */}
                <div className={`relative rounded-md border bg-card p-3 shadow-sm ${borderCls} ${ignored ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium leading-tight">{tx.description}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {fmtDate(tx.date)} &nbsp;|&nbsp; {formatCurrency(tx.amount)}
                      </p>
                      {tx.payerName && <p className="text-xs text-muted-foreground">{tx.payerName}</p>}
                    </div>
                    {!done && !ignored && (
                      <Button
                        size="icon"
                        className="h-7 w-7 shrink-0 bg-green-600 hover:bg-green-700"
                        title="Criar lançamento a partir desta linha"
                        onClick={() => { setCreateTx(tx); setCreateDesc(tx.description); }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="absolute -right-6 top-1/2 hidden h-px w-6 border-t border-dashed border-muted-foreground/40 md:block" />
                </div>

                {/* ── Coluna Movimentações ── */}
                <div>
                  {ignored ? (
                    <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      <EyeOff className="h-4 w-4" /> Ignorada
                      <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => action({ action: 'unmatch', transactionId: tx.id }, 'Restaurada')}>
                        <RotateCcw className="mr-1 h-3 w-3" /> Restaurar
                      </Button>
                    </div>
                  ) : rec?.internal ? (
                    <div className={`relative rounded-md border bg-card p-3 shadow-sm ${borderCls}`}>
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            done ? 'bg-green-600 text-white' : 'border-2 border-green-600 text-green-600'
                          }`}
                          title={done ? 'Conciliado' : `Sugestão (score ${Math.round(rec.matchScore || 0)})`}
                        >
                          <Check className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold uppercase">{rec.internal.label}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {fmtDate(rec.internal.date)} &nbsp;|&nbsp; {formatCurrency(rec.internal.amount)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {!done && (
                            <Button
                              size="sm"
                              className="h-7 bg-green-600 hover:bg-green-700"
                              onClick={() =>
                                action(
                                  { action: 'match', transactionId: tx.id, internalType: rec.internal.kind, internalId: rec.internal.id },
                                  'Conciliado',
                                )
                              }
                            >
                              <Check className="mr-1 h-3 w-3" /> Aceitar
                            </Button>
                          )}
                          {!done && (
                            <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={() => action({ action: 'unmatch', transactionId: tx.id }, 'Sugestão removida')}>
                              <X className="mr-1 h-3 w-3" /> Remover
                            </Button>
                          )}
                          {done && (
                            <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={() => action({ action: 'unmatch', transactionId: tx.id }, 'Conciliação desfeita')}>
                              <RotateCcw className="mr-1 h-3 w-3" /> Desfazer
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-9" onClick={() => { setLinkTx(tx); setLinkQuery(''); }}>
                        <Link2 className="mr-1 h-4 w-4" /> Vincular
                      </Button>
                      <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => action({ action: 'ignore', transactionId: tx.id }, 'Linha ignorada')}>
                        <EyeOff className="mr-1 h-4 w-4" /> Ignorar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Rodapé fixo */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-between border-t bg-background px-4 py-3 md:-mx-6 md:px-6">
        <Button variant="outline" onClick={() => router.push('/conciliacao/lotes')}>Voltar</Button>
        <Button className="bg-green-600 px-8 hover:bg-green-700" disabled={confirming || counters.suggested === 0} onClick={confirmBatch}>
          {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Conciliar {counters.suggested > 0 ? `(${counters.suggested})` : ''}
        </Button>
      </div>

      {/* ── Modal Vincular ── */}
      <Dialog open={!!linkTx} onOpenChange={(o) => !o && setLinkTx(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular lançamento</DialogTitle>
          </DialogHeader>
          {linkTx && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted p-2 text-sm">
                {linkTx.description} — {fmtDate(linkTx.date)} | {formatCurrency(linkTx.amount)}
              </div>
              <Input placeholder="Buscar por descrição…" value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} autoFocus />
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {linkLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : linkCandidates.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lançamento encontrado.</p>
                ) : (
                  linkCandidates.map((c) => (
                    <button
                      key={`${c.kind}_${c.id}`}
                      className="flex w-full items-center justify-between rounded-md border p-2 text-left text-sm hover:bg-muted"
                      onClick={async () => {
                        const ok = await action({ action: 'match', transactionId: linkTx.id, internalType: c.internalType, internalId: c.id }, 'Vinculado e conciliado');
                        if (ok) setLinkTx(null);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.label}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(c.date)} · {c.kind}</span>
                      </span>
                      <span className="ml-2 shrink-0 font-medium">{formatCurrency(c.amount)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal Criar lançamento (botão "+") ── */}
      <Dialog open={!!createTx} onOpenChange={(o) => !o && setCreateTx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar lançamento a partir do extrato</DialogTitle>
          </DialogHeader>
          {createTx && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted p-2 text-sm">
                {createTx.type === 'credit' ? 'Receita' : 'Despesa'} · {fmtDate(createTx.date)} · {formatCurrency(createTx.amount)}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Descrição</label>
                <Input value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                O lançamento será criado já quitado e conciliado com esta linha do extrato.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateTx(null)}>Cancelar</Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={async () => {
                    const ok = await action(
                      { action: 'create-entry', transactionId: createTx.id, payload: { description: createDesc } },
                      'Lançamento criado e conciliado',
                    );
                    if (ok) setCreateTx(null);
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> Criar e conciliar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
