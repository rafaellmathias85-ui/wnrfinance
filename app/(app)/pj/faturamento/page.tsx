'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePJ } from '@/lib/pj-context';
import { apiFetch } from '@/lib/fetch';
import { useFormatCurrency } from '@/hooks/use-format-currency';
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle,
  BarChart3, PieChart as PieIcon, Users, Building2, Loader2,
  Eye, History, FileText, FileCheck, FileX, Mail, Banknote,
  Search, X, ChevronLeft, ChevronRight, ExternalLink, Calendar,
  Receipt, AlertCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, ComposedChart, Line,
} from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

const STATUS_COLORS: Record<string, string> = {
  pago: 'bg-emerald-100 text-emerald-700',
  recebido: 'bg-emerald-100 text-emerald-700',
  pendente: 'bg-amber-100 text-amber-700',
  vencido: 'bg-red-100 text-red-700',
  cancelado: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  pago: 'Pago', recebido: 'Recebido', pendente: 'Pendente', vencido: 'Vencido', cancelado: 'Cancelado',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Avulso', contract: 'Recorrente', sale: 'Venda', invoice: 'Fatura',
};

const NFE_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', enviada: 'Enviada', autorizada: 'Autorizada',
  cancelada: 'Cancelada', rejeitada: 'Rejeitada',
};

function fmtDate(v?: string | Date | null) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('pt-BR');
}

