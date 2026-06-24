'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { Shield, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-500/20 text-green-400',
  UPDATE: 'bg-blue-500/20 text-blue-400',
  DELETE: 'bg-red-500/20 text-red-400',
  LOGIN: 'bg-slate-500/20 text-foreground',
  LOGOUT: 'bg-slate-500/20 text-muted-foreground',
  LOGIN_FAILED: 'bg-red-500/20 text-red-400',
  EXPORT: 'bg-purple-500/20 text-purple-400',
  IMPORT: 'bg-yellow-500/20 text-yellow-400',
  APPROVE: 'bg-green-500/20 text-green-400',
  REJECT: 'bg-red-500/20 text-red-400',
  SEND: 'bg-blue-500/20 text-blue-400',
  CANCEL: 'bg-orange-500/20 text-orange-400',
  PAY: 'bg-emerald-500/20 text-emerald-400',
};

const ENTITY_LABELS: Record<string, string> = {
  payable: 'Conta a Pagar',
  receivable: 'Conta a Receber',
  nfe: 'NF-e',
  boleto: 'Boleto',
  pix: 'PIX',
  bank: 'Banco',
  user: 'Usuário',
  company: 'Empresa',
  category: 'Categoria',
  product: 'Produto',
  stock: 'Estoque',
  client: 'Cliente',
  expense: 'Despesa',
  income: 'Receita',
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: '50' });
    if (filterEntity) params.set('entity', filterEntity);
    if (filterAction) params.set('action', filterAction);
    if (filterStartDate) params.set('startDate', filterStartDate);
    if (filterEndDate) params.set('endDate', filterEndDate);
    const r = await apiFetch(`/api/pj/audit-log?${params}`);
    const data = await r.json();
    setEntries(data.logs ?? []);
    setTotal(data.total ?? 0);
    setPage(data.page ?? 1);
    setPages(data.pages ?? 1);
    setLoading(false);
  }, [filterEntity, filterAction, filterStartDate, filterEndDate]);

  useEffect(() => { load(1); }, [load]);

  const clearFilters = () => {
    setFilterEntity('');
    setFilterAction('');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  const hasFilters = filterEntity || filterAction || filterStartDate || filterEndDate;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center">
          <Shield className="w-5 h-5 text-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Log de Auditoria</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Histórico completo de ações realizadas na empresa</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Entidade</label>
            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {Object.entries(ENTITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Ação</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {['CREATE','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT','IMPORT','APPROVE','REJECT','SEND','CANCEL','PAY'].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Data início</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Data fim</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" /> Limpar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-muted-foreground text-sm">{total.toLocaleString('pt-BR')} registros</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(page - 1)}
              disabled={page <= 1 || loading}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-muted-foreground text-xs">{page} / {pages}</span>
            <button
              onClick={() => load(page + 1)}
              disabled={page >= pages || loading}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-muted-foreground">Nenhum registro encontrado</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((e) => (
              <div key={e.id}>
                <div
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                >
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${ACTION_COLORS[e.action] ?? 'bg-muted text-foreground'}`}>
                    {e.action}
                  </span>
                  <span className="text-foreground text-sm flex-shrink-0 w-32">
                    {ENTITY_LABELS[e.entity] ?? e.entity}
                  </span>
                  {e.entityId && (
                    <span className="text-muted-foreground text-xs font-mono truncate hidden md:block w-40">
                      {e.entityId.slice(0, 16)}…
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs ml-auto flex-shrink-0">
                    {new Date(e.createdAt).toLocaleString('pt-BR')}
                  </span>
                  {e.ipAddress && (
                    <span className="text-muted-foreground text-xs hidden lg:block flex-shrink-0">
                      {e.ipAddress}
                    </span>
                  )}
                </div>

                {expanded === e.id && (
                  <div className="px-4 pb-4 bg-muted/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                      {e.oldData && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 font-medium">Dados anteriores</p>
                          <pre className="text-xs text-foreground bg-muted rounded-lg p-3 overflow-auto max-h-40 border border-border">
                            {JSON.stringify(e.oldData, null, 2)}
                          </pre>
                        </div>
                      )}
                      {e.newData && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 font-medium">Dados novos</p>
                          <pre className="text-xs text-foreground bg-muted rounded-lg p-3 overflow-auto max-h-40 border border-border">
                            {JSON.stringify(e.newData, null, 2)}
                          </pre>
                        </div>
                      )}
                      {!e.oldData && !e.newData && (
                        <p className="text-muted-foreground text-xs italic">Sem dados de detalhe registrados.</p>
                      )}
                    </div>
                    {e.userAgent && (
                      <p className="text-xs text-slate-600 mt-2 truncate">UA: {e.userAgent}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
