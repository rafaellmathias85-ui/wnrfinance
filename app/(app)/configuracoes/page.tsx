'use client';
import { apiFetch } from '@/lib/fetch';
import { useTheme } from 'next-themes';
import { Palette } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { AlertTriangle, Building2, ChevronRight, Copy, Crown, FileText, Key, Link2, Moon, Shield, ShieldCheck, ShieldOff, Sun, Trash2, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';


export default function ConfiguracoesPage() {
  const { data: session } = useSession() || {};
  const { theme, setTheme } = useTheme();
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [entitlements, setEntitlements] = useState<any>(null);
  const [subLoaded, setSubLoaded] = useState(false);
  // MFA states
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<{ qrDataUrl: string; secret: string; backupCodes: string[] } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  // Load entitlements (includes plan + usage)
  useEffect(() => {
    if (!subLoaded) {
      apiFetch('/api/entitlements').then(r => r.json()).then(d => { setEntitlements(d); setSubLoaded(true); }).catch(() => setSubLoaded(true));
    }
  }, [subLoaded]);

  // Check MFA status
  useEffect(() => {
    apiFetch('/api/account').then(r => r.json()).then(d => {
      if (d.totpEnabled) setMfaEnabled(true);
    }).catch(() => {});
  }, []);

  const subscription = entitlements?.subscription;

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'EXCLUIR') return;
    setDeleting(true);
    try {
      const res = await apiFetch('/api/account', { method: 'DELETE' });
      if (res.ok) {
        signOut({ callbackUrl: '/login' });
      }
    } catch { /* noop */ }
    setDeleting(false);
  };

  const handleMfaSetup = async () => {
    setMfaLoading(true); setMfaError(''); setMfaSuccess('');
    try {
      const res = await apiFetch('/api/auth/totp/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMfaSetupData(data);
    } catch (e: any) { setMfaError(e.message || 'Erro ao configurar MFA'); }
    setMfaLoading(false);
  };

  const handleMfaVerify = async () => {
    if (!mfaCode.trim()) return;
    setMfaLoading(true); setMfaError('');
    try {
      const res = await apiFetch('/api/auth/totp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: mfaCode }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMfaEnabled(true); setMfaSuccess('MFA ativado com sucesso!'); setMfaCode(''); setShowBackupCodes(true);
    } catch (e: any) { setMfaError(e.message || 'Código inválido'); }
    setMfaLoading(false);
  };

  const handleMfaDisable = async () => {
    if (!disableCode.trim()) return;
    setMfaLoading(true); setMfaError('');
    try {
      const res = await apiFetch('/api/auth/totp/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: disableCode }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMfaEnabled(false); setMfaSetupData(null); setShowDisableDialog(false); setDisableCode(''); setMfaSuccess('MFA desativado.');
    } catch (e: any) { setMfaError(e.message || 'Código inválido'); }
    setMfaLoading(false);
  };

  const plans = [
    { id: 'free', name: 'Gratuito', price: 'R$ 0', features: ['50 lançamentos/mês', '1 banco', '2 cartões', '3 caixinhas', 'Relatórios básicos'] },
    { id: 'pro', name: 'Pro', price: 'R$ 19,90/mês', features: ['500 lançamentos/mês', '5 bancos', '10 cartões', 'Conciliação automática', 'Assistente IA', 'Exportação PDF'], recommended: true },
    { id: 'premium', name: 'Premium', price: 'R$ 49,90/mês', features: ['Tudo ilimitado', 'Multi-moeda', 'Suporte prioritário', 'Relatórios avançados'] },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground dark:text-white">Configurações</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Gerencie sua conta e preferências</p>
      </div>

      {/* Profile */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><User className="w-5 h-5" /> Perfil</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-500 text-white flex items-center justify-center text-xl font-bold">
              {session?.user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-medium text-foreground dark:text-white">{session?.user?.name || 'Usuário'}</p>
              <p className="text-sm text-gray-500">{session?.user?.email || ''}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Companies */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Building2 className="w-5 h-5" /> Empresas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Link href="/pj/empresa" className="flex items-center justify-between p-3 rounded-lg border border-input hover:bg-muted transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-foreground">Cadastrar e editar empresas</p>
                <p className="text-xs text-muted-foreground">Dados cadastrais, empresas ativas e nova empresa PJ</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Palette className="w-5 h-5" /> Aparência</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {[
              { key: 'light', label: 'Claro', icon: Sun },
              { key: 'dark', label: 'Escuro', icon: Moon },
              { key: 'system', label: 'Sistema', icon: Palette },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTheme(t.key)}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium ${
                  theme === t.key ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subscription Plans */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Crown className="w-5 h-5 text-amber-500" /> Plano Atual: <span className="capitalize text-blue-600">{subscription?.plan || 'free'}</span></CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map(p => (
              <div key={p.id} className={`p-4 rounded-xl border-2 transition-all ${subscription?.plan === p.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : p.recommended ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
                {p.recommended && <span className="text-xs font-bold text-amber-600 uppercase">Recomendado</span>}
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-1">{p.name}</h3>
                <p className="text-2xl font-bold text-blue-600 mt-1">{p.price}</p>
                <ul className="mt-3 space-y-1">
                  {p.features.map(f => <li key={f} className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">✓ {f}</li>)}
                </ul>
                {subscription?.plan === p.id ? (
                  <p className="mt-3 text-xs font-medium text-blue-600">Plano atual</p>
                ) : (
                  <Button className="mt-3 w-full bg-blue-500 hover:bg-blue-600 text-white text-sm" size="sm" disabled>
                    Em breve
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
      {entitlements?.usage && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2">📊 Uso do Plano</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Bancos conectados', ...entitlements.usage.banks },
              { label: 'Cartões ativos', ...entitlements.usage.cards },
              { label: 'Lançamentos (mês)', ...entitlements.usage.monthlyTransactions },
              { label: 'Caixinhas', ...entitlements.usage.savingsBoxes },
            ].map(u => (
              <div key={u.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{u.label}</span>
                  <span className="font-medium text-foreground">{u.current}{u.limit === -1 ? '' : `/${u.limit}`}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${u.pct > 90 ? 'bg-red-500' : u.pct > 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${u.limit === -1 ? 10 : Math.min(u.pct, 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* MFA / Autenticação em Duas Etapas */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5" /> Autenticação em Duas Etapas (MFA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mfaError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{mfaError}</p>}
          {mfaSuccess && <p className="text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">{mfaSuccess}</p>}

          {mfaEnabled && !mfaSetupData ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-blue-600">
                <ShieldCheck className="w-5 h-5" />
                <span className="font-medium">MFA está ativo</span>
              </div>
              <p className="text-sm text-muted-foreground">Sua conta está protegida com autenticação em duas etapas via aplicativo autenticador.</p>
              <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => { setShowDisableDialog(true); setMfaError(''); setMfaSuccess(''); }}>
                <ShieldOff className="w-4 h-4 mr-2" /> Desativar MFA
              </Button>
            </div>
          ) : !mfaSetupData ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Adicione uma camada extra de segurança à sua conta usando um aplicativo autenticador (Google Authenticator, Authy, etc).</p>
              <Button onClick={handleMfaSetup} disabled={mfaLoading} className="bg-blue-500 hover:bg-blue-600 text-white">
                <Shield className="w-4 h-4 mr-2" /> {mfaLoading ? 'Configurando...' : 'Ativar MFA'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground space-y-2">
                <p><strong>1.</strong> Escaneie o QR code com seu app autenticador:</p>
              </div>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mfaSetupData.qrDataUrl} alt="QR Code MFA" width={200} height={200} className="rounded-lg border" />
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Chave manual</summary>
                <code className="block mt-1 p-2 bg-muted rounded text-xs break-all select-all">{mfaSetupData.secret}</code>
              </details>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground"><strong>2.</strong> Digite o código de 6 dígitos do app:</p>
                <div className="flex gap-2">
                  <Input value={mfaCode} onChange={e => setMfaCode(e.target.value)} placeholder="000000" maxLength={6} className="w-40 text-center text-lg tracking-widest" />
                  <Button onClick={handleMfaVerify} disabled={mfaLoading || mfaCode.length < 6} className="bg-blue-500 hover:bg-blue-600 text-white">
                    {mfaLoading ? 'Verificando...' : 'Verificar'}
                  </Button>
                </div>
              </div>
              {showBackupCodes && mfaSetupData.backupCodes && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">⚠️ Códigos de backup — salve em local seguro!</p>
                  <div className="grid grid-cols-2 gap-1">
                    {mfaSetupData.backupCodes.map((c, i) => (
                      <code key={i} className="text-sm font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded border">{c}</code>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(mfaSetupData!.backupCodes.join('\n')); }}>
                    <Copy className="w-3 h-3 mr-1" /> Copiar todos
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disable MFA Dialog */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Desativar MFA</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Digite o código do seu autenticador ou um código de backup para desativar o MFA.</p>
            {mfaError && <p className="text-sm text-red-600">{mfaError}</p>}
            <Input value={disableCode} onChange={e => setDisableCode(e.target.value)} placeholder="Código TOTP ou backup" className="text-center" />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowDisableDialog(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleMfaDisable} disabled={!disableCode.trim() || mfaLoading} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                {mfaLoading ? 'Desativando...' : 'Desativar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin — User Management */}
      {['admin', 'master'].includes((session?.user as any)?.role ?? '') && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5" /> Administração</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Link href="/configuracoes/usuarios" className="flex items-center justify-between p-3 rounded-lg border border-input hover:bg-muted transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Gerenciar Usuários</p>
                  <p className="text-xs text-muted-foreground">Cadastro, perfis e matriz de permissões</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Integrations */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Link2 className="w-5 h-5" /> Integrações</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Link href="/configuracoes/integracoes" className="flex items-center justify-between p-3 rounded-lg border border-input hover:bg-muted transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-foreground">Open Finance (Pluggy)</p>
                <p className="text-xs text-muted-foreground">Configurar conexão automática com bancos</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Link href="/configuracoes/chaves-api" className="flex items-center justify-between p-3 rounded-lg border border-input hover:bg-muted transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Key className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-foreground">Chaves API - Provedores IA</p>
                <p className="text-xs text-muted-foreground">Gerenciar provedores de IA e chaves de acesso</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      {/* Legal */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5" /> Legal</CardTitle></CardHeader>
        <CardContent className="flex gap-4">
          <Link href="/termos" className="text-sm text-blue-600 hover:underline">Termos de Uso (EULA)</Link>
          <Link href="/privacidade" className="text-sm text-blue-600 hover:underline">Política de Privacidade</Link>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="shadow-sm border-red-200 dark:border-red-800">
        <CardHeader><CardTitle className="text-lg text-red-600 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Zona de Perigo</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Ao excluir sua conta, todos os seus dados serão permanentemente removidos. Esta ação é irreversível.</p>
          <Button variant="outline" onClick={() => setShowDelete(true)} className="border-red-300 text-red-600 hover:bg-red-50">
            <Trash2 className="w-4 h-4 mr-2" /> Excluir Minha Conta
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-red-600">Excluir Conta</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800"><strong>⚠️ Atenção:</strong> Esta ação irá excluir permanentemente sua conta e todos os dados associados (despesas, receitas, investimentos, cartões, caixinhas e conexões bancárias).</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Digite EXCLUIR para confirmar</label>
              <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="EXCLUIR" className="mt-1" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowDelete(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleDeleteAccount} disabled={deleteConfirm !== 'EXCLUIR' || deleting} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                {deleting ? 'Excluindo...' : 'Confirmar Exclusão'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