function fmtDateTime(v?: string | Date | null) {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── NFe Status Icon ──────────────────────────────────────────────────────────

function NFeIcon({ nfe, pdfUrl }: { nfe: any; pdfUrl?: string }) {
  if (!nfe) return <FileText className="h-4 w-4 text-muted-foreground/40" />;
  if (nfe.status === 'autorizada') {
    const el = <FileCheck className="h-4 w-4 text-emerald-500" />;
    if (pdfUrl) return <a href={pdfUrl} target="_blank" rel="noopener noreferrer" title="Ver NF-e (PDF)">{el}</a>;
    return <span title="NF-e Autorizada">{el}</span>;
  }
  if (nfe.status === 'rejeitada' || nfe.status === 'cancelada') {
    return <span title={`NF-e ${nfe.status}`}><FileX className="h-4 w-4 text-red-500" /></span>;
  }
  return <span title={`NF-e: ${NFE_STATUS_LABEL[nfe.status] || nfe.status}`}><FileText className="h-4 w-4 text-amber-500" /></span>;
}

// ─── Timeline Entry ───────────────────────────────────────────────────────────

function TimelineEntry({ entry }: { entry: any }) {
  return (
    <div className="flex gap-3 py-3 border-b last:border-0">
      <div className="flex-shrink-0 mt-0.5">
        {entry.type === 'email'
          ? <Mail className="h-4 w-4 text-blue-500" />
          : <History className="h-4 w-4 text-purple-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{fmtDateTime(entry.date)}</span>
          <Badge variant="outline" className={`text-xs px-1.5 py-0 ${entry.type === 'email' ? 'border-blue-300 text-blue-600' : 'border-purple-300 text-purple-600'}`}>
            {entry.type === 'email' ? 'E-mail' : 'Auditoria'}
          </Badge>
          <span className="text-xs font-medium">{entry.user}</span>
        </div>
        <p className="text-sm text-foreground mt-0.5 truncate">{entry.description}</p>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ id, open, onClose }: { id: string | null; open: boolean; onClose: () => void }) {
  const fmt = useFormatCurrency();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('dados');

  useEffect(() => {
    if (!id || !open) { setData(null); return; }
    setLoading(true);
    apiFetch(`/api/pj/faturamento/lista/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, open]);

  const item = data?.item;
  const nfes: any[] = data?.nfes || [];
  const boletos: any[] = data?.boletos || [];
  const timeline: any[] = data?.timeline || [];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            {item ? `${item.customerName || 'Sem cliente'} — ${fmt(item.amount)}` : 'Carregando...'}
          </DialogTitle>
        </DialogHeader>

        {loading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}

        {!loading && item && (
          <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="dados">Dados Básicos</TabsTrigger>
              <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
              <TabsTrigger value="historico">Histórico {timeline.length > 0 && <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 text-xs">{timeline.length}</span>}</TabsTrigger>
            </TabsList>

            {/* ── Dados Básicos ── */}
            <TabsContent value="dados" className="flex-1 overflow-y-auto mt-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Cliente</p>
                  <p className="font-medium">{item.customerName || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">CNPJ / CPF</p>
                  <p className="font-medium">{item.customerDoc || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">E-mail</p>
                  <p className="font-medium">{item.customerEmail || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Valor</p>
                  <p className="font-semibold text-primary">{fmt(item.amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Vencimento</p>
                  <p className="font-medium">{fmtDate(item.dueDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Competência</p>
                  <p className="font-medium">{item.billingPeriod || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Situação</p>
                  <Badge className={`${STATUS_COLORS[item.status] || 'bg-gray-100'} text-xs`}>{STATUS_LABELS[item.status] || item.status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Tipo</p>
                  <p className="font-medium">{SOURCE_LABELS[item.sourceType] || 'Avulso'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Categoria</p>
                  <p className="font-medium">{item.category?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Centro de Custo</p>
                  <p className="font-medium">{item.costCenter?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Recebido em</p>
                  <p className="font-medium">{item.receivedAt ? fmtDate(item.receivedAt) : '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Criado em</p>
                  <p className="font-medium">{fmtDate(item.createdAt)}</p>
                </div>
                {item.notes && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs mb-0.5">Observações</p>
                    <p className="font-medium whitespace-pre-wrap">{item.notes}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs mb-0.5">Descrição</p>
                  <p className="font-medium">{item.description}</p>
                </div>
              </div>
            </TabsContent>

            {/* ── Faturamento ── */}
            <TabsContent value="faturamento" className="flex-1 overflow-y-auto mt-4 space-y-4">
              {/* Status bar */}
              <div className="flex gap-2 flex-wrap">
                <div className={`px-3 py-1.5 rounded text-sm font-medium ${item.status === 'recebido' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                  {item.status === 'recebido' ? `Recebido em ${fmtDate(item.receivedAt)}` : 'Pendente de recebimento'}
                </div>
              </div>

              {/* NF-e section */}
              <div>
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> NFS-e / NF-e</h4>
                {nfes.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
                    Nenhuma nota fiscal emitida para este lançamento.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {nfes.map(n => (
                      <div key={n.id} className="rounded-lg border p-3 flex items-start gap-3">
                        <FileText className={`h-8 w-8 mt-0.5 ${n.status === 'autorizada' ? 'text-emerald-500' : n.status === 'rejeitada' || n.status === 'cancelada' ? 'text-red-400' : 'text-amber-400'}`} />
                        <div className="flex-1 text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{n.type?.toUpperCase()} {n.number ? `#${n.number}` : ''}</span>
                            <Badge className={`text-xs ${n.status === 'autorizada' ? 'bg-emerald-100 text-emerald-700' : n.status === 'rejeitada' || n.status === 'cancelada' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              {NFE_STATUS_LABEL[n.status] || n.status}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground text-xs mt-0.5">Emissão: {fmtDate(n.issuedAt)}</p>
                          {n.errorMessage && <p className="text-red-500 text-xs mt-0.5">{n.errorMessage}</p>}
                          <div className="flex gap-3 mt-1.5">
                            {n.pdfUrl && <a href={n.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />PDF</a>}
                            {n.xmlUrl && <a href={n.xmlUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />XML</a>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Boleto/PIX section */}
              <div>
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><Banknote className="h-4 w-4" /> Boleto / PIX</h4>
                {boletos.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
                    Nenhum boleto ou PIX gerado para este lançamento.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {boletos.map(b => (
                      <div key={b.id} className="rounded-lg border p-3 flex items-start gap-3">
                        <Banknote className={`h-8 w-8 mt-0.5 ${b.status === 'pago' ? 'text-emerald-500' : 'text-blue-400'}`} />
                        <div className="flex-1 text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{b.type === 'pix' ? 'PIX' : 'Boleto'}</span>
                            <Badge className={`text-xs ${b.status === 'pago' ? 'bg-emerald-100 text-emerald-700' : b.status === 'cancelado' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'}`}>
                              {STATUS_LABELS[b.status] || b.status}
                            </Badge>
                          </div>
                          {b.paidAt && <p className="text-muted-foreground text-xs mt-0.5">Pago em: {fmtDate(b.paidAt)}</p>}
                          <div className="flex gap-3 mt-1.5">
                            {b.boletoUrl && <a href={b.boletoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />Ver Boleto</a>}
                            {b.pixQrCodeUrl && <a href={b.pixQrCodeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />QR Code PIX</a>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Histórico ── */}
            <TabsContent value="historico" className="flex-1 overflow-y-auto mt-4">
              {timeline.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Nenhum evento registrado.</div>
              ) : (
                <div className="divide-y">
                  {timeline.map(entry => <TimelineEntry key={entry.id} entry={entry} />)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── History Modal ─────────────────────────────────────────────────────────────

function HistoryModal({ id, customerName, open, onClose }: { id: string | null; customerName: string; open: boolean; onClose: () => void }) {
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id || !open) { setTimeline([]); return; }
    setLoading(true);
    apiFetch(`/api/pj/faturamento/lista/${id}`)
      .then(r => r.json())
      .then(d => { setTimeline(d.timeline || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, open]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Histórico — {customerName}
          </DialogTitle>
        </DialogHeader>
        {loading
          ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          : timeline.length === 0
            ? <p className="text-center py-8 text-muted-foreground text-sm">Nenhum evento registrado.</p>
            : <div className="overflow-y-auto flex-1 divide-y">{timeline.map(e => <TimelineEntry key={e.id} entry={e} />)}</div>
        }
      </DialogContent>
    </Dialog>
  );
}

// ─── Lista de Faturamentos ────────────────────────────────────────────────────

function FaturamentoLista({ companyName }: { companyName?: string }) {
  const fmt = useFormatCurrency();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ search: '', status: '', sourceType: '', from: '', to: '' });

  // Modals
  const [detailId, setDetailId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyName, setHistoryName] = useState('');

  const fetchData = useCallback((p: number, f: typeof appliedFilters) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '20' });
    if (f.status) params.set('status', f.status);
    if (f.sourceType) params.set('sourceType', f.sourceType);
    if (f.search) params.set('search', f.search);
    if (f.from) params.set('from', f.from);
    if (f.to) params.set('to', f.to);
    apiFetch(`/api/pj/faturamento/lista?${params}`)
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 1); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(page, appliedFilters); }, [page, appliedFilters, fetchData]);

  function applyFilters() {
    const f = { search, status, sourceType, from, to };
    setAppliedFilters(f);
    setPage(1);
  }

  function clearFilters() {
    setSearch(''); setStatus(''); setSourceType(''); setFrom(''); setTo('');
    setAppliedFilters({ search: '', status: '', sourceType: '', from: '', to: '' });
    setPage(1);
  }

  const isOverdue = (item: any) => item.status === 'pendente' && new Date(item.dueDate) < new Date();

  const avatarLetter = companyName ? companyName[0].toUpperCase() : 'W';

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <p className="text-xs text-muted-foreground mb-1">Pesquisar</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && applyFilters()}
                  placeholder="Nome, descrição..."
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            <div className="w-[140px]">
              <p className="text-xs text-muted-foreground mb-1">Situação</p>
              <Select value={status || '_all'} onValueChange={v => setStatus(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="recebido">Recebido</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-[140px]">
              <p className="text-xs text-muted-foreground mb-1">Tipo</p>
              <Select value={sourceType || '_all'} onValueChange={v => setSourceType(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  <SelectItem value="manual">Avulso</SelectItem>
                  <SelectItem value="contract">Recorrente</SelectItem>
                  <SelectItem value="sale">Venda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-[130px]">
              <p className="text-xs text-muted-foreground mb-1">Venc. de</p>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 text-sm" />
            </div>

            <div className="w-[130px]">
              <p className="text-xs text-muted-foreground mb-1">Venc. até</p>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 text-sm" />
            </div>

            <div className="flex gap-1.5">
              <Button size="sm" onClick={applyFilters} className="h-9">
                <Search className="h-3.5 w-3.5 mr-1.5" />Buscar
              </Button>
              <Button size="sm" variant="ghost" onClick={clearFilters} className="h-9 px-2">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="ml-auto text-sm text-muted-foreground self-end pb-0.5">
              {total} registro{total !== 1 ? 's' : ''}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground w-8"></th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Cliente</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Faturamento</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Vencimento</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Tipo</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Situação</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Valor (R$)</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>Nenhum faturamento encontrado.</p>
                  </td>
                </tr>
              )}
              {!loading && items.map(item => (
                <tr key={item.id} className="border-b hover:bg-muted/20 transition-colors">
                  {/* Avatar */}
                  <td className="px-3 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {avatarLetter}
                    </div>
                  </td>

                  {/* Cliente */}
                  <td className="px-3 py-2.5 max-w-[220px]">
                    <p className="font-medium truncate">{item.customerName || '—'}</p>
                    {item.customerDoc && (
                      <p className="text-xs text-muted-foreground truncate">{item.customerDoc}</p>
                    )}
                  </td>

                  {/* Faturamento date */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground text-xs">
                    {fmtDate(item.createdAt)}
                  </td>

                  {/* Vencimento */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`text-xs font-medium ${isOverdue(item) ? 'text-red-500' : 'text-foreground'}`}>
                      {fmtDate(item.dueDate)}
                    </span>
                  </td>

                  {/* Tipo */}
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-xs whitespace-nowrap">
                      {SOURCE_LABELS[item.sourceType] || 'Avulso'}
                    </Badge>
                  </td>

                  {/* Situação */}
                  <td className="px-3 py-2.5">
                    <Badge className={`${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-500'} text-xs whitespace-nowrap`}>
                      {STATUS_LABELS[item.status] || item.status}
                    </Badge>
                  </td>

                  {/* Valor */}
                  <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                    {fmt(item.amount)}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      {/* View */}
                      <button
                        onClick={() => setDetailId(item.id)}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                      </button>

                      {/* History */}
                      <button
                        onClick={() => { setHistoryId(item.id); setHistoryName(item.customerName || ''); }}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Histórico"
                      >
                        <History className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                      </button>

                      {/* NF-e */}
                      <span className="p-1">
                        <NFeIcon nfe={item.nfe} pdfUrl={item.nfe?.pdfUrl} />
                      </span>

                      {/* Email */}
                      <span className="p-1" title={item.emailSent ? 'E-mail enviado' : 'Nenhum e-mail enviado'}>
                        <Mail className={`h-4 w-4 ${item.emailSent ? 'text-emerald-500' : 'text-muted-foreground/40'}`} />
                      </span>

                      {/* Boleto/PIX */}
                      <span className="p-1" title={item.boleto ? `${item.boleto.type === 'pix' ? 'PIX' : 'Boleto'}: ${STATUS_LABELS[item.boleto.status] || item.boleto.status}` : 'Sem boleto'}>
                        {item.boleto ? (
                          item.boleto.boletoUrl || item.boleto.pixQrCodeUrl ? (
                            <a href={item.boleto.boletoUrl || item.boleto.pixQrCodeUrl} target="_blank" rel="noopener noreferrer">
                              <Banknote className={`h-4 w-4 ${item.boleto.status === 'pago' ? 'text-emerald-500' : 'text-blue-500'}`} />
                            </a>
                          ) : (
                            <Banknote className={`h-4 w-4 ${item.boleto.status === 'pago' ? 'text-emerald-500' : 'text-blue-500'}`} />
                          )
                        ) : (
                          <Banknote className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages} · {total} registros
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)} className="h-7 px-2 text-xs">Primeiro</Button>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-7 px-2">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-7 px-2">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="h-7 px-2 text-xs">Último</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modals */}
      <DetailModal id={detailId} open={!!detailId} onClose={() => setDetailId(null)} />
      <HistoryModal id={historyId} customerName={historyName} open={!!historyId} onClose={() => setHistoryId(null)} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FaturamentoPJPage() {
  const fmt = useFormatCurrency();
  const fmtShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
    return fmt(v);
  };
  const { activeCompanyId, companies } = usePJ();
  const activeCompany = companies.find(c => c.id === activeCompanyId);
  const [dashData, setDashData] = useState<any>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filterPeriod, setFilterPeriod] = useState<'year' | 'month' | 'week'>('year');
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [mainTab, setMainTab] = useState('lista');

  useEffect(() => {
    if (!activeCompanyId || mainTab !== 'dashboard') return;
    setDashLoading(true);
    let url = `/api/pj/faturamento?year=${year}`;
    if (filterPeriod === 'month') url += `&month=${filterMonth}`;
    if (filterPeriod === 'week') url += `&week=true`;
    apiFetch(url)
      .then(r => r.json())
      .then(d => { setDashData(d); setDashLoading(false); })
      .catch(() => setDashLoading(false));
  }, [activeCompanyId, year, filterPeriod, filterMonth, mainTab]);

  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => cur - i);
  }, []);

  if (!activeCompanyId) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Card className="p-8 text-center">
        <CardContent>
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Selecione uma empresa</p>
          <p className="text-sm text-muted-foreground">Escolha uma empresa no menu lateral para ver o faturamento.</p>
        </CardContent>
      </Card>
    </div>
  );

  const kpis = dashData?.kpis;
  const monthly = dashData?.monthlyData || [];
  const categories = dashData?.categories || { payable: [], receivable: [] };
  const topCustomers = dashData?.topCustomers || [];
  const topSuppliers = dashData?.topSuppliers || [];
  const recent = dashData?.recentTransactions || { payables: [], receivables: [] };
  const balance = (kpis?.totalReceivable || 0) - (kpis?.totalPayable || 0);
  const balancePositive = balance >= 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Faturamento</h1>
          <p className="text-muted-foreground text-sm">Visão completa de receitas, notas fiscais e cobranças</p>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="lista" className="flex items-center gap-1.5">
            <Receipt className="h-4 w-4" />Faturamentos
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />Dashboard
          </TabsTrigger>
        </TabsList>

        {/* ── Lista tab ── */}
        <TabsContent value="lista" className="mt-4">
          <FaturamentoLista companyName={(activeCompany as any)?.name} />
        </TabsContent>

        {/* ── Dashboard tab ── */}
        <TabsContent value="dashboard" className="mt-4 space-y-6">
          {/* Period controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border overflow-hidden text-sm">
              {(['year', 'month', 'week'] as const).map(p => (
                <button key={p} onClick={() => setFilterPeriod(p)}
                  className={`px-3 py-1.5 transition-colors ${filterPeriod === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                  {p === 'year' ? 'Ano' : p === 'month' ? 'Mês' : 'Semana'}
                </button>
              ))}
            </div>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            {filterPeriod === 'month' && (
              <Select value={String(filterMonth)} onValueChange={v => setFilterMonth(Number(v))}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{new Date(2000, i).toLocaleString('pt-BR', { month: 'long' })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {dashLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm opacity-90">Total Receitas</p>
                        <p className="text-2xl font-bold mt-1">{fmt(kpis?.totalReceivable || 0)}</p>
                        <p className="text-xs opacity-75 mt-1">Recebido: {fmt(kpis?.totalReceived || 0)}</p>
                      </div>
                      <ArrowUpCircle className="h-10 w-10 opacity-80" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-lg bg-gradient-to-br from-red-500 to-red-600 text-white">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm opacity-90">Total Despesas</p>
                        <p className="text-2xl font-bold mt-1">{fmt(kpis?.totalPayable || 0)}</p>
                        <p className="text-xs opacity-75 mt-1">Pago: {fmt(kpis?.totalPaid || 0)}</p>
                      </div>
                      <ArrowDownCircle className="h-10 w-10 opacity-80" />
                    </div>
                  </CardContent>
                </Card>
                <Card className={`border-0 shadow-lg text-white ${balancePositive ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-gradient-to-br from-orange-500 to-orange-600'}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm opacity-90">Saldo</p>
                        <p className="text-2xl font-bold mt-1">{fmt(balance)}</p>
                        <p className="text-xs opacity-75 mt-1">{balancePositive ? 'Positivo' : 'Negativo'}</p>
                      </div>
                      {balancePositive ? <TrendingUp className="h-10 w-10 opacity-80" /> : <TrendingDown className="h-10 w-10 opacity-80" />}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm opacity-90">Pendente</p>
                        <p className="text-2xl font-bold mt-1">{fmt((kpis?.pendingReceivable || 0) + (kpis?.pendingPayable || 0))}</p>
                        <p className="text-xs opacity-75 mt-1">A receber: {fmt(kpis?.pendingReceivable || 0)}</p>
                      </div>
                      <DollarSign className="h-10 w-10 opacity-80" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sub-tabs */}
              <Tabs defaultValue="visao-geral">
                <TabsList className="bg-muted/50">
                  <TabsTrigger value="visao-geral"><BarChart3 className="h-4 w-4 mr-2" />Visão Geral</TabsTrigger>
                  <TabsTrigger value="categorias"><PieIcon className="h-4 w-4 mr-2" />Categorias</TabsTrigger>
                  <TabsTrigger value="clientes-fornecedores"><Users className="h-4 w-4 mr-2" />Clientes / Fornecedores</TabsTrigger>
                  <TabsTrigger value="transacoes"><DollarSign className="h-4 w-4 mr-2" />Transações</TabsTrigger>
                </TabsList>

                <TabsContent value="visao-geral" className="space-y-6 mt-4">
                  <Card className="shadow-md">
                    <CardHeader><CardTitle className="text-lg">Receitas vs Despesas — {year}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-[380px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={monthly}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(v: number) => fmt(v)} />
                            <Legend />
                            <Bar dataKey="receivable" name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="payable" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            <Line dataKey="balance" name="Saldo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="categorias" className="space-y-6 mt-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="shadow-md">
                      <CardHeader><CardTitle className="text-lg text-emerald-600">Receitas por Categoria</CardTitle></CardHeader>
                      <CardContent>
                        {categories.receivable.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem dados</p> : (
                          <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={categories.receivable} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                  {categories.receivable.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v: number) => fmt(v)} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <Card className="shadow-md">
                      <CardHeader><CardTitle className="text-lg text-red-600">Despesas por Categoria</CardTitle></CardHeader>
                      <CardContent>
                        {categories.payable.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem dados</p> : (
                          <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={categories.payable} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                  {categories.payable.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v: number) => fmt(v)} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="clientes-fornecedores" className="space-y-6 mt-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="shadow-md">
                      <CardHeader><CardTitle className="text-lg">Top Clientes</CardTitle></CardHeader>
                      <CardContent>
                        {topCustomers.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem dados</p> : (
                          <div className="space-y-3">
                            {topCustomers.slice(0, 10).map((c: any, i: number) => (
                              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition">
                                <div className="flex items-center gap-3">
                                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">{i + 1}</span>
                                  <span className="font-medium text-sm">{c.name || 'Sem nome'}</span>
                                </div>
                                <span className="font-semibold text-emerald-600">{fmt(c.total)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <Card className="shadow-md">
                      <CardHeader><CardTitle className="text-lg">Top Fornecedores</CardTitle></CardHeader>
                      <CardContent>
                        {topSuppliers.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem dados</p> : (
                          <div className="space-y-3">
                            {topSuppliers.slice(0, 10).map((s: any, i: number) => (
                              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition">
                                <div className="flex items-center gap-3">
                                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700 text-sm font-bold">{i + 1}</span>
                                  <span className="font-medium text-sm">{s.name || 'Sem nome'}</span>
                                </div>
                                <span className="font-semibold text-red-600">{fmt(s.total)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="transacoes" className="space-y-6 mt-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="shadow-md">
                      <CardHeader><CardTitle className="text-lg text-emerald-600">Últimas Receitas</CardTitle></CardHeader>
                      <CardContent>
                        {recent.receivables.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem receitas recentes</p> : (
                          <div className="space-y-2">
                            {recent.receivables.map((r: any, i: number) => (
                              <div key={i} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{r.description}</p>
                                  <p className="text-xs text-muted-foreground">{new Date(r.dueDate).toLocaleDateString('pt-BR')} · {r.category}</p>
                                </div>
                                <div className="flex items-center gap-2 ml-3">
                                  <Badge className={`${STATUS_COLORS[r.status] || 'bg-gray-100'} text-xs`}>{STATUS_LABELS[r.status] || r.status}</Badge>
                                  <span className="font-semibold text-sm whitespace-nowrap">{fmt(r.amount)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <Card className="shadow-md">
                      <CardHeader><CardTitle className="text-lg text-red-600">Últimas Despesas</CardTitle></CardHeader>
                      <CardContent>
                        {recent.payables.length === 0 ? <p className="text-muted-foreground text-center py-8">Sem despesas recentes</p> : (
                          <div className="space-y-2">
                            {recent.payables.map((p: any, i: number) => (
                              <div key={i} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{p.description}</p>
                                  <p className="text-xs text-muted-foreground">{new Date(p.dueDate).toLocaleDateString('pt-BR')} · {p.category}</p>
                                </div>
                                <div className="flex items-center gap-2 ml-3">
                                  <Badge className={`${STATUS_COLORS[p.status] || 'bg-gray-100'} text-xs`}>{STATUS_LABELS[p.status] || p.status}</Badge>
                                  <span className="font-semibold text-sm whitespace-nowrap">{fmt(p.amount)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
