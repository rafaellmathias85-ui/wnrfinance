'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/enterprise';
import { apiFetch } from '@/lib/fetch';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MessageCircle, Send, Loader2, CheckCircle, Clock,
  Eye, Package, FileText, QrCode, Link2, AlertTriangle, Ban,
} from 'lucide-react';
import Link from 'next/link';

const MSG_TYPES = [
  { value: 'nfse', label: 'NFS-e Emitida', icon: FileText, color: 'text-blue-500' },
  { value: 'boleto', label: 'Boleto Gerado', icon: Package, color: 'text-purple-500' },
  { value: 'pix', label: 'PIX Copia e Cola', icon: QrCode, color: 'text-green-500' },
  { value: 'payment_link', label: 'Link de Pagamento', icon: Link2, color: 'text-cyan-500' },
  { value: 'aviso_vencimento', label: 'Aviso de Vencimento', icon: Clock, color: 'text-amber-500' },
  { value: 'cobranca_atraso', label: 'Cobrança em Atraso', icon: AlertTriangle, color: 'text-red-500' },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Pendente',   className: 'bg-gray-100 text-muted-foreground' },
  sent:      { label: 'Enviado',    className: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  delivered: { label: 'Entregue',   className: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  read:      { label: 'Lido',       className: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
  failed:    { label: 'Falhou',     className: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
};

const EMPTY_FORM = {
  phone: '',
  type: 'pix',
  customerName: '',
  amount: '',
  dueDate: '',
  documentNumber: '',
  pixCode: '',
  boletoCode: '',
  paymentLink: '',
  pdfUrl: '',
  daysOverdue: '',
};

export default function WhatsAppFinanceiroPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSendForm, setShowSendForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/pj/whatsapp-financial/messages');
      const d = await r.json();
      setMessages(d.items || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSend = async () => {
    if (!form.phone || !form.customerName || !form.amount) {
      toast({ title: 'Telefone, nome e valor são obrigatórios', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const r = await apiFetch('/api/pj/whatsapp-financial/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro ao enviar');
      toast({ title: '✅ Mensagem enviada!' });
      setShowSendForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao enviar', variant: 'destructive' });
    }
    setSending(false);
  };

  const selectedType = MSG_TYPES.find(t => t.value === form.type);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <PageHeader
          title="WhatsApp Financeiro"
          subtitle="Envie NFS-e, boletos, PIX e cobranças diretamente via WhatsApp Business"
        />
        <div className="flex gap-2">
          <Link href="/configuracoes/whatsapp">
            <Button variant="outline" size="sm">Configurar WhatsApp</Button>
          </Link>
          <Button size="sm" onClick={() => setShowSendForm(true)}>
            <Send className="w-4 h-4 mr-1.5" /> Enviar Mensagem
          </Button>
        </div>
      </div>

      {/* Message types */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {MSG_TYPES.map(t => (
          <div key={t.value} className="bg-card border border-border/60 rounded-xl p-4 text-center hover:shadow-sm transition-shadow">
            <t.icon className={`w-7 h-7 mx-auto mb-2 ${t.color}`} />
            <p className="text-xs font-medium text-foreground leading-tight">{t.label}</p>
          </div>
        ))}
      </div>

      {/* Recent messages */}
      <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50">
          <h3 className="font-semibold">Histórico de Mensagens</h3>
        </div>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center">
            <MessageCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Nenhuma mensagem enviada ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/30 border-b border-border/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Destinatário</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {messages.map((msg: any) => {
                  const status = STATUS_CONFIG[msg.deliveryStatus] || STATUS_CONFIG.pending;
                  const type = MSG_TYPES.find(t => t.value === msg.templateName || t.value === msg.contextType);
                  return (
                    <tr key={msg.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium">{msg.to}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                        {type ? (
                          <span className="flex items-center gap-1.5">
                            <type.icon className={`w-3.5 h-3.5 ${type.color}`} />
                            {type.label}
                          </span>
                        ) : (msg.contextType || '—')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                        {new Date(msg.createdAt).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Send Form Modal */}
      {showSendForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowSendForm(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-card border-b border-border/60 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-500" /> Enviar Mensagem Financeira
              </h3>
              <button onClick={() => setShowSendForm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Type selector */}
              <div>
                <label className="text-sm font-medium mb-2 block">Tipo de mensagem</label>
                <div className="grid grid-cols-2 gap-2">
                  {MSG_TYPES.map(t => (
                    <button key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-all ${form.type === t.value ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/30'}`}>
                      <t.icon className={`w-4 h-4 ${form.type === t.value ? 'text-primary' : t.color}`} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Telefone <span className="text-red-500">*</span></label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="5511999990000" />
                <p className="text-xs text-muted-foreground mt-1">Código do país + DDD + número, sem espaços</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Nome do cliente <span className="text-red-500">*</span></label>
                <Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  placeholder="João Silva" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Valor (R$) <span className="text-red-500">*</span></label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0,00" />
              </div>
              {(form.type !== 'nfse') && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Data de vencimento</label>
                  <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
              )}
              {form.type === 'nfse' && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Número da NF</label>
                  <Input value={form.documentNumber} onChange={e => setForm(f => ({ ...f, documentNumber: e.target.value }))} placeholder="NF-001234" />
                </div>
              )}
              {(form.type === 'boleto' || form.type === 'aviso_vencimento' || form.type === 'cobranca_atraso') && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Código de barras (Boleto)</label>
                  <Input value={form.boletoCode} onChange={e => setForm(f => ({ ...f, boletoCode: e.target.value }))} placeholder="00190000090..." />
                </div>
              )}
              {(form.type === 'pix' || form.type === 'aviso_vencimento' || form.type === 'cobranca_atraso') && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">PIX Copia e Cola</label>
                  <Input value={form.pixCode} onChange={e => setForm(f => ({ ...f, pixCode: e.target.value }))} placeholder="00020126..." />
                </div>
              )}
              {(form.type === 'payment_link' || form.type === 'aviso_vencimento' || form.type === 'cobranca_atraso') && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Link de pagamento</label>
                  <Input value={form.paymentLink} onChange={e => setForm(f => ({ ...f, paymentLink: e.target.value }))} placeholder="https://..." />
                </div>
              )}
              {form.type === 'cobranca_atraso' && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Dias em atraso</label>
                  <Input type="number" value={form.daysOverdue} onChange={e => setForm(f => ({ ...f, daysOverdue: e.target.value }))} placeholder="5" />
                </div>
              )}
              {(form.type === 'nfse' || form.type === 'boleto') && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">URL do PDF</label>
                  <Input value={form.pdfUrl} onChange={e => setForm(f => ({ ...f, pdfUrl: e.target.value }))} placeholder="https://..." />
                </div>
              )}
            </div>
            <div className="sticky bottom-0 bg-card border-t border-border/60 px-6 py-4 flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setShowSendForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSend} disabled={sending}>
                {sending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                Enviar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
