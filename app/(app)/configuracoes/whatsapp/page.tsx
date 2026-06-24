'use client';
import { apiFetch } from '@/lib/fetch';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bell, CheckCircle, Copy, ExternalLink, MessageCircle, QrCode, RefreshCw, Send, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';


type Provider = 'evolution' | 'meta';

const STEPS_EVOLUTION = [
  { id: 1, title: 'Instale o Evolution API', desc: 'Servidor gratuito que conecta ao WhatsApp. Rode com Docker ou use um serviço hospedado.' },
  { id: 2, title: 'Configure as credenciais', desc: 'Informe a URL do servidor e a API Key definida na instalação.' },
  { id: 3, title: 'Escaneie o QR Code', desc: 'Abra o WhatsApp no celular → Aparelhos Conectados → Conectar aparelho → Escaneie o QR.' },
];

const STEPS_META = [
  { id: 1, title: 'Crie uma conta Business no Meta', desc: 'Acesse developers.facebook.com e crie um app do tipo Business.' },
  { id: 2, title: 'Adicione o produto WhatsApp', desc: 'No seu app, adicione WhatsApp Business API e anote o Phone Number ID.' },
  { id: 3, title: 'Configure credenciais', desc: 'Cole o Phone Number ID e o Access Token permanente gerado no painel.' },
];

