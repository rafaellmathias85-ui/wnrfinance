'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import {
  ArrowLeft, CheckCircle, AlertCircle, Loader2, ExternalLink, Shield, Link2, Info, Save,
} from 'lucide-react';

interface IntegrationStatus {
  configured: boolean;
  healthy: boolean;
  error: string | null;
  docsUrl: string;
  signupUrl: string;
  envVarsRequired: string[];
}

interface StatusResponse {
  integrations: { pluggy: IntegrationStatus };
}

interface PluggyCredentialResponse {
  configured: boolean;
  healthy: boolean;
  error: string | null;
  connection: null | {
    id: string;
    status: string;
    lastHealthAt: string | null;
    lastError: string | null;
    clientId: string;
    clientSecretMasked: string | null;
    hasClientSecret: boolean;
  };
}

export default function IntegracoesPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [pluggyCredentials, setPluggyCredentials] = useState<PluggyCredentialResponse | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [savingPluggy, setSavingPluggy] = useState(false);
  const [pluggyMessage, setPluggyMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPluggyStatus();
  }, []);

  const loadPluggyStatus = async () => {
    setLoading(true);
    try {
      const [statusRes, pluggyRes] = await Promise.all([
        apiFetch('/api/integrations/status'),
        apiFetch('/api/integrations/pluggy'),
      ]);
      const statusData = await statusRes.json();
      const pluggyData = await pluggyRes.json();
      setData(statusData);
      if (pluggyRes.ok) {
        setPluggyCredentials(pluggyData);
        setClientId(pluggyData.connection?.clientId || '');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSavePluggy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPluggy(true);
    setPluggyMessage('');
    try {
      const res = await apiFetch('/api/integrations/pluggy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Erro ao salvar credenciais Pluggy');
      setPluggyCredentials(payload);
      setClientId(payload.connection?.clientId || clientId);
      setClientSecret('');
      setPluggyMessage(payload.healthy ? 'Credenciais salvas e autenticadas com sucesso.' : 'Credenciais salvas, mas a Pluggy retornou erro no teste.');
      setData(prev => prev ? {
        integrations: {
          ...prev.integrations,
          pluggy: {
            ...prev.integrations.pluggy,
            configured: payload.configured,
            healthy: payload.healthy,
            error: payload.error,
          },
        },
      } : prev);
    } catch (err: any) {
      setPluggyMessage(err.message || 'Erro ao salvar credenciais Pluggy');
    } finally {
      setSavingPluggy(false);
    }
  };

  const pluggy = pluggyCredentials || data?.integrations?.pluggy;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link href="/configuracoes" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar para Configurações
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-muted-foreground mt-1">Gerencie integrações com provedores externos (Open Finance, contabilidade, etc).</p>
      </div>

      {/* Transparency banner */}
      <div className="p-4 rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <p className="font-semibold mb-1">Transparência sobre conexão bancária</p>
            <p>Atualmente o sistema permite duas formas de adicionar contas bancárias:</p>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li><strong>Cadastro manual</strong> (sempre disponível): você informa banco, agência, conta e saldo inicial. Lançamentos são inseridos manualmente.</li>
              <li><strong>Open Finance via Pluggy</strong> (requer configuração): conexão real com o banco, com autorização OAuth e sincronização automática de extratos, cartões e investimentos.</li>
            </ol>
            <p className="mt-2">Até que Open Finance esteja configurado, <strong>todos os bancos cadastrados são manuais</strong> — não há sincronização automática com o banco real.</p>
          </div>
        </div>
      </div>

      {/* Pluggy card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" /> Pluggy — Open Finance Brasil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSavePluggy} className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="pluggy-client-id">Client ID</label>
                <Input
                  id="pluggy-client-id"
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="pluggy-client-secret">Client Secret</label>
                <Input
                  id="pluggy-client-secret"
                  type="password"
                  value={clientSecret}
                  onChange={e => setClientSecret(e.target.value)}
                  placeholder={pluggyCredentials?.connection?.clientSecretMasked || 'Cole o Client Secret'}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={savingPluggy || !clientId.trim() || (!clientSecret.trim() && !pluggyCredentials?.connection?.hasClientSecret)}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {savingPluggy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar e testar Pluggy
              </Button>
              {pluggyCredentials?.connection?.hasClientSecret && (
                <span className="text-xs text-muted-foreground">Client Secret salvo: {pluggyCredentials.connection.clientSecretMasked}</span>
              )}
            </div>
            {pluggyMessage && (
              <p className={`text-sm ${pluggyCredentials?.healthy ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                {pluggyMessage}
              </p>
            )}
          </form>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Verificando status...</div>
          ) : pluggy?.configured ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {pluggy.healthy ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1 rounded-full">
                    <CheckCircle className="w-3.5 h-3.5" /> Ativa e autenticando
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-3 py-1 rounded-full">
                    <AlertCircle className="w-3.5 h-3.5" /> Configurada mas com erro
                  </span>
                )}
              </div>
              {pluggy.error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-xs text-red-800 dark:text-red-300"><strong>Erro:</strong> {pluggy.error}</p>
                </div>
              )}
              <p className="text-sm text-muted-foreground">Usuários podem conectar bancos via Open Finance na página <Link href="/bancos" className="text-blue-600 hover:underline">Bancos (PF)</Link> ou <Link href="/pj/bancos" className="text-blue-600 hover:underline">Bancos (PJ)</Link>.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-gray-100 dark:bg-gray-800 dark:text-gray-300 px-3 py-1 rounded-full">
                  <AlertCircle className="w-3.5 h-3.5" /> Não configurada
                </span>
              </div>
              <p className="text-sm text-muted-foreground">A conexão real com bancos via Open Finance ainda não está ativa. Para ativar, siga os passos abaixo:</p>

              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">1</span>
                  <div>
                    <p className="text-foreground">Crie uma conta gratuita em <a href="https://dashboard.pluggy.ai/signup" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">dashboard.pluggy.ai <ExternalLink className="w-3 h-3" /></a></p>
                    <p className="text-xs text-muted-foreground mt-1">Ambiente sandbox é gratuito para testes. Produção exige plano pago.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">2</span>
                  <div>
                    <p className="text-foreground">No painel Pluggy, vá em <strong>Applications</strong> e copie o <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Client ID</code> e <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Client Secret</code>.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">3</span>
                  <div>
                    <p className="text-foreground">Cole o <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Client ID</code> e o <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Client Secret</code> nos campos acima e clique em <strong>Salvar e testar Pluggy</strong>.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">4</span>
                  <div>
                    <p className="text-foreground">Após ativação, usuários poderão clicar em <strong>Conectar via Open Finance</strong> em <code className="px-1.5 py-0.5 bg-muted rounded text-xs">/bancos</code>, escolher o banco e autorizar via o app do banco (conexão real, regulamentada pelo Banco Central).</p>
                  </div>
                </li>
              </ol>

              <div className="pt-3 border-t flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <a href="https://pluggy.ai" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" /> Documentação Pluggy
                  </a>
                </Button>
                <Button asChild size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                  <a href="https://dashboard.pluggy.ai/signup" target="_blank" rel="noopener noreferrer">
                    <Link2 className="w-3.5 h-3.5" /> Criar conta Pluggy
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Other providers (future) */}
      <Card className="shadow-sm opacity-60">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-muted-foreground">
            <Shield className="w-5 h-5" /> Outros provedores (em breve)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Belvo, Quanto e outros provedores de Open Finance serão adicionados em futuras versões.
            Atualmente, apenas <strong>Pluggy</strong> é suportado para Open Finance Brasil.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
