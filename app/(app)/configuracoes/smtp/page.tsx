'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/enterprise';
import { apiFetch } from '@/lib/fetch';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Mail, Plus, Pencil, Trash2, X, Loader2, CheckCircle, AlertTriangle,
  Send, Eye, EyeOff, Info, Shield, Clock, Check,
} from 'lucide-react';

type Encryption = 'none' | 'ssl' | 'tls';
type Preset = 'gmail' | 'outlook' | 'zoho' | 'locaweb' | 'hostinger' | 'custom';

interface PresetDef {
  label: string;
  host: string;
  port: number;
  encryption: Encryption;
  requiresAppPassword?: boolean;
  helpText?: string;
}

const PRESETS: Record<Preset, PresetDef> = {
  gmail: {
    label: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    encryption: 'ssl',
    requiresAppPassword: true,
    helpText:
      'Gmail requer senha de app (16 dígitos) com verificação em duas etapas ativa. Acesse myaccount.google.com > Segurança > Senhas de app.',
  },
  outlook: {
    label: 'Outlook / Office 365',
    host: 'smtp.office365.com',
    port: 587,
    encryption: 'tls',
    helpText: 'Use seu e-mail e senha do Microsoft 365 ou Outlook.com.',
  },
  zoho: {
    label: 'Zoho Mail',
    host: 'smtp.zoho.com',
    port: 587,
    encryption: 'tls',
    helpText: 'Use seu e-mail e senha da conta Zoho Mail.',
  },
  locaweb: {
    label: 'Locaweb',
    host: 'email.locaweb.com.br',
    port: 587,
    encryption: 'tls',
    helpText: 'Use o e-mail e senha cadastrados no painel Locaweb.',
  },
  hostinger: {
    label: 'Hostinger',
    host: 'smtp.hostinger.com',
    port: 465,
    encryption: 'ssl',
    helpText: 'Use seu e-mail de domínio e senha do hPanel Hostinger.',
  },
  custom: {
    label: 'SMTP Personalizado',
    host: '',
    port: 587,
    encryption: 'tls',
    helpText: 'Configure manualmente host, porta e tipo de criptografia.',
  },
};

