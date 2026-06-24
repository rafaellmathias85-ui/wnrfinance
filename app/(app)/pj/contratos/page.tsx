'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, PauseCircle, PlayCircle, XCircle, Search, AlertTriangle, FileText, QrCode, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { usePJ } from '@/lib/pj-context';
import { apiFetch } from '@/lib/fetch';
import { useFormatCurrency } from '@/hooks/use-format-currency';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  rascunho:  { label: 'Rascunho',  color: 'bg-slate-100 text-slate-700 dark:bg-card dark:text-foreground' },
  ativo:     { label: 'Ativo',     color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  suspenso:  { label: 'Suspenso',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  encerrado: { label: 'Encerrado', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  renovado:  { label: 'Renovado',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
};

const CYCLE_LABEL: Record<string, string> = { mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', unico: 'Unico', sob_demanda: 'Sob Demanda' };
const TYPE_LABEL: Record<string, string> = { servico: 'Servico', locacao: 'Locacao', manutencao: 'Manutencao', assinatura: 'Assinatura', fornecimento: 'Fornecimento', outro: 'Outro' };

const emptyForm = {
  clientName: '', clientDoc: '', clientEmail: '',
  title: '', type: 'servico', value: '',
  categoryId: '', costCenterId: '', fiscalRuleId: '',
  billingCycle: 'mensal', startDate: '', endDate: '',
  billingDay: '', chargeType: 'boleto_pix',
  autoRenew: false, noticeDays: '30',
  requiresNFe: false, requiresBoleto: false,
  autoSendEmail: false, autoSendWhatsapp: false,
  description: '',
};

export default function ContratosPage() {
  const { activeCompanyId } = usePJ();
  const formatCurrency = useFormatCurrency();
  const [contracts, setContracts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [fiscalRules, setFiscalRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ativo');
  const [renewDialog, setRenewDialog] = useState<any>(null);
  const [renewMonths, setRenewMonths] = useState('12');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const [res, catsRes, ccRes, rulesRes] = await Promise.all([
        apiFetch(`/api/pj/contratos?${params}`),
        apiFetch('/api/pj/categories'),
        apiFetch('/api/pj/cost-centers'),
        apiFetch('/api/pj/fiscal/regras-servico'),
      ]);
      if (res.ok) { const d = await res.json(); setContracts(d.items || []); }
      if (catsRes.ok) {
        const d = await catsRes.json();
        setCategories(Array.isArray(d) ? d : []);
      }
      if (ccRes.ok) {
        const d = await ccRes.json();
        setCostCenters(Array.isArray(d) ? d : []);
      }
      if (rulesRes.ok) {
        const d = await rulesRes.json();
        setFiscalRules(d.rules || []);
      }
    } catch {}
    setLoading(false);
  }, [activeCompanyId, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditingId(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({
      clientName: c.clientName || '', clientDoc: c.clientDoc || '', clientEmail: c.clientEmail || '',
      title: c.title || '', type: c.type || 'servico', value: String(c.value || ''),
      categoryId: c.categoryId || '', costCenterId: c.costCenterId || '', fiscalRuleId: c.fiscalRuleId || '',
      billingCycle: c.billingCycle || 'mensal', startDate: c.startDate?.substring(0, 10) || '',
      billingDay: String(c.billingDay || ''), chargeType: c.chargeType || 'boleto_pix',
      endDate: c.endDate?.substring(0, 10) || '', autoRenew: !!c.autoRenew,
      noticeDays: String(c.noticeDays || 30),
      requiresNFe: !!c.requiresNFe, requiresBoleto: !!c.requiresBoleto,
      autoSendEmail: !!c.autoSendEmail, autoSendWhatsapp: !!c.autoSendWhatsapp,
      description: c.description || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.clientName || !form.title || !form.startDate) { toast.error('Preencha cliente, titulo e data de inicio'); return; }
    setSaving(true);
    try {
      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId ? `/api/pj/contratos/${editingId}` : '/api/pj/contratos';
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erro ao salvar'); setSaving(false); return; }
      toast.success(editingId ? 'Contrato atualizado' : 'Contrato criado');
      setDialogOpen(false);
      load();
    } catch { toast.error('Erro'); }
    setSaving(false);
  };

  const handleAction = async (id: string, action: string, label: string, extra: any = {}) => {
    const res = await apiFetch(`/api/pj/contratos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
    if (res.ok) { toast.success(label); load(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este contrato?')) return;
    const res = await apiFetch(`/api/pj/contratos/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Contrato excluido'); load(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };

  const handleGenerateBilling = async (contract: any) => {
    const period = new Date().toISOString().slice(0, 7);
    const res = await apiFetch(`/api/pj/contratos/${contract.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_billing', period }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || 'Erro ao gerar faturamento');
      return;
    }
    if (data.duplicated) {
      toast.info('Faturamento deste periodo ja existia');
    } else if (data.automation?.nfe?.status === 'bloqueada') {
      toast.error(`Faturamento criado, mas NFS-e bloqueada: ${data.automation.nfe.errorMessage || 'revise a regra fiscal'}`);
    } else {
      toast.success('Faturamento gerado');
    }
  };

  const filtered = contracts.filter(c => c.clientName?.toLowerCase().includes(search.toLowerCase()) || c.title?.toLowerCase().includes(search.toLowerCase()));

  // Contracts expiring soon (within noticeDays)
  const expiring = contracts.filter(c => {
    if (c.status !== 'ativo' || !c.renewalDate) return false;
    const days = Math.ceil((new Date(c.renewalDate).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  });

  const totalMRR = contracts.filter(c => c.status === 'ativo' && c.billingCycle === 'mensal').reduce((s, c) => s + c.value, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Contratos</h1>
          <p className="text-muted-foreground">Gestao de contratos de servico e fornecimento</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Novo Contrato</Button>
      </div>

      {expiring.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-amber-700 dark:text-amber-400 text-sm">
            {expiring.length} contrato{expiring.length > 1 ? 's' : ''} com renovacao proxima: {expiring.map(c => c.title).join(', ')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Ativos', value: contracts.filter(c => c.status === 'ativo').length },
          { label: 'MRR (mensal)', value: formatCurrency(totalMRR), wide: true },
          { label: 'Vencendo em 30d', value: expiring.length },
          { label: 'Encerrados', value: contracts.filter(c => c.status === 'encerrado').length },
        ].map(k => (
          <Card key={k.label}><CardContent className="pt-4 pb-4 text-center">
            <p className="text-xl font-bold">{k.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cliente ou titulo..." className="pl-9" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-background">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </CardContent></Card>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <p className="text-muted-foreground">Nenhum contrato encontrado.</p>
          <Button onClick={openNew} className="mt-4"><Plus className="w-4 h-4 mr-2" />Criar Primeiro Contrato</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const st = STATUS_MAP[c.status] || STATUS_MAP.ativo;
            const nearRenewal = c.renewalDate && new Date(c.renewalDate) < new Date(Date.now() + 30 * 86400000);
            return (
              <Card key={c.id} className={nearRenewal && c.status === 'ativo' ? 'border-amber-300 dark:border-amber-700' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{c.title}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                        <span className="text-xs text-muted-foreground">{TYPE_LABEL[c.type] || c.type}</span>
                        {c.requiresNFe && <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded text-xs"><FileText className="w-3 h-3" />NF-e</span>}
                        {c.requiresBoleto && <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded text-xs"><QrCode className="w-3 h-3" />Boleto</span>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{c.clientName} · {CYCLE_LABEL[c.billingCycle] || c.billingCycle}</p>
                      {c.renewalDate && (
                        <p className={`text-xs mt-0.5 ${nearRenewal ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          Renovacao: {new Date(c.renewalDate).toLocaleDateString('pt-BR')}{nearRenewal ? ' (em breve!)' : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold">{formatCurrency(c.value)}</p>
                      <p className="text-xs text-muted-foreground">{CYCLE_LABEL[c.billingCycle] || c.billingCycle}</p>
                    </div>
                    <div className="flex gap-1">
                      {c.status === 'ativo' && <button onClick={() => handleGenerateBilling(c)} className="p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg" title="Gerar faturamento"><DollarSign className="w-4 h-4" /></button>}
                      {c.status === 'ativo' && <button onClick={() => handleAction(c.id, 'suspend', 'Suspenso')} className="p-1.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg" title="Suspender"><PauseCircle className="w-4 h-4" /></button>}
                      {c.status === 'suspenso' && <button onClick={() => handleAction(c.id, 'reactivate', 'Reativado')} className="p-1.5 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg" title="Reativar"><PlayCircle className="w-4 h-4" /></button>}
                      {c.status === 'ativo' && <button onClick={() => { setRenewDialog(c); setRenewMonths('12'); }} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title="Renovar"><RefreshCw className="w-4 h-4" /></button>}
                      {['ativo', 'suspenso'].includes(c.status) && <button onClick={() => handleAction(c.id, 'terminate', 'Encerrado')} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Encerrar"><XCircle className="w-4 h-4" /></button>}
                      {['rascunho', 'ativo', 'suspenso'].includes(c.status) && <button onClick={() => openEdit(c)} className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg"><Pencil className="w-4 h-4" /></button>}
                      {['encerrado', 'rascunho'].includes(c.status) && <button onClick={() => handleDelete(c.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Contrato' : 'Novo Contrato'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Cliente *</Label><Input value={form.clientName} onChange={e => setForm((p: any) => ({ ...p, clientName: e.target.value }))} placeholder="Nome do cliente" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>CPF / CNPJ</Label><Input value={form.clientDoc} onChange={e => setForm((p: any) => ({ ...p, clientDoc: e.target.value }))} placeholder="Para NF-e e Boleto" className="mt-1" /></div>
              <div><Label>E-mail do cliente</Label><Input value={form.clientEmail} onChange={e => setForm((p: any) => ({ ...p, clientEmail: e.target.value }))} placeholder="cliente@email.com" className="mt-1" /></div>
            </div>
            <div><Label>Titulo do Contrato *</Label><Input value={form.title} onChange={e => setForm((p: any) => ({ ...p, title: e.target.value }))} placeholder="Ex: Contrato de Manutencao de Software" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Tipo</Label>
                <select value={form.type} onChange={e => setForm((p: any) => ({ ...p, type: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-background">
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><Label>Ciclo de Faturamento</Label>
                <select value={form.billingCycle} onChange={e => setForm((p: any) => ({ ...p, billingCycle: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-background">
                  {Object.entries(CYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Categoria financeira</Label>
                <select value={form.categoryId} onChange={e => setForm((p: any) => ({ ...p, categoryId: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-background">
                  <option value="">Sem categoria</option>
                  {categories.filter((c: any) => c.type === 'INCOME' || c.type === 'receita' || c.type === 'ambos').map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><Label>Centro de custo</Label>
                <select value={form.costCenterId} onChange={e => setForm((p: any) => ({ ...p, costCenterId: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-background">
                  <option value="">Nenhum</option>
                  {costCenters.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Regra fiscal NFS-e</Label>
                <select value={form.fiscalRuleId} onChange={e => setForm((p: any) => ({ ...p, fiscalRuleId: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-background">
                  <option value="">Usar regra padrao</option>
                  {fiscalRules.filter((r: any) => r.isActive).map((r: any) => <option key={r.id} value={r.id}>{r.name}{r.isDefault ? ' (padrao)' : ''}</option>)}
                </select>
              </div>
              <div><Label>Tipo de cobranca</Label>
                <select value={form.chargeType} onChange={e => setForm((p: any) => ({ ...p, chargeType: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-background">
                  <option value="boleto_pix">Boleto com PIX</option>
                  <option value="boleto">Boleto</option>
                  <option value="pix">PIX</option>
                  <option value="link">Link de pagamento</option>
                </select>
              </div>
            </div>
            <div><Label>Valor (R$) *</Label><Input type="number" value={form.value} onChange={e => setForm((p: any) => ({ ...p, value: e.target.value }))} min="0" step="0.01" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Inicio *</Label><Input type="date" value={form.startDate} onChange={e => setForm((p: any) => ({ ...p, startDate: e.target.value }))} className="mt-1" /></div>
              <div><Label>Termino</Label><Input type="date" value={form.endDate} onChange={e => setForm((p: any) => ({ ...p, endDate: e.target.value }))} className="mt-1" /></div>
            </div>
            <div><Label>Dia de vencimento</Label><Input type="number" value={form.billingDay} onChange={e => setForm((p: any) => ({ ...p, billingDay: e.target.value }))} min="1" max="31" className="mt-1" /></div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="autoRenew" checked={form.autoRenew} onChange={e => setForm((p: any) => ({ ...p, autoRenew: e.target.checked }))} />
              <Label htmlFor="autoRenew">Renovacao automatica</Label>
              {form.autoRenew && (
                <div className="flex items-center gap-2 ml-4">
                  <Label>Aviso:</Label>
                  <Input type="number" value={form.noticeDays} onChange={e => setForm((p: any) => ({ ...p, noticeDays: e.target.value }))} className="w-20" />
                  <span className="text-sm text-muted-foreground">dias antes</span>
                </div>
              )}
            </div>

            {/* Automações por faturamento */}
            <div className="border rounded-xl p-4 space-y-3 bg-muted/30">
              <p className="text-sm font-medium">Automacoes por faturamento</p>
              <p className="text-xs text-muted-foreground">Cada lancamento gerado por este contrato ira disparar automaticamente:</p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.requiresNFe} onChange={e => setForm((p: any) => ({ ...p, requiresNFe: e.target.checked }))} className="w-4 h-4" />
                  <FileText className="w-4 h-4 text-blue-600" />
                  <div>
                    <span className="text-sm font-medium">Gerar Nota Fiscal (NF-e / NFS-e)</span>
                    <p className="text-xs text-muted-foreground">Emite NF-e automaticamente ao criar conta a receber</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.requiresBoleto} onChange={e => setForm((p: any) => ({ ...p, requiresBoleto: e.target.checked }))} className="w-4 h-4" />
                  <QrCode className="w-4 h-4 text-purple-600" />
                  <div>
                    <span className="text-sm font-medium">Gerar Boleto / PIX</span>
                    <p className="text-xs text-muted-foreground">Envia cobranca ao cliente automaticamente</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.autoSendEmail} onChange={e => setForm((p: any) => ({ ...p, autoSendEmail: e.target.checked }))} className="w-4 h-4" />
                  <div>
                    <span className="text-sm font-medium">Enviar por e-mail</span>
                    <p className="text-xs text-muted-foreground">Marca o contrato para envio automatico quando o canal estiver configurado</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.autoSendWhatsapp} onChange={e => setForm((p: any) => ({ ...p, autoSendWhatsapp: e.target.checked }))} className="w-4 h-4" />
                  <div>
                    <span className="text-sm font-medium">Enviar por WhatsApp</span>
                    <p className="text-xs text-muted-foreground">Usa a sessao de WhatsApp quando a regua estiver ativa</p>
                  </div>
                </label>
              </div>
            </div>

            <div><Label>Descricao</Label><textarea value={form.description} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} rows={2} className="w-full mt-1 border rounded-lg p-3 text-sm bg-background" /></div>
            <div className="flex gap-3"><Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button><Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar Contrato'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Renew Dialog */}
      <Dialog open={!!renewDialog} onOpenChange={() => setRenewDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Renovar Contrato</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{renewDialog?.title} — {renewDialog?.clientName}</p>
            <div><Label>Meses de renovacao</Label>
              <Input type="number" value={renewMonths} onChange={e => setRenewMonths(e.target.value)} min="1" max="120" className="mt-1" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setRenewDialog(null)} className="flex-1">Cancelar</Button>
              <Button onClick={() => { handleAction(renewDialog.id, 'renew', 'Contrato renovado!', { months: renewMonths }); setRenewDialog(null); }} className="flex-1">Renovar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
