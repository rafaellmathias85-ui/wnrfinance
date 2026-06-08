'use client';
import { apiFetch } from '@/lib/fetch';
import { formatDate, toInputDate } from '@/lib/format';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFormatCurrency } from '@/hooks/use-format-currency';

import {
  AlertTriangle, Briefcase, Phone, Mail, User as UserIcon, Calendar, TrendingDown,
  CheckCircle2, XCircle, Handshake, FileText, Loader2, History, Clock, DollarSign, X,
} from 'lucide-react';

interface Receivable {
  id: string;
  description: string;
  amount: number;
  amountReceived?: number;
  dueDate: string;
  status: string;
  notes?: string | null;
}

interface CustomerGroup {
  customerName: string;
  receivables: Receivable[];
  totalOverdue: number;
  oldestDueDate: string | null;
  negotiationCount: number;
  lostCount: number;
  notNegotiatedCount: number;
  nextContact: string | null;
}

interface Negotiation {
  id: string;
  customerName: string;
  originalAmount: number;
  newAmount: number;
  newDueDate: string;
  installments: number;
  status: string;
  notes: string | null;
  nextContact: string | null;
  createdAt: string;
  receivable?: { id: string; description: string } | null;
}

const NEGOTIATION_STATUS = [
  { id: 'negociado', label: 'Negociado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { id: 'pago', label: 'Pago', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { id: 'cancelado', label: 'Cancelado', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { id: 'perdido', label: 'Perdido', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
];

export default function InadimplenciaPage() {
  const formatCurrency = useFormatCurrency();
  const { activeEnv, activeCompanyId, companies } = usePJ();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ customers: CustomerGroup[]; summary: any } | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerGroup | null>(null);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [showNegotiate, setShowNegotiate] = useState(false);
  const [negotiateTarget, setNegotiateTarget] = useState<{ customer: CustomerGroup; receivable?: Receivable } | null>(null);

  const fetchData = useCallback(() => {
    if (!activeCompanyId) { setLoading(false); return; }
    setLoading(true);
    apiFetch('/api/pj/defaults')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeCompanyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCustomerDetails = async (customer: CustomerGroup) => {
    setSelectedCustomer(customer);
    const res = await apiFetch(`/api/pj/negotiations?customer=${encodeURIComponent(customer.customerName)}`);
    const ngs = await res.json();
    setNegotiations(Array.isArray(ngs) ? ngs : []);
  };

  const closeCustomerDetails = () => {
    setSelectedCustomer(null);
    setNegotiations([]);
  };

  const openNegotiate = (customer: CustomerGroup, receivable?: Receivable) => {
    setNegotiateTarget({ customer, receivable });
    setShowNegotiate(true);
  };

  if (activeEnv !== 'pj' || !activeCompanyId) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center space-y-3">
        <Briefcase className="w-12 h-12 text-muted-foreground mx-auto" />
        <h2 className="text-xl font-bold text-foreground">Selecione uma empresa</h2>
        <p className="text-muted-foreground">Ative o modo Pessoa Jurídica e selecione uma empresa para acessar a Inadimplência.</p>
      </div>
    );
  }

  const customers = data?.customers || [];
  const filtered = customers.filter(c => !search.trim() || c.customerName.toLowerCase().includes(search.toLowerCase()));
  const summary = data?.summary || { total: 0, count: 0, receivablesCount: 0 };
  const activeCompany = companies.find(c => c.id === activeCompanyId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 text-xs font-semibold">
              <Briefcase className="w-3 h-3" /> PJ
            </span>
            {activeCompany && (
              <span className="text-xs text-muted-foreground">• {activeCompany.name}</span>
            )}
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-7 h-7 text-amber-500" /> Inadimplência
          </h1>
          <p className="text-muted-foreground mt-1">Clientes com títulos vencidos, ações de cobrança e negociações.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total em atraso</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(summary.total || 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Clientes inadimplentes</p>
          <p className="text-2xl font-bold text-foreground mt-1">{summary.count || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Títulos em atraso</p>
          <p className="text-2xl font-bold text-foreground mt-1">{summary.receivablesCount || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Ticket médio</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(summary.count ? (summary.total / summary.count) : 0)}</p>
        </CardContent></Card>
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"><CardContent className="p-4">
          <p className="text-xs text-red-700 dark:text-red-300">Valor total em cobrança</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{formatCurrency(summary.total || 0)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-lg text-foreground">Clientes em Atraso</CardTitle>
            <Input
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="font-semibold text-foreground">Nenhum cliente inadimplente</h3>
              <p className="text-sm text-muted-foreground mt-1">Todas as contas a receber estão em dia. Parabéns!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Próx. Contato</th>
                    <th className="px-4 py-3 font-semibold">Vencimento + antigo</th>
                    <th className="px-4 py-3 font-semibold text-center">Negoc.</th>
                    <th className="px-4 py-3 font-semibold text-center">Perdido</th>
                    <th className="px-4 py-3 font-semibold text-center">Não Negoc.</th>
                    <th className="px-4 py-3 font-semibold text-right">Valor (R$)</th>
                    <th className="px-4 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const daysOverdue = c.oldestDueDate ? Math.floor((Date.now() - new Date(c.oldestDueDate).getTime()) / 86400000) : 0;
                    return (
                      <tr key={c.customerName} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <button
                            className="text-left font-medium text-foreground hover:text-blue-600 dark:hover:text-blue-400"
                            onClick={() => openCustomerDetails(c)}
                          >
                            {c.customerName}
                          </button>
                          <p className="text-xs text-muted-foreground">{c.receivables.length} {c.receivables.length === 1 ? 'título' : 'títulos'} em atraso</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{c.nextContact ? formatDate(c.nextContact) : 'Sem data'}</td>
                        <td className="px-4 py-3">
                          <div className="text-foreground">{c.oldestDueDate ? formatDate(c.oldestDueDate) : '—'}</div>
                          <div className="text-xs text-red-500">{daysOverdue} {daysOverdue === 1 ? 'dia' : 'dias'} em atraso</div>
                        </td>
                        <td className="px-4 py-3 text-center text-foreground">{c.negotiationCount}</td>
                        <td className="px-4 py-3 text-center text-foreground">{c.lostCount}</td>
                        <td className="px-4 py-3 text-center text-foreground">{c.notNegotiatedCount}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">{formatCurrency(c.totalOverdue)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" onClick={() => openNegotiate(c)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Handshake className="w-3.5 h-3.5 mr-1.5" />Negociar</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer Details Drawer */}
      <AnimatePresence>
        {selectedCustomer && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeCustomerDetails}
          >
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30 }}
              className="absolute right-0 top-0 h-full w-full max-w-3xl bg-background shadow-2xl overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Cliente: {selectedCustomer.customerName}</h2>
                  <p className="text-sm text-muted-foreground">Detalhes de inadimplência e histórico de negociações</p>
                </div>
                <Button variant="ghost" size="sm" onClick={closeCustomerDetails}><X className="w-5 h-5" /></Button>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">Total em atraso</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(selectedCustomer.totalOverdue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{selectedCustomer.receivables.length} {selectedCustomer.receivables.length === 1 ? 'título' : 'títulos'}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">Histórico</p>
                    <p className="text-lg font-semibold text-foreground">{selectedCustomer.negotiationCount} negociações</p>
                    <p className="text-xs text-muted-foreground mt-1">{selectedCustomer.lostCount} perdidas • {selectedCustomer.notNegotiatedCount} canceladas</p>
                  </CardContent></Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <FileText className="w-4 h-4" /> Títulos em Atraso
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {selectedCustomer.receivables.map((r) => {
                        const pending = r.amount - (r.amountReceived || 0);
                        const days = Math.floor((Date.now() - new Date(r.dueDate).getTime()) / 86400000);
                        return (
                          <div key={r.id} className="p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-foreground truncate">{r.description}</p>
                              <p className="text-xs text-muted-foreground">Vence {formatDate(r.dueDate)} • {days} dias em atraso</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(pending)}</p>
                              <Button size="sm" variant="outline" className="mt-1" onClick={() => openNegotiate(selectedCustomer, r)}>
                                <Handshake className="w-3 h-3 mr-1" /> Negociar
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <History className="w-4 h-4" /> Histórico de Negociações
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {negotiations.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">Ainda não há negociações registradas com esse cliente.</p>
                    ) : (
                      <div className="divide-y divide-border">
                        {negotiations.map((n) => {
                          const st = NEGOTIATION_STATUS.find(s => s.id === n.status) || NEGOTIATION_STATUS[0];
                          return (
                            <div key={n.id} className="p-3">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${st.color}`}>{st.label}</span>
                                  <span className="text-xs text-muted-foreground">{formatDate(n.createdAt)}</span>
                                </div>
                                <div className="text-sm font-semibold text-foreground">{formatCurrency(n.newAmount)}</div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Novo vencimento {formatDate(n.newDueDate)} • {n.installments}x
                                {n.receivable?.description ? ` • ${n.receivable.description}` : ''}
                              </p>
                              {n.notes && <p className="text-xs text-foreground mt-1 bg-muted/40 rounded p-2">{n.notes}</p>}
                              {n.status !== 'pago' && n.status !== 'cancelado' && (
                                <div className="flex gap-2 mt-2">
                                  <Button size="sm" variant="outline" className="text-xs" onClick={async () => {
                                    await apiFetch(`/api/pj/negotiations/${n.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'pago' }) });
                                    fetchData();
                                    openCustomerDetails(selectedCustomer);
                                  }}><CheckCircle2 className="w-3 h-3 mr-1" /> Marcar Pago</Button>
                                  <Button size="sm" variant="outline" className="text-xs" onClick={async () => {
                                    await apiFetch(`/api/pj/negotiations/${n.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'perdido' }) });
                                    fetchData();
                                    openCustomerDetails(selectedCustomer);
                                  }}><XCircle className="w-3 h-3 mr-1" /> Marcar Perdido</Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <NegotiateDialog
        open={showNegotiate}
        onClose={() => { setShowNegotiate(false); setNegotiateTarget(null); }}
        target={negotiateTarget}
        onSaved={() => {
          setShowNegotiate(false);
          setNegotiateTarget(null);
          fetchData();
          if (selectedCustomer) openCustomerDetails(selectedCustomer);
        }}
      />
    </div>
  );
}

function NegotiateDialog({
  open,
  onClose,
  target,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  target: { customer: CustomerGroup; receivable?: Receivable } | null;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    receivableId: '',
    customerName: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    originalAmount: 0,
    newAmount: 0,
    newDueDate: '',
    installments: 1,
    discount: 0,
    interestRate: 0,
    notes: '',
    nextContact: '',
  });

  useEffect(() => {
    if (!target) return;
    const receivable = target.receivable;
    const originalAmount = receivable ? (receivable.amount - (receivable.amountReceived || 0)) : target.customer.totalOverdue;
    setForm({
      receivableId: receivable?.id || '',
      customerName: target.customer.customerName,
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      originalAmount,
      newAmount: originalAmount,
      newDueDate: toInputDate(new Date(Date.now() + 15 * 86400000)),
      installments: 1,
      discount: 0,
      interestRate: 0,
      notes: '',
      nextContact: '',
    });
  }, [target]);

  const handleSave = async () => {
    if (!target) return;
    if (!form.newAmount || !form.newDueDate) {
      alert('Preencha o novo valor e a nova data de vencimento.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/pj/negotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivableId: form.receivableId || null,
          customerName: form.customerName,
          contactName: form.contactName,
          contactPhone: form.contactPhone,
          contactEmail: form.contactEmail,
          originalAmount: form.originalAmount,
          newAmount: form.newAmount,
          newDueDate: form.newDueDate,
          installments: form.installments,
          discount: form.discount,
          interestRate: form.interestRate,
          notes: form.notes,
          nextContact: form.nextContact || null,
          status: 'negociado',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Erro ao salvar');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (!target) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="w-5 h-5 text-emerald-600" /> Renegociar com {target.customer.customerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {target.receivable && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium text-foreground">{target.receivable.description}</p>
              <p className="text-xs text-muted-foreground">Vencimento original: {formatDate(target.receivable.dueDate)}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Valor original</label>
              <Input type="number" step="0.01" value={form.originalAmount} onChange={(e) => setForm({ ...form, originalAmount: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Novo valor *</label>
              <Input type="number" step="0.01" value={form.newAmount} onChange={(e) => setForm({ ...form, newAmount: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nova data de vencimento *</label>
              <Input type="date" value={form.newDueDate} onChange={(e) => setForm({ ...form, newDueDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Parcelas</label>
              <Input type="number" min={1} max={36} value={form.installments} onChange={(e) => setForm({ ...form, installments: parseInt(e.target.value) || 1 })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Desconto (R$)</label>
              <Input type="number" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Juros (% a.m.)</label>
              <Input type="number" step="0.01" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-border">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Contato</label>
              <Input placeholder="Nome do contato" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Telefone</label>
              <Input placeholder="(00) 00000-0000" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">E-mail</label>
              <Input type="email" placeholder="email@cliente.com" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Próximo contato</label>
              <Input type="date" value={form.nextContact} onChange={(e) => setForm({ ...form, nextContact: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Observações</label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              placeholder="Anotações sobre a renegociação..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <>Registrar Negociação</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
