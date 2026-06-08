'use client';
import { apiFetch } from '@/lib/fetch';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import {
  Plug, Plus, Trash2, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  Clock, Shield, Upload, FileText, Settings, Zap, ChevronDown, ChevronRight,
  Activity, Search, Wifi, WifiOff, Info, Copy, ExternalLink, Check,
} from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  nfe: 'Notas Fiscais',
  boleto: 'Boletos',
  banco: 'Bancos / Open Finance',
  investimento: 'Investimentos',
  cartao: 'Cartoes',
  pagamento: 'Pagamentos',
  whatsapp: 'WhatsApp',
  outros: 'Outros',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  ok: { label: 'Ativo', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  atencao: { label: 'Atencao', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertTriangle },
  erro: { label: 'Erro', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  pendente: { label: 'Pendente', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: Clock },
};

const OPERATION_PREREQS: Record<string, { title: string; items: string[] }> = {
  nfe: { title: 'Emissao de NF-e', items: ['Certificado digital A1 valido', 'Inscricao Estadual ativa', 'Credenciamento na SEFAZ do estado', 'CSC e Token configurados (NFC-e)'] },
  boleto: { title: 'Emissao de Boletos', items: ['Conta bancaria PJ ativa', 'Convenio de cobranca com o banco', 'API Key ou credenciais de integracao'] },
  banco: { title: 'Open Finance / Bancos', items: ['Conta bancaria PJ ativa', 'Autorizacao do cliente (consent)', 'Credenciais OAuth do banco'] },
};

const BANK_CREDENTIAL_GUIDE: Record<string, { name: string; steps: string[]; link: string }> = {
  bb: { name: 'Banco do Brasil', steps: ['Acesse developers.bb.com.br', 'Crie um app em "Meus Apps"', 'Solicite acesso a API de Cobranca', 'Copie Client ID e Client Secret', 'Gere o certificado digital PFX'], link: 'https://developers.bb.com.br' },
  bradesco: { name: 'Bradesco', steps: ['Acesse developers.bradesco.com.br', 'Cadastre-se como desenvolvedor', 'Crie uma aplicacao', 'Solicite credenciais de homologacao', 'Migre para producao apos testes'], link: 'https://developers.bradesco.com.br' },
  itau: { name: 'Itau', steps: ['Acesse developer.itau.com.br', 'Crie conta de desenvolvedor', 'Registre sua aplicacao', 'Obtenha Client ID e Secret', 'Configure webhook de notificacao'], link: 'https://developer.itau.com.br' },
  santander: { name: 'Santander', steps: ['Acesse developer.santander.com.br', 'Registre-se no portal', 'Crie um projeto e selecione APIs', 'Gere as credenciais de acesso', 'Configure os endpoints de callback'], link: 'https://developer.santander.com.br' },
  caixa: { name: 'Caixa Economica', steps: ['Solicite acesso via gerente PJ', 'Assine o contrato de cobranca', 'Receba credenciais por e-mail', 'Configure o certificado digital', 'Teste em ambiente de homologacao'], link: 'https://www.caixa.gov.br' },
  sicoob: { name: 'Sicoob', steps: ['Acesse developers.sicoob.com.br', 'Faca login com sua conta', 'Crie uma aplicacao', 'Solicite permissoes de API', 'Copie as credenciais geradas'], link: 'https://developers.sicoob.com.br' },
  inter: { name: 'Banco Inter', steps: ['Acesse developers.inter.co', 'Cadastre-se como desenvolvedor PJ', 'Crie aplicacao com escopo "Cobranca"', 'Gere certificado e chave privada', 'Baixe Client ID e Client Secret'], link: 'https://developers.inter.co' },
  sicredi: { name: 'Sicredi', steps: ['Acesse developers.sicredi.com.br', 'Solicite acesso a API de cobranca', 'Gere as credenciais de integracao', 'Configure webhook para notificacoes', 'Teste em sandbox antes de producao'], link: 'https://developers.sicredi.com.br' },
  asaas: { name: 'Asaas', steps: ['Acesse app.asaas.com', 'Va em Configuracoes > Integracao', 'Gere a API Key', 'Configure webhook URL', 'Ative ambiente de producao'], link: 'https://asaas.com' },
  generic: { name: 'Outro Banco', steps: ['Acesse o portal de desenvolvedor do banco', 'Crie uma conta/aplicacao', 'Solicite credenciais de API (Client ID/Secret)', 'Configure certificados se necessario', 'Teste em homologacao antes de ativar'], link: '' },
};

type LogEntry = { time: string; message: string; type: 'info' | 'success' | 'error' | 'warn' };

// ── Per-provider wizard config ────────────────────────────────────────────────
const PROVIDER_WIZARD: Record<string, {
  what: string;
  features: string[];
  credLink: string;
  credSteps: string[];
  fields: { key: keyof typeof FIELD_LABELS; label: string; placeholder: string; tip: string; secret?: boolean }[];
}> = {
  asaas: {
    what: 'Plataforma de cobranças: gera boletos, PIX e links de pagamento automaticamente quando você cria uma conta a receber.',
    features: ['Boleto bancário com vencimento', 'QR Code PIX instantâneo', 'Notificação automática ao cliente por e-mail/SMS', 'Webhook de confirmação de pagamento'],
    credLink: 'https://app.asaas.com/customerConfig/apiKey',
    credSteps: ['Acesse app.asaas.com e faça login', 'Vá em Configurações → Integrações → Chave de API', 'Clique em "Gerar chave de API"', 'Copie e cole abaixo'],
    fields: [
      { key: 'apiKey', label: 'API Key (Asaas)', placeholder: '$aact_...', tip: 'Encontrado em Configurações → Integrações', secret: true },
    ],
  },
  focusnfe: {
    what: 'Emissor de NF-e homologado pela SEFAZ. Emite, consulta e cancela notas fiscais automaticamente.',
    features: ['NF-e (produto) e NFS-e (serviço)', 'Homologação e produção', 'XML e DANFE em PDF', 'Cancelamento e inutilização'],
    credLink: 'https://focusnfe.com.br/painel',
    credSteps: ['Acesse focusnfe.com.br e crie uma conta', 'Após ativar, vá em Configurações → API', 'Copie o Token de API', 'Faça upload do certificado A1 na aba Certificados'],
    fields: [
      { key: 'token', label: 'Token Focus NFe', placeholder: 'Token_...', tip: 'Encontrado em Configurações → API no painel Focus', secret: true },
    ],
  },
  nfeiio: {
    what: 'API de emissão de NF-e e NFS-e alternativa ao Focus, com suporte a mais de 300 municípios para NFS-e.',
    features: ['NF-e e NFS-e', 'Ampla cobertura municipal', 'Webhooks de status', 'Armazenamento de XML'],
    credLink: 'https://nfe.io/docs/autenticacao/',
    credSteps: ['Acesse app.nfe.io e registre-se', 'Vá em Configurações → Chaves de API', 'Gere uma nova chave', 'Copie o API Key abaixo'],
    fields: [
      { key: 'apiKey', label: 'API Key NFe.io', placeholder: 'nfeiio_...', tip: 'Gerado no painel NFe.io', secret: true },
    ],
  },
  inter: {
    what: 'API do Banco Inter para emissão de boletos e cobranças PIX diretamente na sua conta Inter PJ.',
    features: ['Boleto Inter com registro automático', 'PIX por chave ou QR Code', 'Consulta de saldo e extrato', 'Autenticação mTLS (certificado obrigatório)'],
    credLink: 'https://developers.inter.co',
    credSteps: ['Acesse developers.inter.co com sua conta PJ', 'Crie uma aplicação com escopo "Cobrança"', 'Gere o par de chaves (openssl gencert) e envie o .csr', 'Baixe o Client ID, Client Secret e o certificado', 'Faça upload do certificado na aba Certificados'],
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'xxxxxxxx-xxxx-xxxx', tip: 'Gerado ao criar a aplicação', secret: false },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'xxxxxxxx-...', tip: 'Gerado junto ao Client ID', secret: true },
    ],
  },
  pluggy: {
    what: 'Open Finance: conecta sua conta bancária de qualquer banco para importar extratos automaticamente.',
    features: ['Suporte a 200+ bancos brasileiros', 'Importação automática de transações', 'Conciliação bancária facilitada', 'Dados atualizados diariamente'],
    credLink: 'https://docs.pluggy.ai/docs/authentication',
    credSteps: ['Acesse pluggy.ai e crie uma conta desenvolvedor', 'Vá em Dashboard → Configurações → API Keys', 'Copie o Client ID e Client Secret', 'Cole abaixo'],
    fields: [
      { key: 'clientId', label: 'Client ID Pluggy', placeholder: 'xxxxxxxx-xxxx', tip: 'Encontrado no Dashboard Pluggy', secret: false },
      { key: 'clientSecret', label: 'Client Secret Pluggy', placeholder: 'xxxxxxxx-...', tip: 'Encontrado no Dashboard Pluggy', secret: true },
    ],
  },
};

