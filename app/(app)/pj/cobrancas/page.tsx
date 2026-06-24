'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle, Clock, Copy, Download, Plus, QrCode, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';

interface Charge {
  id: string;
  type: string;
  status: string;
  customerName: string;
  customerDoc?: string;
  amount: number;
  dueDate: string;
  description?: string;
  boletoBarCode?: string;
  boletoUrl?: string;
  pixCopiaECola?: string;
  pixQrCodeUrl?: string;
  paidAt?: string;
  paidAmount?: number;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pendente: { label: 'Pendente', color: 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30', icon: <Clock className="w-3.5 h-3.5" /> },
  pago:     { label: 'Pago',     color: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30',   icon: <CheckCircle className="w-3.5 h-3.5" /> },
  vencido:  { label: 'Vencido',  color: 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30',           icon: <AlertCircle className="w-3.5 h-3.5" /> },
  cancelado:{ label: 'Cancelado',color: 'text-muted-foreground bg-muted',                                          icon: <XCircle className="w-3.5 h-3.5" /> },
};

const fmtCurrency = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '-';

export default function CobrancasPage() {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedCharge, setSelectedCharge] = useState<Charge | null>(null);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    const r = await apiFetch(`/api/pj/cobrancas?${params}`);
    const d = await r.json();
    setCharges(d.charges || []);
    setTotal(d.total || 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, [page, statusFilter, typeFilter]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const totals = charges.reduce((acc, c) => {
    acc.total += c.amount;
    if (c.status === 'pago') acc.received += c.paidAmount || c.amount;
    if (c.status === 'pendente') acc.pending += c.amount;
    return acc;
  }, { total: 0, received: 0, pending: 0 });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cobranças</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Boleto bancário e PIX Cobrança</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Cobrança
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm">Total Emitido</p>
            <p className="text-2xl font-bold mt-1">{fmtCurrency(totals.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm">Recebido</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{fmtCurrency(totals.received)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm">A Receber</p>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{fmtCurrency(totals.pending)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-background border border-border text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-background border border-border text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">Todos os tipos</option>
          <option value="boleto">Boleto</option>
          <option value="pix">PIX</option>
          <option value="boleto_pix">Boleto + PIX</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Cliente</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Tipo</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Vencimento</th>
              <th className="text-right px-4 py-3 text-muted-foreground font-medium">Valor</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : charges.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhuma cobrança encontrada</td></tr>
            ) : charges.map((c) => {
              const sc = STATUS_CONFIG[c.status] || STATUS_CONFIG.pendente;
              const isOverdue = c.status === 'pendente' && new Date(c.dueDate) < new Date();
              return (
                <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-foreground font-medium">{c.customerName}</div>
                    <div className="text-muted-foreground text-xs">{c.customerDoc || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.type === 'pix' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'}`}>
                      {c.type === 'boleto_pix' ? 'Boleto + PIX' : c.type.toUpperCase()}
                    </span>
                  </td>
                  <td className={`px-4 py-3 ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-foreground'}`}>{fmtDate(c.dueDate)}</td>
                  <td className="px-4 py-3 text-right text-foreground font-medium">{fmtCurrency(c.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.color}`}>
                      {sc.icon} {sc.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {c.boletoUrl && (
                        <a href={c.boletoUrl} target="_blank" title="Boleto PDF" className="text-primary hover:text-primary/80">
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                      {c.boletoBarCode && (
                        <button onClick={() => copy(c.boletoBarCode!)} title="Copiar código de barras" className="text-muted-foreground hover:text-foreground">
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                      {c.pixCopiaECola && (
                        <button onClick={() => copy(c.pixCopiaECola!)} title="Copiar PIX Copia e Cola" className="text-teal-600 dark:text-teal-400 hover:opacity-80">
                          <QrCode className="w-4 h-4" />
                        </button>
                      )}
                      {(c.pixQrCodeUrl || c.boletoBarCode || c.pixCopiaECola) && (
                        <button onClick={() => setSelectedCharge(c)} title="Detalhes" className="text-muted-foreground hover:text-foreground text-xs">Ver</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-muted-foreground text-sm">{total} cobranças no total</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </div>

      {/* Charge detail modal */}
      <Dialog open={!!selectedCharge} onOpenChange={(open) => { if (!open) setSelectedCharge(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cobrança — {selectedCharge?.customerName}</DialogTitle>
          </DialogHeader>
          {selectedCharge && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Valor: <span className="text-foreground font-medium">{fmtCurrency(selectedCharge.amount)}</span>
                {' | '}Vencimento: <span className="text-foreground font-medium">{fmtDate(selectedCharge.dueDate)}</span>
              </p>

              {selectedCharge.pixQrCodeUrl && (
                <div className="flex flex-col items-center gap-3">
                  <img src={selectedCharge.pixQrCodeUrl} alt="QR Code PIX" className="w-48 h-48 bg-white p-2 rounded-lg border border-border" />
                  <Button variant="outline" onClick={() => copy(selectedCharge.pixCopiaECola || '')}>
                    <Copy className="w-4 h-4 mr-2" /> Copiar PIX Copia e Cola
                  </Button>
                </div>
              )}

              {selectedCharge.boletoBarCode && !selectedCharge.pixQrCodeUrl && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Código de Barras:</p>
                  <p className="font-mono text-sm text-foreground bg-muted rounded-lg p-3 break-all border border-border">{selectedCharge.boletoBarCode}</p>
                  <Button variant="outline" onClick={() => copy(selectedCharge.boletoBarCode!)}>
                    <Copy className="w-4 h-4 mr-2" /> Copiar Código
                  </Button>
                </div>
              )}

              {selectedCharge.boletoUrl && (
                <a href={selectedCharge.boletoUrl} target="_blank">
                  <Button variant="outline" className="w-full">
                    <Download className="w-4 h-4 mr-2" /> Baixar Boleto PDF
                  </Button>
                </a>
              )}

              <Button variant="outline" className="w-full" onClick={() => setSelectedCharge(null)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Charge Form */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) setShowForm(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Cobrança</DialogTitle>
          </DialogHeader>
          <ChargeForm onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); load(); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChargeForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ type: 'boleto', customerName: '', customerDoc: '', customerEmail: '', amount: '', dueDate: '', description: '', instructions: '', emit: true });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.customerName || !form.customerDoc || !form.amount || !form.dueDate) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    const r = await apiFetch('/api/pj/cobrancas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok || r.status === 201) {
      toast.success(form.emit ? 'Cobrança gerada!' : 'Cobrança salva');
      onSuccess();
    } else {
      toast.error(d.error || d.errorMessage || 'Erro ao criar cobrança');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs mb-1 block">Tipo de Cobrança</Label>
        <div className="grid grid-cols-3 gap-2">
          {[['boleto', 'Boleto'], ['pix', 'PIX'], ['boleto_pix', 'Boleto + PIX']].map(([v, l]) => (
            <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))}
              className={`py-2 rounded-lg text-sm font-medium transition-colors border ${form.type === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-muted'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {[
        ['customerName', 'Nome do Cliente *', 'text', 'João da Silva'],
        ['customerDoc', 'CPF / CNPJ *', 'text', '000.000.000-00'],
        ['customerEmail', 'E-mail', 'email', 'cliente@email.com'],
        ['amount', 'Valor (R$) *', 'number', '0,00'],
        ['dueDate', 'Data de Vencimento *', 'date', ''],
        ['description', 'Descrição', 'text', 'Referente a...'],
      ].map(([key, label, type, placeholder]) => (
        <div key={key}>
          <Label className="text-xs mb-1 block">{label}</Label>
          <Input type={type} value={(form as any)[key]} placeholder={placeholder}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
        </div>
      ))}

      {(form.type === 'boleto' || form.type === 'boleto_pix') && (
        <div>
          <Label className="text-xs mb-1 block">Instruções do Boleto</Label>
          <textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} rows={2}
            placeholder="Ex: Não receber após o vencimento"
            className="w-full bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>
      )}

      <div className="flex gap-3 pt-2 border-t border-border">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
        <Button variant="outline" className="flex-1" disabled={saving}
          onClick={() => { setForm(f => ({ ...f, emit: false })); setTimeout(submit, 0); }}>Salvar</Button>
        <Button className="flex-1" disabled={saving}
          onClick={() => { setForm(f => ({ ...f, emit: true })); setTimeout(submit, 0); }}>
          {saving ? 'Gerando...' : 'Gerar Cobrança'}
        </Button>
      </div>
    </div>
  );
}
