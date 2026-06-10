'use client';
import { apiFetch } from '@/lib/fetch';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePJ } from '@/lib/pj-context';
import {
  Building2, ChevronRight, Crown, FileText, Key, Link2, Mail,
  MessageCircle, Moon, Palette, Shield, ShieldCheck, ShieldOff, Sun, Users, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function PJConfiguracoesPage() {
  const { data: session } = useSession() || {};
  const { theme, setTheme } = useTheme();
  const { activeCompanyId, companies } = usePJ();
  const activeCompany = companies.find((c: any) => c.id === activeCompanyId);
  const [entitlements, setEntitlements] = useState<any>(null);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<{ qrDataUrl: string; secret: string; backupCodes: string[] } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  useEffect(() => {
    apiFetch('/api/entitlements').then(r => r.json()).then(setEntitlements).catch(() => {});
    apiFetch('/api/account').then(r => r.json()).then(d => { if (d.totpEnabled) setMfaEnabled(true); }).catch(() => {});
  }, []);

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
      setMfaEnabled(true); setMfaSuccess('MFA ativado!'); setMfaCode(''); setShowBackupCodes(true);
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

  const subscription = entitlements?.subscription;

  const navSection = (title: string, items: { href: string; icon: any; label: string; desc: string; badge?: string }[]) => (
    <Card className="shadow-sm">
      <CardHeader><CardTitle className="text-base text-muted-foreground uppercase tracking-wider font-semibold">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 pt-0">
        {items.map(item => (
          <Link key={item.href} href={item.href} className="flex items-center justify-between p-3 rounded-lg border border-input hover:bg-muted transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-foreground flex items-center gap-2">
                  {item.label}
                  {item.badge && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">{item.badge}</span>}
                </p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground mt-1">
          {activeCompany?.name ? `Empresa: ${activeCompany.name}` : 'Gerencie sua empresa e preferências'}
        </p>
      </div>

      {/* Profile quick card */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-500 text-white flex items-center justify-center text-xl font-bold flex-shrink-0">
              {session?.user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{session?.user?.name || 'Usuário'}</p>
              <p className="text-sm text-muted-foreground">{session?.user?.email || ''}</p>
              {activeCompany?.name && (
                <p className="text-xs text-blue-600 mt-0.5 font-medium">{activeCompany.name}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Geral */}
      {navSection('Geral', [
        { href: '/pj/empresa', icon: Building2, label: 'Dados da Empresa', desc: 'CNPJ, razão social, endereço fiscal' },
        { href: '/configuracoes', icon: Palette, label: 'Preferências', desc: 'Tema, idioma e configurações pessoais' },
        { href: '/configuracoes/sessoes', icon: Shield, label: 'Sessões Ativas', desc: 'Dispositivos conectados à sua conta' },
      ])}

      {/* Financeiro PJ */}
      {navSection('Financeiro', [
        { href: '/pj/bancos', icon: Wallet, label: 'Contas Bancárias', desc: 'Conectar e gerenciar contas PJ' },
        { href: '/pj/configuracoes/fiscal', icon: FileText, label: 'Configurações Fiscais', desc: 'Regime tributário, NF-e, NFC-e e SEFAZ' },
        { href: '/pj/conexoes', icon: Link2, label: 'Conexões e Integrações', desc: 'NF-e, boleto, Pix e outras integrações' },
        { href: '/configuracoes/chaves-api', icon: Key, label: 'Chaves API — IA', desc: 'Provedores de inteligência artificial' },
      ])}

      {/* Automações & Canais */}
      {navSection('Automações & Canais', [
        { href: '/configuracoes/smtp', icon: Mail, label: 'E-mail SMTP', desc: 'Configurar servidor de e-mail' },
        { href: '/configuracoes/whatsapp', icon: MessageCircle, label: 'WhatsApp', desc: 'Configurar WhatsApp Business' },
        { href: '/configuracoes/whatsapp-financeiro', icon: MessageCircle, label: 'WhatsApp Financeiro', desc: 'Enviar NFS-e, boletos e Pix via WhatsApp' },
      ])}

      {/* Equipe */}
      {navSection('Equipe', [
        { href: '/pj/usuarios', icon: Users, label: 'Usuários e Permissões', desc: 'Gerenciar acesso dos membros da equipe' },
      ])}

      {/* Aparência */}
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
                  theme === t.key
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Plano */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            Plano: <span className="capitalize text-blue-600 ml-1">{subscription?.plan || 'free'}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Gerencie seu plano e limites na área pessoal.</p>
          <Link href="/configuracoes">
            <Button variant="outline" size="sm"><Crown className="w-4 h-4 mr-2 text-amber-500" /> Ver planos e uso</Button>
          </Link>
        </CardContent>
      </Card>

      {/* MFA */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Shield className="w-5 h-5" /> Autenticação em Duas Etapas (MFA)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {mfaError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{mfaError}</p>}
          {mfaSuccess && <p className="text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">{mfaSuccess}</p>}

          {mfaEnabled && !mfaSetupData ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-blue-600">
                <ShieldCheck className="w-5 h-5" /><span className="font-medium">MFA está ativo</span>
              </div>
              <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => { setShowDisableDialog(true); setMfaError(''); }}>
                <ShieldOff className="w-4 h-4 mr-2" /> Desativar MFA
              </Button>
            </div>
          ) : !mfaSetupData ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Proteção extra com aplicativo autenticador (Google Authenticator, Authy).</p>
              <Button onClick={handleMfaSetup} disabled={mfaLoading} className="bg-blue-500 hover:bg-blue-600 text-white">
                <Shield className="w-4 h-4 mr-2" /> {mfaLoading ? 'Configurando...' : 'Ativar MFA'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground"><strong>1.</strong> Escaneie o QR code:</p>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mfaSetupData.qrDataUrl} alt="QR Code MFA" width={180} height={180} className="rounded-lg border" />
              </div>
              <p className="text-sm text-muted-foreground"><strong>2.</strong> Digite o código de 6 dígitos:</p>
              <div className="flex gap-2">
                <Input value={mfaCode} onChange={e => setMfaCode(e.target.value)} placeholder="000000" maxLength={6} className="w-36 text-center text-lg tracking-widest" />
                <Button onClick={handleMfaVerify} disabled={mfaLoading || mfaCode.length < 6} className="bg-blue-500 hover:bg-blue-600 text-white">
                  {mfaLoading ? 'Verificando...' : 'Verificar'}
                </Button>
              </div>
              {showBackupCodes && mfaSetupData.backupCodes && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">⚠️ Códigos de backup — salve em local seguro!</p>
                  <div className="grid grid-cols-2 gap-1">
                    {mfaSetupData.backupCodes.map((c, i) => (
                      <code key={i} className="text-sm font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded border">{c}</code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legal */}
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5" /> Legal</CardTitle></CardHeader>
        <CardContent className="flex gap-4">
          <Link href="/termos" className="text-sm text-blue-600 hover:underline">Termos de Uso</Link>
          <Link href="/privacidade" className="text-sm text-blue-600 hover:underline">Privacidade</Link>
        </CardContent>
      </Card>

      {/* Disable MFA dialog */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Desativar MFA</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Digite o código do autenticador ou um código de backup.</p>
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
    </div>
  );
}