const CONTEXT_TYPES: Record<string, string> = {
  nfse: 'NFS-e',
  boleto: 'Boleto',
  pix: 'PIX',
  recibo: 'Recibo',
  cobranca: 'Cobrança',
  test: 'Teste',
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  sent: { label: 'Enviado', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: 'Falhou', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  pending: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
};

const EMPTY_FORM = {
  preset: 'custom' as Preset,
  name: '',
  senderName: '',
  senderEmail: '',
  host: '',
  port: '587',
  encryption: 'tls' as Encryption,
  password: '',
  isDefault: false,
};

export default function SmtpConfigPage() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [showTestModal, setShowTestModal] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'configs' | 'logs'>('configs');

  const load = useCallback(async () => {
    setLoading(true);
    const [cr, lr] = await Promise.all([
      apiFetch('/api/configuracoes/smtp').then(r => r.json()).catch(() => ({ items: [] })),
      apiFetch('/api/configuracoes/smtp/logs').then(r => r.json()).catch(() => ({ items: [] })),
    ]);
    setConfigs(cr.items || []);
    setLogs(lr.items || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (preset: Preset) => {
    const p = PRESETS[preset];
    setForm(f => ({
      ...f,
      preset,
      host: p.host,
      port: String(p.port),
      encryption: p.encryption,
    }));
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowPass(false);
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      preset: item.preset || 'custom',
      name: item.name || '',
      senderName: item.senderName || '',
      senderEmail: item.senderEmail || '',
      host: item.host || '',
      port: String(item.port || 587),
      encryption: item.encryption || 'tls',
      password: '',
      isDefault: item.isDefault || false,
    });
    setShowPass(false);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.senderEmail || !form.host) {
      toast({ title: 'E-mail e host são obrigatórios', variant: 'destructive' });
      return;
    }
    if (!editing && !form.password) {
      toast({ title: 'Senha obrigatória para nova configuração', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: any = { ...form, port: Number(form.port) };
      if (!payload.name) payload.name = PRESETS[form.preset]?.label || 'Principal';
      if (!payload.senderName) payload.senderName = payload.senderEmail;
      if (editing) payload.id = editing.id;
      if (!payload.password) delete payload.password;

      const r = await apiFetch('/api/configuracoes/smtp', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
      toast({ title: editing ? 'Configuração atualizada!' : 'Configuração criada!' });
      setShowForm(false);
      load();
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao salvar', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta configuração SMTP?')) return;
    try {
      await apiFetch(`/api/configuracoes/smtp?id=${id}`, { method: 'DELETE' });
      toast({ title: 'Configuração excluída!' });
      load();
    } catch { toast({ title: 'Erro ao excluir', variant: 'destructive' }); }
  };

  const handleTest = async (id: string) => {
    if (!testTo) { toast({ title: 'Informe o e-mail de destino do teste', variant: 'destructive' }); return; }
    setTesting(id);
    try {
      const r = await apiFetch('/api/configuracoes/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtpConfigId: id, testTo }),
      });
      const d = await r.json();
      if (d.success) {
        toast({ title: '✅ E-mail de teste enviado com sucesso!' });
      } else {
        toast({ title: `❌ Falha: ${d.error}`, variant: 'destructive' });
      }
      load();
    } catch { toast({ title: 'Erro ao testar', variant: 'destructive' }); }
    setTesting(null);
    setShowTestModal(null);
  };

  const preset = PRESETS[form.preset];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <PageHeader title="Configuração de E-mail SMTP" subtitle="Configure o servidor de e-mail para envio de NFS-e, boletos, cobranças e recibos" />
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1.5" /> Nova Config
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <Shield className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300">
          <strong>Segurança:</strong> As senhas são criptografadas com AES-256-GCM antes de serem armazenadas.
          Nunca ficam em texto puro no banco de dados.
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['configs', 'logs'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab === 'configs' ? `Configurações (${configs.length})` : `Log de Envios (${logs.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : activeTab === 'configs' ? (
        configs.length === 0 ? (
          <div className="bg-card border border-border/60 rounded-xl p-12 text-center">
            <Mail className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">Nenhuma configuração SMTP</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Clique em "Nova Config" para começar.</p>
            <Button size="sm" className="mt-4" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Criar primeira configuração</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {configs.map(config => (
              <div key={config.id} className="bg-card border border-border/60 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{config.name}</p>
                        {config.isDefault && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Padrão</span>
                        )}
                        {!config.isActive && (
                          <span className="text-xs bg-gray-100 text-muted-foreground px-2 py-0.5 rounded-full">Inativo</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{config.senderEmail} · {config.host}:{config.port} · {config.encryption.toUpperCase()}</p>
                      {config.lastTestedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Testado {new Date(config.lastTestedAt).toLocaleDateString('pt-BR')} ·
                          {config.lastTestOk
                            ? <><CheckCircle className="w-3 h-3 text-green-500 ml-1" /><span className="text-green-600">OK</span></>
                            : <><AlertTriangle className="w-3 h-3 text-red-500 ml-1" /><span className="text-red-500">Falhou</span></>}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setShowTestModal(config.id); setTestTo(config.senderEmail); }}
                      className="p-2 rounded-lg hover:bg-muted transition-colors" title="Testar envio">
                      <Send className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => openEdit(config)} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Editar">
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(config.id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Excluir">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Logs tab */
        logs.length === 0 ? (
          <div className="bg-card border border-border/60 rounded-xl p-12 text-center">
            <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum envio registrado ainda.</p>
          </div>
        ) : (
          <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Destinatário</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Assunto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {logs.map(log => {
                  const badge = STATUS_BADGE[log.status] || STATUS_BADGE.pending;
                  return (
                    <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-sm">{log.to}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell max-w-xs truncate">{log.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                        {CONTEXT_TYPES[log.contextType] || log.contextType || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Test Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowTestModal(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm m-4 p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Send className="w-5 h-5 text-primary" /> Testar Envio</h3>
            <p className="text-sm text-muted-foreground mb-3">Informe o e-mail que receberá o e-mail de teste:</p>
            <Input type="email" placeholder="destinatario@exemplo.com" value={testTo} onChange={e => setTestTo(e.target.value)} />
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowTestModal(null)}>Cancelar</Button>
              <Button size="sm" className="flex-1" onClick={() => handleTest(showTestModal)} disabled={!!testing}>
                {testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                Enviar Teste
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-card border-b border-border/60 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-semibold">{editing ? 'Editar Configuração' : 'Nova Configuração SMTP'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Preset Selector */}
              <div>
                <label className="text-sm font-medium mb-2 block">Provedor</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(PRESETS) as Preset[]).map(p => (
                    <button key={p} onClick={() => applyPreset(p)}
                      className={`p-2.5 rounded-lg border text-sm font-medium transition-all ${form.preset === p ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/40'}`}>
                      {PRESETS[p].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preset help text */}
              {preset?.helpText && (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">{preset.helpText}</p>
                </div>
              )}

              {/* Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium mb-1.5 block">Nome da configuração</label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={PRESETS[form.preset]?.label || 'Ex: Gmail Empresa'} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium mb-1.5 block">Nome do Remetente</label>
                  <Input value={form.senderName} onChange={e => setForm(f => ({ ...f, senderName: e.target.value }))}
                    placeholder="Ex: WNR Finance" />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium mb-1.5 block">E-mail do Remetente <span className="text-red-500">*</span></label>
                  <Input type="email" value={form.senderEmail} onChange={e => setForm(f => ({ ...f, senderEmail: e.target.value }))}
                    placeholder="financeiro@empresa.com.br" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Host SMTP <span className="text-red-500">*</span></label>
                  <Input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                    placeholder="smtp.exemplo.com" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Porta</label>
                  <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium mb-1.5 block">Criptografia</label>
                  <div className="flex gap-3">
                    {(['tls', 'ssl', 'none'] as Encryption[]).map(enc => (
                      <label key={enc} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="encryption" value={enc} checked={form.encryption === enc}
                          onChange={() => setForm(f => ({ ...f, encryption: enc }))} />
                        <span className="text-sm font-medium">{enc === 'tls' ? 'TLS/STARTTLS' : enc === 'ssl' ? 'SSL' : 'Nenhuma'}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium mb-1.5 block">
                    {preset?.requiresAppPassword ? 'Senha de App (16 dígitos)' : 'Senha'} {!editing && <span className="text-red-500">*</span>}
                  </label>
                  <div className="relative">
                    <Input type={showPass ? 'text' : 'password'} value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder={editing ? 'Deixe em branco para manter a senha atual' : 'Senha do e-mail ou senha de app'} />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    <Shield className="w-3 h-3 inline mr-1" />
                    Armazenada com criptografia AES-256-GCM
                  </p>
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                      className="rounded" />
                    <span className="text-sm font-medium">Usar como configuração padrão</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-card border-t border-border/60 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                {editing ? 'Salvar alterações' : 'Criar configuração'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
