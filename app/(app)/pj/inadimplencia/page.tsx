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
import { useToast } from '@/components/ui/use-toast';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

import {
  AlertTriangle,
  Briefcase,
  Phone,
  Mail,
  User as UserIcon,
  Calendar,
  CheckCircle2,
  XCircle,
  Handshake,
  FileText,
  Loader2,
  History,
  DollarSign,
  X,
  Star,
  ClipboardList,
  Users,
  MessageSquare,
  PhoneCall,
  Ban,
  Send,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
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
  clientId: string | null;
  clientRating: number | null;
  clientPhone: string | null;
  clientEmail: string | null;
  receivables: Receivable[];
  totalOverdue: number;
  oldestDueDate: string | null;
  lastPaymentDate: string | null;
  forecastDate: string | null;
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

// ─── Star Display ─────────────────────────────────────────────────────────────
function Stars({ value }: { value: number | null }) {
  if (!value) return <span className="text-slate-600 text-xs">—</span>;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`w-3 h-3 ${n <= value ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}`} />
      ))}
    </div>
  );
}

// ─── TipTap Email Editor ──────────────────────────────────────────────────────
function EmailEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className="border border-slate-600 rounded-lg overflow-hidden">
      <div className="flex gap-1 px-2 py-1.5 bg-slate-800 border-b border-slate-700">
        {[
          { label: 'B', action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive('bold') },
          { label: 'I', action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive('italic') },
          { label: 'U', action: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive('bulletList') },
        ].map((btn) => (
          <button
            key={btn.label}
            type="button"
            onClick={btn.action}
            className={`w-7 h-7 text-sm font-medium rounded transition-colors ${btn.active ? 'bg-blue-700 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-invert prose-sm max-w-none min-h-[120px] px-3 py-2 text-slate-200 bg-slate-900 focus:outline-none"
      />
    </div>
  );
}

// ─── Email Modal ──────────────────────────────────────────────────────────────
function EmailModal({
  open,
  onClose,
  customer,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerGroup | null;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !customer) return;
    setTo(customer.clientEmail || '');
    setSubject(`Cobrança — ${customer.customerName}`);
    setBody(`<p>Prezado(a) <strong>${customer.customerName}</strong>,</p><p>Identificamos que você possui débitos em atraso com nossa empresa. Por favor, entre em contato para regularizar a situação.</p><p>Valores em aberto: <strong>R$ ${customer.totalOverdue.toFixed(2).replace('.', ',')}</strong></p><p>Atenciosamente,</p>`);
  }, [open, customer]);

  const handleSend = async () => {
    if (!customer) return;
    if (!to.trim()) { toast({ title: 'Destinatário obrigatório', variant: 'destructive' }); return; }
    setSending(true);
    try {
      const id = customer.clientId || customer.customerName;
      const res = await apiFetch(`/api/pj/negotiations/${encodeURIComponent(id)}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: [to], cc: cc ? [cc] : [], subject, htmlBody: body }),
      });
      if (!res.ok) throw new Error('Erro ao enviar');
      toast({ title: 'Email agendado para envio' });
      onSent();
      onClose();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Send className="w-5 h-5 text-blue-400" /> Enviar Email de Cobrança
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Para *</label>
            <input className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@cliente.com" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">CC</label>
            <input className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="copia@email.com" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Assunto *</label>
            <input className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Corpo do email</label>
            <EmailEditor value={body} onChange={setBody} />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending} className="bg-blue-600 hover:bg-blue-500">
            {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</> : <><Send className="w-4 h-4 mr-2" />Enviar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Renegotiation Modal ──────────────────────────────────────────────────────
function RenegotiationModal({
  open,
  onClose,
  customer,
  receivable,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerGroup | null;
  receivable: Receivable | null;
  onSaved: () => void;
}) {
  const formatCurrency = useFormatCurrency();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    originalAmount: 0,
    penalty: 0,
    interest: 0,
    discount: 0,
    forecastDate: '',
    paymentMethod: '',
    nextContactAt: '',
    notes: '',
  });

  const totalAmount = form.originalAmount + form.penalty + form.interest - form.discount;

  useEffect(() => {
    if (!open || !customer) return;
    const base = receivable
      ? receivable.amount - (receivable.amountReceived || 0)
      : customer.totalOverdue;
    setForm({ originalAmount: base, penalty: 0, interest: 0, discount: 0, forecastDate: toInputDate(new Date(Date.now() + 15 * 86400000)), paymentMethod: '', nextContactAt: '', notes: '' });
  }, [open, customer, receivable]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!customer) return;
    const id = customer.clientId || customer.customerName;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/pj/negotiations/${encodeURIComponent(id)}/negotiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivableId: receivable?.id || null,
          penalty: form.penalty,
          interest: form.interest,
          discount: form.discount,
          totalAmount,
          paymentMethod: form.paymentMethod || null,
          forecastDate: form.forecastDate || null,
          nextContactAt: form.nextContactAt || null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error('Erro ao salvar');
      toast({ title: 'Renegociação registrada' });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Handshake className="w-5 h-5 text-emerald-400" /> Renegociar
            {customer && <span className="text-slate-400 font-normal text-sm">— {customer.customerName}</span>}
          </DialogTitle>
        </DialogHeader>

        {receivable && (
          <div className="bg-slate-800 rounded-lg p-3 text-sm">
            <p className="font-medium text-white">{receivable.description}</p>
            <p className="text-xs text-slate-400 mt-0.5">Vencimento: {formatDate(receivable.dueDate)}</p>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Valor Original</label>
              <input type="number" step="0.01" className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.originalAmount} onChange={(e) => set('originalAmount', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Multa (R$)</label>
              <input type="number" step="0.01" min="0" className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.penalty} onChange={(e) => set('penalty', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Juros (R$)</label>
              <input type="number" step="0.01" min="0" className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.interest} onChange={(e) => set('interest', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Desconto (R$)</label>
              <input type="number" step="0.01" min="0" className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.discount} onChange={(e) => set('discount', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          {/* Real-time total */}
          <div className={`flex items-center justify-between rounded-lg px-4 py-3 ${totalAmount >= 0 ? 'bg-emerald-900/20 border border-emerald-700/40' : 'bg-red-900/20 border border-red-700/40'}`}>
            <span className="text-sm text-slate-300">Total Renegociado</span>
            <span className={`text-xl font-bold ${totalAmount >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {formatCurrency(totalAmount)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Forma de pagamento</label>
              <select className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
                <option value="">Selecionar...</option>
                <option value="boleto">Boleto</option>
                <option value="pix">PIX</option>
                <option value="deposito">Depósito</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Previsão de pagamento</label>
              <input type="date" className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.forecastDate} onChange={(e) => set('forecastDate', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Próximo contato</label>
              <input type="datetime-local" className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.nextContactAt} onChange={(e) => set('nextContactAt', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Observações</label>
            <textarea
              rows={3}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 3-Column Negotiation Modal ───────────────────────────────────────────────
function NegotiationModal({
  customer,
  negotiations,
  onClose,
  onRefresh,
  onOpenRenegotiate,
  onOpenEmail,
}: {
  customer: CustomerGroup;
  negotiations: Negotiation[];
  onClose: () => void;
  onRefresh: () => void;
  onOpenRenegotiate: (r?: Receivable) => void;
  onOpenEmail: () => void;
}) {
  const formatCurrency = useFormatCurrency();
  const { toast } = useToast();

  const handleScheduleCall = async () => {
    const dt = prompt('Data/hora do agendamento (YYYY-MM-DDTHH:mm):');
    if (!dt) return;
    const id = customer.clientId || customer.customerName;
    await apiFetch(`/api/pj/negotiations/${encodeURIComponent(id)}/schedule-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextContactAt: dt }),
    });
    toast({ title: 'Ligação agendada' });
    onRefresh();
  };

  const handleMarkLost = async () => {
    if (!confirm('Marcar como perdido?')) return;
    const id = customer.clientId || customer.customerName;
    await apiFetch(`/api/pj/negotiations/${encodeURIComponent(id)}/lost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    toast({ title: 'Marcado como perdido' });
    onRefresh();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">{customer.customerName}</h2>
            <div className="flex items-center gap-3 mt-1">
              <Stars value={customer.clientRating} />
              <span className="text-red-400 font-semibold text-sm">{formatCurrency(customer.totalOverdue)} em atraso</span>
              {customer.clientPhone && <span className="text-slate-500 text-sm flex items-center gap-1"><Phone className="w-3 h-3" />{customer.clientPhone}</span>}
              {customer.clientEmail && <span className="text-slate-500 text-sm flex items-center gap-1"><Mail className="w-3 h-3" />{customer.clientEmail}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-700 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 columns */}
        <div className="flex-1 overflow-hidden grid grid-cols-3 divide-x divide-slate-700">
          {/* Col 1 — Parcelas */}
          <div className="flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700 shrink-0">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-red-400" /> Parcelas em Atraso
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800 p-2">
              {customer.receivables.map((r) => {
                const pending = r.amount - (r.amountReceived || 0);
                const days = Math.floor((Date.now() - new Date(r.dueDate).getTime()) / 86400000);
                return (
                  <div key={r.id} className="p-2 space-y-1">
                    <div className="text-sm font-medium text-white leading-tight">{r.description}</div>
                    <div className="text-xs text-slate-500">Vence {formatDate(r.dueDate)} · {days}d em atraso</div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-red-400">{formatCurrency(pending)}</span>
                      <button
                        onClick={() => onOpenRenegotiate(r)}
                        className="text-xs px-2 py-1 rounded bg-emerald-900/30 text-emerald-300 hover:bg-emerald-700 hover:text-white transition-colors"
                      >
                        Negociar
                      </button>
                    </div>
                  </div>
                );
              })}
              {customer.receivables.length === 0 && (
                <p className="text-sm text-slate-500 p-4 text-center">Sem parcelas</p>
              )}
            </div>
          </div>

          {/* Col 2 — Ocorrências */}
          <div className="flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700 shrink-0">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" /> Ocorrências
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800 p-2">
              {negotiations.length === 0 ? (
                <p className="text-sm text-slate-500 p-4 text-center">Sem ocorrências</p>
              ) : (
                negotiations.map((n) => {
                  const statusColors: Record<string, string> = {
                    negociado: 'bg-blue-900/30 text-blue-300',
                    pago: 'bg-green-900/30 text-green-300',
                    cancelado: 'bg-yellow-900/30 text-yellow-300',
                    perdido: 'bg-red-900/30 text-red-300',
                  };
                  const cls = statusColors[n.status] || 'bg-slate-700 text-slate-300';
                  return (
                    <div key={n.id} className="p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{n.status}</span>
                        <span className="text-xs text-slate-500">{formatDate(n.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{formatCurrency(n.newAmount)}</span>
                        <span className="text-xs text-slate-500">{n.installments}x · {formatDate(n.newDueDate)}</span>
                      </div>
                      {n.notes && <p className="text-xs text-slate-400 bg-slate-800 rounded p-1.5 leading-relaxed">{n.notes}</p>}
                      {n.nextContact && (
                        <p className="text-xs text-blue-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Próx. contato: {formatDate(n.nextContact)}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Col 3 — Ações / Contatos */}
          <div className="flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700 shrink-0">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" /> Ações
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <button
                onClick={() => onOpenRenegotiate()}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-300 hover:bg-emerald-700 hover:text-white text-sm font-medium transition-colors"
              >
                <Handshake className="w-4 h-4" /> Renegociar (geral)
              </button>
              <button
                onClick={handleScheduleCall}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-blue-900/20 border border-blue-700/40 text-blue-300 hover:bg-blue-700 hover:text-white text-sm font-medium transition-colors"
              >
                <PhoneCall className="w-4 h-4" /> Agendar Ligação
              </button>
              <button
                onClick={onOpenEmail}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-purple-900/20 border border-purple-700/40 text-purple-300 hover:bg-purple-700 hover:text-white text-sm font-medium transition-colors"
              >
                <Send className="w-4 h-4" /> Enviar Email de Cobrança
              </button>
              <button
                onClick={handleMarkLost}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-900/20 border border-red-700/40 text-red-400 hover:bg-red-700 hover:text-white text-sm font-medium transition-colors"
              >
                <Ban className="w-4 h-4" /> Marcar como Perdido
              </button>

              {/* Contact info */}
              {(customer.clientPhone || customer.clientEmail) && (
                <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Contato direto</p>
                  {customer.clientPhone && (
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Phone className="w-4 h-4 text-slate-500" /> {customer.clientPhone}
                    </div>
                  )}
                  {customer.clientEmail && (
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Mail className="w-4 h-4 text-slate-500" /> {customer.clientEmail}
                    </div>
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="mt-3 pt-3 border-t border-slate-700 space-y-1.5">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Resumo</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Negociações</span>
                  <span className="text-white">{customer.negotiationCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Perdidos</span>
                  <span className="text-red-400">{customer.lostCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Títulos em atraso</span>
                  <span className="text-white">{customer.receivables.length}</span>
                </div>
                {customer.nextContact && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Próx. contato</span>
                    <span className="text-blue-300">{formatDate(customer.nextContact)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InadimplenciaPage() {
  const formatCurrency = useFormatCurrency();
  const { activeEnv, activeCompanyId, companies } = usePJ();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ customers: CustomerGroup[]; summary: any } | null>(null);
  const [search, setSearch] = useState('');
  const [minRating, setMinRating] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerGroup | null>(null);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);

  const [showNegotiationModal, setShowNegotiationModal] = useState(false);
  const [showRenegotiate, setShowRenegotiate] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [renegotiateReceivable, setRenegotiateReceivable] = useState<Receivable | undefined>(undefined);

  const fetchData = useCallback(() => {
    if (!activeCompanyId) { setLoading(false); return; }
    setLoading(true);
    const p = new URLSearchParams();
    if (minRating) p.set('minRating', minRating);
    apiFetch(`/api/pj/defaults?${p}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeCompanyId, minRating]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openModal = async (customer: CustomerGroup) => {
    setSelectedCustomer(customer);
    const res = await apiFetch(`/api/pj/negotiations?customer=${encodeURIComponent(customer.customerName)}`);
    const ngs = await res.json();
    setNegotiations(Array.isArray(ngs) ? ngs : []);
    setShowNegotiationModal(true);
  };

  const closeModal = () => {
    setShowNegotiationModal(false);
    setSelectedCustomer(null);
    setNegotiations([]);
  };

  const handleRefresh = () => {
    fetchData();
    if (selectedCustomer) openModal(selectedCustomer);
  };

  const openRenegotiate = (receivable?: Receivable) => {
    setRenegotiateReceivable(receivable);
    setShowRenegotiate(true);
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
  const filtered = customers.filter(
    (c) => !search.trim() || c.customerName.toLowerCase().includes(search.toLowerCase())
  );
  const summary = data?.summary || { total: 0, count: 0, receivablesCount: 0 };
  const activeCompany = companies.find((c: any) => c.id === activeCompanyId);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 text-xs font-semibold">
              <Briefcase className="w-3 h-3" /> PJ
            </span>
            {activeCompany && <span className="text-xs text-muted-foreground">• {activeCompany.name}</span>}
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

      {/* KPI cards */}
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
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(summary.count ? summary.total / summary.count : 0)}</p>
        </CardContent></Card>
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"><CardContent className="p-4">
          <p className="text-xs text-red-700 dark:text-red-300">Valor total em cobrança</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{formatCurrency(summary.total || 0)}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <CardTitle className="text-lg text-foreground">Clientes em Atraso</CardTitle>
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mr-2">Rating mín.</label>
              <select
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
                className="bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={String(n)}>{n} {n === 1 ? 'estrela' : 'estrelas'}+</option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="font-semibold text-foreground">Nenhum cliente inadimplente</h3>
              <p className="text-sm text-muted-foreground mt-1">Todas as contas a receber estão em dia.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Rating</th>
                    <th className="px-4 py-3 font-semibold">Próx. Contato</th>
                    <th className="px-4 py-3 font-semibold">Previsão</th>
                    <th className="px-4 py-3 font-semibold">Vencto. + antigo</th>
                    <th className="px-4 py-3 font-semibold text-center">Negoc.</th>
                    <th className="px-4 py-3 font-semibold text-center">Perdido</th>
                    <th className="px-4 py-3 font-semibold text-right">Valor (R$)</th>
                    <th className="px-4 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const daysOverdue = c.oldestDueDate
                      ? Math.floor((Date.now() - new Date(c.oldestDueDate).getTime()) / 86400000)
                      : 0;
                    return (
                      <tr key={c.customerName} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <button
                            className="text-left font-medium text-foreground hover:text-blue-600 dark:hover:text-blue-400"
                            onClick={() => openModal(c)}
                          >
                            {c.customerName}
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {c.receivables.length} {c.receivables.length === 1 ? 'título' : 'títulos'} em atraso
                          </p>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <Stars value={c.clientRating} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.nextContact ? formatDate(c.nextContact) : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.forecastDate ? formatDate(c.forecastDate) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-foreground">{c.oldestDueDate ? formatDate(c.oldestDueDate) : '—'}</div>
                          <div className="text-xs text-red-500">
                            {daysOverdue} {daysOverdue === 1 ? 'dia' : 'dias'} em atraso
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-foreground">{c.negotiationCount}</td>
                        <td className="px-4 py-3 text-center text-foreground">{c.lostCount}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">
                          {formatCurrency(c.totalOverdue)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" onClick={() => openModal(c)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            <Handshake className="w-3.5 h-3.5 mr-1.5" />Negociar
                          </Button>
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

      {/* 3-column negotiation modal */}
      {showNegotiationModal && selectedCustomer && (
        <NegotiationModal
          customer={selectedCustomer}
          negotiations={negotiations}
          onClose={closeModal}
          onRefresh={handleRefresh}
          onOpenRenegotiate={(r) => { setShowRenegotiate(true); setRenegotiateReceivable(r); }}
          onOpenEmail={() => setShowEmail(true)}
        />
      )}

      {/* Renegotiation modal */}
      <RenegotiationModal
        open={showRenegotiate}
        onClose={() => setShowRenegotiate(false)}
        customer={selectedCustomer}
        receivable={renegotiateReceivable || null}
        onSaved={() => {
          setShowRenegotiate(false);
          handleRefresh();
        }}
      />

      {/* Email modal */}
      <EmailModal
        open={showEmail}
        onClose={() => setShowEmail(false)}
        customer={selectedCustomer}
        onSent={() => { setShowEmail(false); handleRefresh(); }}
      />
    </div>
  );
}