const FIELD_LABELS = { apiKey: 'API Key', clientId: 'Client ID', clientSecret: 'Client Secret', token: 'Token', endpoint: 'Endpoint', webhookSecret: 'Webhook Secret' };

// Profile packs: suggest connections to configure based on business type
const PROFILE_PACKS = [
  {
    id: 'mei',
    label: 'Sou MEI',
    description: 'Nota fiscal de serviço + cobranças PIX',
    icon: '🏠',
    providers: ['focusnfe', 'asaas'],
    color: 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900',
  },
  {
    id: 'simples',
    label: 'Simples Nacional',
    description: 'NF-e produto/serviço + boleto Inter',
    icon: '🏢',
    providers: ['focusnfe', 'inter'],
    color: 'border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900',
  },
  {
    id: 'ecommerce',
    label: 'E-commerce',
    description: 'NF-e + boleto/PIX + extrato automático',
    icon: '🛒',
    providers: ['focusnfe', 'asaas', 'pluggy'],
    color: 'border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-900',
  },
];

export default function ConexoesPage() {
  const [connections, setConnections] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showConfig, setShowConfig] = useState<any>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showCertUpload, setShowCertUpload] = useState(false);
  const [testing, setTesting] = useState('');
  const [certUploading, setCertUploading] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [testingAll, setTestingAll] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showPrereqs, setShowPrereqs] = useState<string | null>(null);
  const [showBankGuide, setShowBankGuide] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  const [newConn, setNewConn] = useState({ providerKey: '', displayName: '', category: 'outros' });
  const [configForm, setConfigForm] = useState({ apiKey: '', clientId: '', clientSecret: '', token: '', endpoint: '', webhookSecret: '' });
  const [wizardStep, setWizardStep] = useState(1);
  const [showProfilePacks, setShowProfilePacks] = useState(false);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [...prev, { time, message, type }]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [connRes, certRes, checkRes] = await Promise.all([
        apiFetch('/api/pj/connections').then(r => r.json()),
        apiFetch('/api/pj/certificates').then(r => r.json()),
        apiFetch('/api/pj/checklist').then(r => r.json()),
      ]);
      setConnections(connRes.connections || []);
      setCatalog(connRes.catalog || []);
      setCertificates(Array.isArray(certRes) ? certRes : []);
      setChecklist(checkRes);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const handleAddConnection = async () => {
    if (!newConn.providerKey) return;
    const catalogItem = catalog.find((c: any) => c.key === newConn.providerKey);
    const name = newConn.displayName || catalogItem?.name || newConn.providerKey;
    addLog(`Adicionando conexao: ${name}...`);
    await apiFetch('/api/pj/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerKey: newConn.providerKey,
        displayName: name,
        category: catalogItem?.category || newConn.category,
      }),
    });
    addLog(`Conexao "${name}" adicionada com sucesso`, 'success');
    setShowAdd(false);
    setNewConn({ providerKey: '', displayName: '', category: 'outros' });
    load();
  };

  const handleTest = async (id: string) => {
    const conn = connections.find(c => c.id === id);
    setTesting(id);
    addLog(`Testando conexao: ${conn?.displayName || id}...`);
    try {
      const res = await apiFetch(`/api/pj/connections/${id}`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        addLog(`${conn?.displayName}: Conexao OK`, 'success');
      } else {
        addLog(`${conn?.displayName}: ${data.error || 'Falha no teste'}`, data.status === 'atencao' ? 'warn' : 'error');
      }
    } catch {
      addLog(`${conn?.displayName}: Erro ao testar`, 'error');
    }
    await load();
    setTesting('');
  };

  const handleTestAll = async () => {
    if (connections.length === 0) return;
    setTestingAll(true);
    setShowLogs(true);
    addLog(`Iniciando teste de todas as ${connections.length} conexoes...`);
    let ok = 0, fail = 0;
    for (const conn of connections) {
      setTesting(conn.id);
      addLog(`Testando: ${conn.displayName}...`);
      try {
        const res = await apiFetch(`/api/pj/connections/${conn.id}`, { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') { ok++; addLog(`${conn.displayName}: OK`, 'success'); }
        else { fail++; addLog(`${conn.displayName}: ${data.error || 'Falha'}`, 'error'); }
      } catch { fail++; addLog(`${conn.displayName}: Erro de rede`, 'error'); }
    }
    setTesting('');
    addLog(`Teste concluido: ${ok} OK, ${fail} com falha`, fail > 0 ? 'warn' : 'success');
    await load();
    setTestingAll(false);
  };

  const handleDelete = async (id: string) => {
    const conn = connections.find(c => c.id === id);
    if (!confirm('Remover esta conexao?')) return;
    addLog(`Removendo conexao: ${conn?.displayName || id}`, 'warn');
    await apiFetch(`/api/pj/connections/${id}`, { method: 'DELETE' });
    addLog(`Conexao removida`, 'info');
    load();
  };

  const handleSaveConfig = async () => {
    if (!showConfig) return;
    const config: any = {};
    if (configForm.apiKey) config.apiKey = configForm.apiKey;
    if (configForm.clientId) config.clientId = configForm.clientId;
    if (configForm.clientSecret) config.clientSecret = configForm.clientSecret;
    if (configForm.token) config.token = configForm.token;
    if (configForm.endpoint) config.endpoint = configForm.endpoint;
    if (configForm.webhookSecret) config.webhookSecret = configForm.webhookSecret;
    addLog(`Salvando credenciais de ${showConfig.displayName}...`);
    await apiFetch(`/api/pj/connections/${showConfig.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
    addLog(`Credenciais de ${showConfig.displayName} salvas`, 'success');
    setShowConfig(null);
    load();
  };

  const openConfig = (conn: any) => {
    const cfg = conn.config || {};
    setConfigForm({
      apiKey: cfg.apiKey || '',
      clientId: cfg.clientId || '',
      clientSecret: cfg.clientSecret || '',
      token: cfg.token || '',
      endpoint: cfg.endpoint || '',
      webhookSecret: cfg.webhookSecret || '',
    });
    // Start at step 1 for unconfigured, step 3 (credentials) for already configured
    const hasCredentials = !!(cfg.apiKey || cfg.token || cfg.clientId);
    setWizardStep(hasCredentials ? 3 : 1);
    setShowConfig(conn);
  };

  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertUploading(true);
    addLog(`Enviando certificado: ${file.name}...`);
    try {
      const presignedRes = await apiFetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/x-pkcs12', isPublic: false }),
      });
      const { uploadUrl, cloudStoragePath, headers: uploadHeaders } = await presignedRes.json();

      const hdr: Record<string, string> = { 'Content-Type': file.type || 'application/x-pkcs12' };
      if (uploadHeaders?.['Content-Disposition']) hdr['Content-Disposition'] = uploadHeaders['Content-Disposition'];
      await fetch(uploadUrl, { method: 'PUT', headers: hdr, body: file });

      await apiFetch('/api/pj/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, cloudPath: cloudStoragePath, expiresAt: null, cnpj: null }),
      });
      addLog(`Certificado "${file.name}" enviado com sucesso`, 'success');
      setShowCertUpload(false);
      load();
    } catch (err) {
      console.error('Upload error:', err);
      addLog(`Erro ao enviar certificado: ${file.name}`, 'error');
    } finally {
      setCertUploading(false);
    }
  };

  const handleDeleteCert = async (id: string) => {
    if (!confirm('Remover este certificado?')) return;
    await apiFetch(`/api/pj/certificates/${id}`, { method: 'DELETE' });
    addLog('Certificado removido', 'warn');
    load();
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Group connections by category
  const grouped: Record<string, any[]> = {};
  connections.forEach(c => {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  });

  const summaryOk = connections.filter(c => c.status === 'ok').length;
  const summaryWarn = connections.filter(c => c.status === 'atencao').length;
  const summaryErr = connections.filter(c => c.status === 'erro').length;
  const summaryPending = connections.filter(c => c.status === 'pendente').length;
  const certNearExpiry = certificates.filter(c => {
    if (!c.expiresAt) return false;
    const diff = new Date(c.expiresAt).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
  }).length;

  // Filter connections by search
  const filteredGrouped: Record<string, any[]> = {};
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    Object.entries(grouped).forEach(([cat, items]) => {
      const f = items.filter(c => c.displayName.toLowerCase().includes(q) || c.providerKey.toLowerCase().includes(q));
      if (f.length) filteredGrouped[cat] = f;
    });
  } else {
    Object.assign(filteredGrouped, grouped);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        </div>
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Conexoes</h1>
          <p className="text-muted-foreground mt-1">Gerencie integracoes externas, certificados e provedores</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowChecklist(!showChecklist)} className="gap-2" size="sm">
            <Shield className="w-4 h-4" /> Checklist
          </Button>
          <Button variant="outline" onClick={() => setShowCertUpload(true)} className="gap-2" size="sm">
            <Upload className="w-4 h-4" /> Certificado
          </Button>
          <Button variant="outline" onClick={() => setShowLogs(!showLogs)} className="gap-2" size="sm">
            <Activity className="w-4 h-4" /> Logs {logs.length > 0 && <span className="ml-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full">{logs.length}</span>}
          </Button>
          <Button onClick={() => setShowAdd(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2" size="sm">
            <Plus className="w-4 h-4" /> Nova Conexao
          </Button>
        </div>
      </div>

      {/* Profile Packs — quick setup by business type */}
      {connections.length === 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Configuração rápida por perfil</p>
            <button onClick={() => setShowProfilePacks(v => !v)} className="text-xs text-muted-foreground hover:text-foreground">
              {showProfilePacks ? 'ocultar' : 'ver opções'}
            </button>
          </div>
          {(!showProfilePacks ? (
            <p className="text-xs text-muted-foreground">Escolha seu perfil e veja quais integrações ativar primeiro.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PROFILE_PACKS.map(pack => {
                const missing = pack.providers.filter(p => !connections.some((c: any) => c.providerKey === p));
                const configured = pack.providers.length - missing.length;
                return (
                  <div key={pack.id} className={`rounded-xl border p-4 space-y-2 ${pack.color}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{pack.icon}</span>
                      <div>
                        <p className="font-semibold text-sm">{pack.label}</p>
                        <p className="text-xs text-muted-foreground">{pack.description}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {pack.providers.map(p => {
                        const isConfigured = connections.some((c: any) => c.providerKey === p);
                        const catalogItem = catalog.find((c: any) => c.key === p);
                        return (
                          <div key={p} className="flex items-center justify-between text-xs">
                            <span className={isConfigured ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                              {isConfigured ? '✓' : '○'} {catalogItem?.name || p}
                            </span>
                            {!isConfigured && (
                              <button
                                onClick={async () => {
                                  const item = catalog.find((c: any) => c.key === p);
                                  if (!item) return;
                                  const res = await apiFetch('/api/pj/connections', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ providerKey: p, displayName: item.name, category: item.category }),
                                  });
                                  if (res.ok) { await load(); addLog(`Conexão "${item.name}" adicionada`, 'success'); }
                                }}
                                className="text-blue-600 hover:underline"
                              >
                                + Adicionar
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">{configured}/{pack.providers.length} configurados</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Plug className="w-8 h-8 text-blue-500" />
          <div><p className="text-2xl font-bold">{connections.length}</p><p className="text-xs text-muted-foreground">Total</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
          <div><p className="text-2xl font-bold text-green-600">{summaryOk}</p><p className="text-xs text-muted-foreground">Ativos</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <div><p className="text-2xl font-bold text-amber-600">{summaryWarn}</p><p className="text-xs text-muted-foreground">Atencao</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <XCircle className="w-8 h-8 text-red-500" />
          <div><p className="text-2xl font-bold text-red-600">{summaryErr}</p><p className="text-xs text-muted-foreground">Erro</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <FileText className="w-8 h-8 text-purple-500" />
          <div><p className="text-2xl font-bold">{certificates.length}</p><p className="text-xs text-muted-foreground">Certificados{certNearExpiry > 0 && <span className="text-amber-500 ml-1">({certNearExpiry} expirando)</span>}</p></div>
        </CardContent></Card>
      </div>

      {/* Search + Test All */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conexoes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          onClick={handleTestAll}
          disabled={testingAll || connections.length === 0}
          className="gap-2 whitespace-nowrap"
        >
          {testingAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          Testar Todas ({connections.length})
        </Button>
      </div>

      {/* Activity Logs */}
      {showLogs && logs.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2"><Activity className="w-4 h-4" /> Log de Atividades</div>
              <Button variant="ghost" size="sm" onClick={() => setLogs([])} className="text-xs h-7">Limpar</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-40 overflow-y-auto space-y-1 text-xs font-mono">
              {logs.map((log, i) => (
                <div key={i} className={`flex gap-2 py-0.5 ${
                  log.type === 'error' ? 'text-red-600 dark:text-red-400' :
                  log.type === 'success' ? 'text-green-600 dark:text-green-400' :
                  log.type === 'warn' ? 'text-amber-600 dark:text-amber-400' :
                  'text-muted-foreground'
                }`}>
                  <span className="text-muted-foreground shrink-0">[{log.time}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pre-requisites Panel */}
      {showPrereqs && OPERATION_PREREQS[showPrereqs] && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-500" />
                Pre-requisitos: {OPERATION_PREREQS[showPrereqs].title}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowPrereqs(null)} className="h-7 text-xs">Fechar</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {OPERATION_PREREQS[showPrereqs].items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Pre-emit Checklist */}
      {showChecklist && checklist && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />
                Checklist Pre-Emissao
              </div>
              <span className="text-sm font-normal px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                {checklist.summary?.percentage || 0}% completo
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(checklist.checklist || {}).map(([key, item]: [string, any]) => (
                <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  {item.ok
                    ? <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    : <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                  }
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {item.label}
                      {item.optional && <span className="text-xs text-muted-foreground ml-2">(opcional)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Certificates Section */}
      {certificates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="w-5 h-5" />
              Certificados Digitais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {certificates.map((cert: any) => {
                const expired = cert.expiresAt ? new Date(cert.expiresAt) < new Date() : false;
                const nearExpiry = !expired && cert.expiresAt ? (new Date(cert.expiresAt).getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000 : false;
                return (
                  <div key={cert.id} className={`flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors ${
                    expired ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800' :
                    nearExpiry ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800' :
                    'bg-muted/50'
                  }`}>
                    <div className="flex items-center gap-3">
                      <FileText className={`w-5 h-5 ${expired ? 'text-red-500' : nearExpiry ? 'text-amber-500' : 'text-purple-500'}`} />
                      <div>
                        <p className="font-medium text-sm">{cert.fileName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {cert.cnpj && <span className="text-xs text-muted-foreground">CNPJ: {cert.cnpj}</span>}
                          {cert.expiresAt && (
                            <span className={`text-xs font-medium ${
                              expired ? 'text-red-500' : nearExpiry ? 'text-amber-500' : 'text-green-600'
                            }`}>
                              {expired ? 'EXPIRADO' : nearExpiry ? 'EXPIRA EM BREVE' : 'Valido'} - {new Date(cert.expiresAt).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteCert(cert.id)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pre-requisites Shortcuts */}
      {Object.keys(OPERATION_PREREQS).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground self-center mr-1">Pre-requisitos:</span>
          {Object.entries(OPERATION_PREREQS).map(([key, val]) => (
            <Button key={key} variant={showPrereqs === key ? 'default' : 'outline'} size="sm" onClick={() => setShowPrereqs(showPrereqs === key ? null : key)} className="text-xs h-7">
              <Info className="w-3 h-3 mr-1" /> {val.title}
            </Button>
          ))}
        </div>
      )}

      {/* Connections by Category */}
      {Object.keys(CATEGORY_LABELS).map(cat => {
        const items = filteredGrouped[cat];
        if (!items || items.length === 0) return null;
        const collapsed = collapsedCats.has(cat);
        const catOk = items.filter(c => c.status === 'ok').length;
        const catErr = items.filter(c => c.status === 'erro').length;
        return (
          <Card key={cat}>
            <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleCategory(cat)}>
              <CardTitle className="flex items-center justify-between text-lg">
                <div className="flex items-center gap-2">
                  {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  {CATEGORY_LABELS[cat]}
                  <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
                </div>
                <div className="flex items-center gap-2">
                  {catOk > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{catOk} ok</span>}
                  {catErr > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{catErr} erro</span>}
                </div>
              </CardTitle>
            </CardHeader>
            {!collapsed && (
              <CardContent>
                <div className="space-y-2">
                  {items.map((conn: any) => {
                    const st = STATUS_CONFIG[conn.status] || STATUS_CONFIG.pendente;
                    const Icon = st.icon;
                    return (
                      <div key={conn.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className="w-5 h-5 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{conn.displayName}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                              <span className="text-xs text-muted-foreground">{conn.providerKey}</span>
                              {conn.lastHealthAt && (
                                <span className="text-xs text-muted-foreground">
                                  Testado: {new Date(conn.lastHealthAt).toLocaleString('pt-BR')}
                                </span>
                              )}
                            </div>
                            {conn.lastError && <p className="text-xs text-red-500 mt-1 truncate">{conn.lastError}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon-sm" onClick={() => openConfig(conn)} title="Configurar">
                            <Settings className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleTest(conn.id)} disabled={testing === conn.id || testingAll} title="Testar">
                            {testing === conn.id
                              ? <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                              : <Zap className="w-4 h-4 text-amber-500" />
                            }
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(conn.id)} title="Remover">
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {connections.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Plug className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma conexao configurada</h3>
            <p className="text-muted-foreground mb-4">Adicione integracoes com provedores de NF-e, boletos, bancos e mais.</p>
            <Button onClick={() => setShowAdd(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Adicionar Primeira Conexao
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add Connection Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5" />Nova Conexao</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Provedor</Label>
              <select
                value={newConn.providerKey}
                onChange={e => {
                  const item = catalog.find((c: any) => c.key === e.target.value);
                  setNewConn({ providerKey: e.target.value, displayName: item?.name || '', category: item?.category || 'outros' });
                }}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
              >
                <option value="">Selecione um provedor...</option>
                {Object.keys(CATEGORY_LABELS).map(cat => {
                  const items = catalog.filter((c: any) => c.category === cat);
                  if (items.length === 0) return null;
                  return (
                    <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                      {items.map((item: any) => (
                        <option key={item.key} value={item.key}>{item.name} - {item.description}</option>
                      ))}
                    </optgroup>
                  );
                })}
                <option value="custom">Outro (personalizado)</option>
              </select>
            </div>
            {newConn.providerKey === 'custom' && (
              <>
                <div><Label>Nome do Provedor</Label><Input value={newConn.displayName} onChange={e => setNewConn({ ...newConn, displayName: e.target.value })} placeholder="Ex: Meu Provedor" /></div>
                <div><Label>Categoria</Label><select value={newConn.category} onChange={e => setNewConn({ ...newConn, category: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground">{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowAdd(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleAddConnection} disabled={!newConn.providerKey} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">Adicionar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Config Dialog — Step Wizard */}
      <Dialog open={!!showConfig} onOpenChange={() => setShowConfig(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configurar {showConfig?.displayName}
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-1 my-2">
            {[1, 2, 3, 4].map(step => (
              <div key={step} className="flex items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  wizardStep === step ? 'bg-primary text-primary-foreground' : wizardStep > step ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  {wizardStep > step ? <Check className="w-3.5 h-3.5" /> : step}
                </div>
                {step < 4 && <div className={`h-0.5 w-8 rounded ${wizardStep > step ? 'bg-green-500' : 'bg-muted'}`} />}
              </div>
            ))}
            <div className="ml-2 text-xs text-muted-foreground">
              {wizardStep === 1 ? 'O que faz' : wizardStep === 2 ? 'Como obter' : wizardStep === 3 ? 'Credenciais' : 'Testar'}
            </div>
          </div>

          {(() => {
            const wizard = showConfig ? PROVIDER_WIZARD[showConfig.providerKey] : null;

            // Step 1 — What does this do?
            if (wizardStep === 1) return (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
                  <p className="text-sm leading-relaxed text-blue-900 dark:text-blue-200">
                    {wizard?.what || `Integração com ${showConfig?.displayName}. Configure as credenciais de acesso para ativar.`}
                  </p>
                </div>
                {wizard?.features && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">O QUE VOCÊ GANHA:</p>
                    <ul className="space-y-1.5">
                      {wizard.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setShowConfig(null)} className="flex-1">Cancelar</Button>
                  <Button onClick={() => setWizardStep(2)} className="flex-1">Próximo →</Button>
                </div>
              </div>
            );

            // Step 2 — How to get credentials
            if (wizardStep === 2) return (
              <div className="space-y-4">
                <p className="text-sm font-medium">Siga os passos para obter as credenciais:</p>
                {wizard?.credSteps ? (
                  <ol className="space-y-3">
                    {wizard.credSteps.map((step, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">Consulte a documentação do provedor para obter as credenciais.</p>
                )}
                {wizard?.credLink && (
                  <a href={wizard.credLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline font-medium">
                    <ExternalLink className="w-4 h-4" /> Abrir portal do provedor
                  </a>
                )}
                {(!wizard || !wizard.credLink) && showConfig?.category === 'boleto' && (
                  <button onClick={() => setShowBankGuide('generic')} className="text-sm text-blue-600 underline hover:no-underline">
                    Ver guia de credenciais por banco
                  </button>
                )}
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setWizardStep(1)} className="flex-1">← Voltar</Button>
                  <Button onClick={() => setWizardStep(3)} className="flex-1">Tenho as credenciais →</Button>
                </div>
              </div>
            );

            // Step 3 — Enter credentials
            if (wizardStep === 3) {
              const fields = wizard?.fields || [
                { key: 'apiKey' as const, label: 'API Key', placeholder: 'sk_live_...', tip: 'Chave de acesso à API', secret: true },
                { key: 'clientId' as const, label: 'Client ID', placeholder: '', tip: 'Identificador da aplicação', secret: false },
                { key: 'clientSecret' as const, label: 'Client Secret', placeholder: '', tip: 'Segredo da aplicação', secret: true },
                { key: 'token' as const, label: 'Token', placeholder: '', tip: 'Token de acesso', secret: true },
              ];
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg text-xs text-green-700 dark:text-green-400">
                    <Shield className="w-4 h-4 flex-shrink-0" />
                    As credenciais são criptografadas com AES-256 antes de armazenar.
                  </div>
                  {fields.map(field => (
                    <div key={field.key}>
                      <Label className="flex items-center gap-1">{field.label}</Label>
                      <Input
                        type={field.secret ? 'password' : 'text'}
                        value={configForm[field.key]}
                        onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                        placeholder={field.placeholder}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-0.5">{field.tip}</p>
                    </div>
                  ))}
                  {!wizard && (
                    <>
                      <div><Label>Endpoint (opcional)</Label><Input value={configForm.endpoint} onChange={e => setConfigForm({ ...configForm, endpoint: e.target.value })} placeholder="https://api.provedor.com/v1" /></div>
                      <div><Label>Webhook Secret (opcional)</Label><Input type="password" value={configForm.webhookSecret} onChange={e => setConfigForm({ ...configForm, webhookSecret: e.target.value })} placeholder="whsec_..." /></div>
                    </>
                  )}
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => setWizardStep(2)} className="flex-1">← Voltar</Button>
                    <Button onClick={async () => { await handleSaveConfig(); setWizardStep(4); }} className="flex-1">Salvar e Testar →</Button>
                  </div>
                </div>
              );
            }

            // Step 4 — Test
            return (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="font-semibold">Credenciais salvas!</p>
                  <p className="text-sm text-muted-foreground mt-1">Clique abaixo para testar a conexão com o provedor.</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowConfig(null)} className="flex-1">Fechar</Button>
                  <Button
                    onClick={async () => {
                      if (showConfig) await handleTest(showConfig.id);
                      setShowConfig(null);
                    }}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Zap className="w-4 h-4 mr-2" />Testar Conexão
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Certificate Upload Dialog */}
      <Dialog open={showCertUpload} onOpenChange={setShowCertUpload}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Shield className="w-5 h-5" />Upload de Certificado Digital</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Faca upload do certificado digital A1 (.pfx) da empresa.
              O certificado e armazenado de forma segura e criptografada.
            </p>
            <div className="border-2 border-dashed border-input rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
              {certUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">Enviando certificado...</p>
                </div>
              ) : (
                <>
                  <Shield className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <label className="cursor-pointer">
                    <span className="text-sm text-blue-600 hover:text-blue-700 font-medium">Selecionar arquivo .pfx</span>
                    <input type="file" className="hidden" accept=".pfx,.p12" onChange={handleCertUpload} />
                  </label>
                  <p className="text-xs text-muted-foreground mt-2">Formatos aceitos: .pfx, .p12</p>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bank Credential Guide Dialog */}
      <Dialog open={!!showBankGuide} onOpenChange={() => setShowBankGuide(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Info className="w-5 h-5 text-blue-600" />Guia de Credenciais Bancarias</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Selecione seu banco para ver o passo a passo de como obter as credenciais de API:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(BANK_CREDENTIAL_GUIDE).map(([key, bank]) => (
                <button key={key} onClick={() => setShowBankGuide(key)}
                  className={`text-xs p-2 rounded-lg border text-left transition-colors ${showBankGuide === key ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'hover:border-blue-300'}`}>
                  {bank.name}
                </button>
              ))}
            </div>
            {showBankGuide && BANK_CREDENTIAL_GUIDE[showBankGuide] && (
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-semibold text-sm">{BANK_CREDENTIAL_GUIDE[showBankGuide].name}</h4>
                <ol className="list-decimal list-inside text-sm space-y-1.5">
                  {BANK_CREDENTIAL_GUIDE[showBankGuide].steps.map((step, i) => (
                    <li key={i} className="text-muted-foreground">{step}</li>
                  ))}
                </ol>
                {BANK_CREDENTIAL_GUIDE[showBankGuide].link && (
                  <a href={BANK_CREDENTIAL_GUIDE[showBankGuide].link} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2">
                    <ExternalLink className="w-3 h-3" />Acessar portal do desenvolvedor
                  </a>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