export default function WhatsAppConfigPage() {
  const [provider, setProvider] = useState<Provider>('evolution');
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState('🤖 Teste de conexão WNR Finance!');
  const [testSending, setTestSending] = useState(false);

  // Evolution form
  const [evoForm, setEvoForm] = useState({ apiUrl: 'http://localhost:8080', apiKey: '', instanceName: 'wnr-finance' });
  // Meta form
  const [metaForm, setMetaForm] = useState({ phoneNumberId: '', accessToken: '', webhookToken: 'wnr_' + Math.random().toString(36).slice(2, 8) });

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch('/api/whatsapp/session');
    if (res.ok) {
      const data = await res.json();
      setStatus(data);
      if (data.configured) setProvider(data.provider || 'evolution');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = provider === 'evolution'
        ? { provider: 'evolution', ...evoForm }
        : { provider: 'meta', ...metaForm };

      const res = await apiFetch('/api/whatsapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Configuração salva!');
        await loadStatus();
        if (provider === 'evolution') {
          await fetchQR();
        }
      } else {
        toast.error(data.error || 'Erro ao salvar');
      }
    } catch { toast.error('Erro de conexão'); }
    setSaving(false);
  };

  const fetchQR = async () => {
    setQrLoading(true);
    setQrCode(null);
    try {
      const res = await apiFetch('/api/whatsapp/qr');
      const data = await res.json();
      if (data.qr) setQrCode(data.qr);
      await loadStatus();
    } catch {}
    setQrLoading(false);
  };

  const handleDisconnect = async () => {
    if (!confirm('Desconectar o WhatsApp?')) return;
    await apiFetch('/api/whatsapp/session', { method: 'DELETE' });
    setStatus({ configured: false });
    setQrCode(null);
    toast.success('WhatsApp desconectado');
  };

  const handleTestSend = async () => {
    if (!testTo) { toast.error('Informe o número para teste'); return; }
    setTestSending(true);
    const res = await apiFetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: testTo.replace(/\D/g, ''), message: testMsg }),
    });
    const data = await res.json();
    if (data.ok) toast.success('Mensagem enviada!');
    else toast.error(data.error || 'Erro ao enviar');
    setTestSending(false);
  };

  const isConnected = status?.isActive && status?.status === 'connected';
  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp` : '/api/webhooks/whatsapp';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><MessageCircle className="w-6 h-6 text-green-600" />WhatsApp Business</h1>
        <p className="text-muted-foreground mt-1">Receba alertas e confirme pagamentos diretamente pelo WhatsApp</p>
      </div>

      {/* Status Card */}
      <Card className={isConnected ? 'border-green-300 dark:border-green-700' : ''}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isConnected
                ? <><CheckCircle className="w-5 h-5 text-green-600" /><div><p className="font-medium text-green-700 dark:text-green-400">Conectado</p><p className="text-xs text-muted-foreground">{status?.phoneNumber || 'WhatsApp ativo'} · {status?.provider === 'evolution' ? 'Evolution API' : 'Meta Cloud API'}</p></div></>
                : status?.configured
                  ? <><RefreshCw className="w-5 h-5 text-amber-500" /><div><p className="font-medium">Aguardando conexão</p><p className="text-xs text-muted-foreground">Escaneie o QR Code para conectar</p></div></>
                  : <><WifiOff className="w-5 h-5 text-muted-foreground" /><div><p className="font-medium">Não configurado</p><p className="text-xs text-muted-foreground">Configure abaixo para começar</p></div></>
              }
            </div>
            {isConnected && (
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="text-red-600 border-red-200">Desconectar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* What you get */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" />O que você ganha</CardTitle></CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            {[
              { icon: '🔔', title: 'Alertas automáticos', desc: 'Notificação antes do vencimento de contas a pagar' },
              { icon: '✅', title: 'Confirmação rápida', desc: 'Responda "Paguei" + comprovante e o sistema registra' },
              { icon: '📋', title: 'Lista de pendências', desc: 'Peça "listar" e veja todas as contas dos próximos 7 dias' },
            ].map(f => (
              <div key={f.title} className="p-3 bg-muted/50 rounded-xl">
                <p className="text-xl mb-1">{f.icon}</p>
                <p className="font-medium">{f.title}</p>
                <p className="text-muted-foreground text-xs mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Provider selector */}
      {!isConnected && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Escolha o provedor</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <button onClick={() => setProvider('evolution')}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${provider === 'evolution' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-border hover:border-muted-foreground'}`}>
                  <p className="font-semibold flex items-center gap-2">🐋 Evolution API <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400 px-2 py-0.5 rounded-full">Recomendado</span></p>
                  <p className="text-xs text-muted-foreground mt-1">Grátis · Self-hosted · Qualquer número · Docker em 5 min</p>
                </button>
                <button onClick={() => setProvider('meta')}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${provider === 'meta' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-border hover:border-muted-foreground'}`}>
                  <p className="font-semibold">📘 Meta Cloud API</p>
                  <p className="text-xs text-muted-foreground mt-1">Oficial Meta · 1.000 conv/mês grátis · Requer aprovação</p>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Steps */}
          <Card>
            <CardHeader><CardTitle className="text-base">Passo a passo — {provider === 'evolution' ? 'Evolution API' : 'Meta Cloud API'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {(provider === 'evolution' ? STEPS_EVOLUTION : STEPS_META).map((step, i) => (
                <div key={step.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">{step.id}</div>
                  <div>
                    <p className="font-medium text-sm">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                    {step.id === 1 && provider === 'evolution' && (
                      <div className="mt-2 bg-muted rounded-lg p-3 font-mono text-xs text-green-400 overflow-x-auto">
                        docker run -d --name evolution \<br />
                        {'  '}-p 8080:8080 \<br />
                        {'  '}-e AUTHENTICATION_API_KEY=minha_chave_secreta \<br />
                        {'  '}atendai/evolution-api:latest
                      </div>
                    )}
                    {step.id === 1 && provider === 'meta' && (
                      <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        Acessar Meta Developers <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Form */}
          <Card>
            <CardHeader><CardTitle className="text-base">Credenciais</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {provider === 'evolution' ? (
                <>
                  <div><Label>URL do servidor Evolution</Label><Input value={evoForm.apiUrl} onChange={e => setEvoForm(p => ({ ...p, apiUrl: e.target.value }))} placeholder="http://localhost:8080" className="mt-1 font-mono text-sm" /></div>
                  <div><Label>API Key</Label><Input type="password" value={evoForm.apiKey} onChange={e => setEvoForm(p => ({ ...p, apiKey: e.target.value }))} placeholder="minha_chave_secreta" className="mt-1" /></div>
                  <div><Label>Nome da instância</Label><Input value={evoForm.instanceName} onChange={e => setEvoForm(p => ({ ...p, instanceName: e.target.value }))} placeholder="wnr-finance" className="mt-1" /></div>
                </>
              ) : (
                <>
                  <div><Label>Phone Number ID</Label><Input value={metaForm.phoneNumberId} onChange={e => setMetaForm(p => ({ ...p, phoneNumberId: e.target.value }))} placeholder="123456789012345" className="mt-1 font-mono" /></div>
                  <div><Label>Access Token (permanente)</Label><Input type="password" value={metaForm.accessToken} onChange={e => setMetaForm(p => ({ ...p, accessToken: e.target.value }))} placeholder="EAAxxxxxxxxx..." className="mt-1" /></div>
                  <div>
                    <Label>Webhook Verify Token</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={metaForm.webhookToken} readOnly className="font-mono text-sm flex-1" />
                      <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(metaForm.webhookToken); toast.success('Copiado!'); }}><Copy className="w-4 h-4" /></Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Use este token ao registrar o webhook no Meta</p>
                  </div>
                  <div>
                    <Label>URL do Webhook</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={webhookUrl} readOnly className="font-mono text-xs flex-1" />
                      <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('Copiado!'); }}><Copy className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </>
              )}
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? 'Salvando...' : 'Salvar e Conectar'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* QR Code for Evolution */}
      {status?.configured && provider === 'evolution' && !isConnected && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><QrCode className="w-4 h-4" />Escanear QR Code</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {qrCode ? (
              <img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code WhatsApp" className="w-56 h-56 rounded-xl border" />
            ) : (
              <div className="w-56 h-56 bg-muted rounded-xl flex items-center justify-center text-muted-foreground">
                {qrLoading ? <RefreshCw className="w-8 h-8 animate-spin" /> : <QrCode className="w-16 h-16" />}
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center">
              Abra o WhatsApp → Aparelhos Conectados → Conectar aparelho
            </p>
            <Button onClick={fetchQR} disabled={qrLoading} variant="outline">
              <RefreshCw className={`w-4 h-4 mr-2 ${qrLoading ? 'animate-spin' : ''}`} />
              {qrCode ? 'Atualizar QR' : 'Gerar QR Code'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Test message */}
      {isConnected && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Send className="w-4 h-4" />Testar envio</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Número de destino (com DDD)</Label><Input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="11999990000" className="mt-1" /></div>
            <div><Label>Mensagem</Label><Input value={testMsg} onChange={e => setTestMsg(e.target.value)} className="mt-1" /></div>
            <Button onClick={handleTestSend} disabled={testSending}>
              {testSending ? 'Enviando...' : 'Enviar mensagem de teste'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cron info */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" />Alertas automáticos</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
              <p className="font-medium text-xs">📅 Lembrete diário</p>
              <p className="text-xs text-muted-foreground">Envia alerta de contas vencendo hoje e nos próximos 3 dias. Executa todo dia às 8h.</p>
              <code className="text-[10px] text-muted-foreground">/api/cron/whatsapp-reminders</code>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
              <p className="font-medium text-xs">📊 Resumo semanal inteligente</p>
              <p className="text-xs text-muted-foreground">Resumo com saldo projetado, totais da semana e itens vencidos. Executa toda segunda às 8h.</p>
              <code className="text-[10px] text-muted-foreground">/api/cron/whatsapp-smart-summary</code>
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 space-y-3">
            <p className="font-medium text-xs">Configurar agendador:</p>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Vercel Cron (vercel.json):</p>
              <pre className="text-[10px] bg-muted text-green-400 p-2 rounded overflow-x-auto">{`{"crons":[
  {"path":"/api/cron/whatsapp-reminders","schedule":"0 11 * * *"},
  {"path":"/api/cron/whatsapp-smart-summary","schedule":"0 11 * * 1"}
]}`}</pre>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Crontab Linux:</p>
              <pre className="text-[10px] bg-muted text-green-400 p-2 rounded overflow-x-auto">{`# Lembrete diário 8h BRT
0 11 * * * curl -X POST https://seudominio.com/api/cron/whatsapp-reminders -H "Authorization: Bearer SEU_SECRET"
# Resumo semanal toda segunda
0 11 * * 1 curl -X POST https://seudominio.com/api/cron/whatsapp-smart-summary -H "Authorization: Bearer SEU_SECRET"`}</pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
