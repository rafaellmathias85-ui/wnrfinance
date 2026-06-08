'use client';
import { apiFetch } from '@/lib/fetch';
import { BRAZILIAN_BANKS } from '@/lib/format';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import NextImage from 'next/image';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import BalanceOverview from '@/components/balance-overview';

import {
  Building2, Plus, RefreshCw, Unplug, Link2, Trash2, CheckCircle, AlertCircle,
  WifiOff, Loader2, ArrowRightLeft, CreditCard, TrendingUp, Wallet, Clock, Shield,
  Info, PencilLine, Settings,
} from 'lucide-react';

const ACCOUNT_TYPES = [
  { id: 'checking', label: 'Conta Corrente', icon: Wallet },
  { id: 'savings', label: 'Poupança', icon: Building2 },
  { id: 'credit', label: 'Cartão de Crédito', icon: CreditCard },
  { id: 'investment', label: 'Investimentos', icon: TrendingUp },
];

interface BankConnection {
  id: string;
  bankName: string;
  bankLogo: string | null;
  provider: string;
  status: string;
  accountType: string | null;
  accountNumber: string | null;
  agency: string | null;
  openingBalance?: number;
  lastSyncAt: string | null;
  syncError: string | null;
  createdAt: string;
}

function getBankLogo(bankName: string): string {
  const bank = BRAZILIAN_BANKS.find(b => bankName?.toLowerCase().includes(b.name.toLowerCase().split(' ')[0]?.toLowerCase() || ''));
  return bank?.logo || '';
}

interface Props {
  scope: 'PF' | 'PJ';
  title: string;
  subtitle: string;
}

export function BankConnectionPage({ scope, title, subtitle }: Props) {
  const [data, setData] = useState<{ connections: BankConnection[]; stats: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addTab, setAddTab] = useState<'manual' | 'open-finance'>('manual');
  const [addStep, setAddStep] = useState(1);
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedBankLogo, setSelectedBankLogo] = useState('');
  const [selectedAccountType, setSelectedAccountType] = useState('checking');
  const [agency, setAgency] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [customBank, setCustomBank] = useState('');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pluggyStatus, setPluggyStatus] = useState<{ configured: boolean; healthy: boolean } | null>(null);
  const [connectError, setConnectError] = useState('');
  const [editConn, setEditConn] = useState<BankConnection | null>(null);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

  const refreshBalance = () => setBalanceRefreshKey(k => k + 1);

  const fetchData = useCallback(() => {
    apiFetch('/api/banks')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    apiFetch('/api/integrations/status')
      .then(r => r.json())
      .then(d => setPluggyStatus(d?.integrations?.pluggy || null))
      .catch(() => setPluggyStatus({ configured: false, healthy: false }));
  }, []);

  const handleManualSave = async () => {
    setSaving(true);
    setConnectError('');
    const bankName = selectedBank === 'Outro' ? (customBank || 'Outro') : selectedBank;
    const bank = BRAZILIAN_BANKS.find(b => b.name === bankName);
    try {
      const res = await apiFetch('/api/banks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName,
          bankLogo: bank?.logo || null,
          accountType: selectedAccountType,
          agency: agency || null,
          accountNumber: accountNumber || null,
          openingBalance: openingBalance ? parseFloat(openingBalance.replace(',', '.')) : 0,
        }),
      });
      if (res.ok) { resetForm(); fetchData(); refreshBalance(); }
      else { const d = await res.json(); setConnectError(d.error || 'Erro ao cadastrar'); }
    } catch { setConnectError('Erro de rede'); }
    setSaving(false);
  };

  const handleOpenFinanceConnect = async () => {
    setSaving(true);
    setConnectError('');
    try {
      const res = await apiFetch('/api/pluggy/connect-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const d = await res.json();
      if (!res.ok) {
        setConnectError(d.error || 'Não foi possível iniciar a conexão');
        setSaving(false);
        return;
      }
      // Load Pluggy Connect Widget via script tag and open it
      await loadPluggyWidget(d.accessToken, async (itemId) => {
        const cb = await apiFetch('/api/pluggy/callback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId }) });
        if (cb.ok) { resetForm(); fetchData(); }
        else { const err = await cb.json(); setConnectError(err.error || 'Erro ao salvar conexão'); }
      }, (error: any) => {
        setConnectError(error?.message || 'Conexão cancelada ou com erro');
      });
    } catch (e: any) {
      setConnectError(e?.message || 'Erro de rede');
    }
    setSaving(false);
  };

  const handleAction = async (id: string, action: string) => {
    setSyncing(id);
    setConnectError('');
    try {
      const res = await apiFetch(`/api/banks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = await res.json();
        setConnectError(d.error || 'Erro ao executar ação');
      }
      fetchData();
    } catch { /* noop */ }
    setSyncing(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta conta bancária? Esta ação não pode ser desfeita.')) return;
    await apiFetch(`/api/banks/${id}`, { method: 'DELETE' });
    fetchData();
    refreshBalance();
  };

  const handleUpdate = async () => {
    if (!editConn) return;
    setSaving(true);
    try {
      await apiFetch(`/api/banks/${editConn.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          bankName: editConn.bankName,
          accountType: editConn.accountType,
          agency: editConn.agency,
          accountNumber: editConn.accountNumber,
          openingBalance: editConn.openingBalance,
        }),
      });
      setEditConn(null);
      fetchData();
      refreshBalance();
    } catch { /* noop */ }
    setSaving(false);
  };

  const resetForm = () => {
    setShowAdd(false);
    setAddTab('manual');
    setAddStep(1);
    setSelectedBank('');
    setSelectedBankLogo('');
    setSelectedAccountType('checking');
    setAgency('');
    setAccountNumber('');
    setOpeningBalance('');
    setCustomBank('');
    setConnectError('');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3" /> Ativa</span>;
      case 'syncing': return <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded-full"><Loader2 className="w-3 h-3 animate-spin" /> Sincronizando</span>;
      case 'error': return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-full"><AlertCircle className="w-3 h-3" /> Erro</span>;
      case 'disconnected': return <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 dark:bg-gray-800 dark:text-gray-300 px-2 py-1 rounded-full"><WifiOff className="w-3 h-3" /> Desconectada</span>;
      default: return null;
    }
  };

  const getProviderBadge = (provider: string) => {
    if (provider === 'pluggy') return <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded-full"><Shield className="w-3 h-3" /> Open Finance</span>;
    if (provider === 'manual') return <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-1 rounded-full"><PencilLine className="w-3 h-3" /> Manual</span>;
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded-full">{provider}</span>;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  const connections = data?.connections || [];
  const stats = data?.stats || {};
  const hasOpenFinance = pluggyStatus?.configured && pluggyStatus?.healthy;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <Dialog open={showAdd} onOpenChange={(open) => { if (!open) resetForm(); else setShowAdd(true); }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Adicionar Banco
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adicionar Conta Bancária</DialogTitle>
            </DialogHeader>

            {/* Tabs */}
            <div className="flex gap-2 border-b">
              <button
                onClick={() => { setAddTab('manual'); setAddStep(1); setConnectError(''); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${addTab === 'manual' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <PencilLine className="w-4 h-4 inline mr-1" /> Cadastro Manual
              </button>
              <button
                onClick={() => { setAddTab('open-finance'); setConnectError(''); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${addTab === 'open-finance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <Shield className="w-4 h-4 inline mr-1" /> Open Finance
              </button>
            </div>

            {connectError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-xs text-red-800 dark:text-red-300">{connectError}</p>
              </div>
            )}

            {addTab === 'manual' && (
              <>
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <p className="text-xs text-purple-800 dark:text-purple-300">
                    <strong><PencilLine className="w-3 h-3 inline" /> Cadastro manual:</strong> você adiciona seus dados bancários apenas para organização interna. <strong>Não há sincronização</strong> com o banco — lançamentos serão inseridos manualmente.
                  </p>
                </div>

                {addStep === 1 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                    {[...BRAZILIAN_BANKS, { name: 'Outro', logo: '' }].map(b => (
                      <button
                        key={b.name}
                        onClick={() => { setSelectedBank(b.name); setSelectedBankLogo(b.logo); setAddStep(2); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-center"
                      >
                        {b.logo ? (
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden">
                            <NextImage src={b.logo} alt={b.name} fill className="object-contain" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <span className="text-xs font-medium text-foreground">{b.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {addStep === 2 && (
                  <div className="space-y-4 mt-2">
                    <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                      {selectedBankLogo ? (
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                          <NextImage src={selectedBankLogo} alt={selectedBank} fill className="object-contain" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0"><Building2 className="w-5 h-5 text-muted-foreground" /></div>
                      )}
                      <p className="font-medium text-foreground">{selectedBank}</p>
                    </div>

                    {selectedBank === 'Outro' && (
                      <div>
                        <label className="text-sm font-medium text-foreground">Nome do Banco</label>
                        <Input value={customBank} onChange={e => setCustomBank(e.target.value)} placeholder="Nome da instituição" className="mt-1" />
                      </div>
                    )}

                    <div>
                      <label className="text-sm font-medium text-foreground">Tipo de Conta</label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {ACCOUNT_TYPES.map(t => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedAccountType(t.id)}
                            className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-sm ${selectedAccountType === t.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-muted-foreground hover:border-gray-300'}`}
                          >
                            <t.icon className="w-4 h-4" />
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-foreground">Agência</label>
                        <Input value={agency} onChange={e => setAgency(e.target.value)} placeholder="0001" className="mt-1" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">Conta</label>
                        <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="12345-6" className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Saldo Inicial (R$)</label>
                      <Input value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0,00" className="mt-1" />
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setAddStep(1)} className="flex-1">Voltar</Button>
                      <Button onClick={handleManualSave} disabled={saving || (selectedBank === 'Outro' && !customBank)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PencilLine className="w-4 h-4 mr-2" />}
                        Cadastrar
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {addTab === 'open-finance' && (
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-xs text-blue-800 dark:text-blue-300">
                    <strong><Shield className="w-3 h-3 inline" /> Open Finance (Pluggy):</strong> conexão real e regulamentada pelo Banco Central. Você será redirecionado ao app/internet banking do banco para autorizar. Após conectar, extratos, cartões e investimentos serão sincronizados automaticamente.
                  </p>
                </div>

                {hasOpenFinance ? (
                  <>
                    <ol className="text-sm space-y-2 text-foreground">
                      <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">1</span> Clique em “Conectar via Open Finance” abaixo.</li>
                      <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">2</span> Selecione seu banco e autorize no app do banco.</li>
                      <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">3</span> Aguarde o status mudar para “Ativa” — pode levar alguns segundos.</li>
                    </ol>
                    <Button onClick={handleOpenFinanceConnect} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                      Conectar via Open Finance
                    </Button>
                  </>
                ) : (
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
                    <div className="flex gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-900 dark:text-amber-200">
                        <p className="font-semibold mb-1">Integração ainda não configurada</p>
                        <p>Para ativar Open Finance real, configure as credenciais Pluggy em <Link href="/configuracoes/integracoes" className="text-blue-600 hover:underline font-medium">Configurações &rsaquo; Integrações</Link>.</p>
                        <p className="mt-2 text-xs">Enquanto isso, use o cadastro manual na aba ao lado.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Transparency banner when OF not active */}
      {!hasOpenFinance && (
        <div className="p-4 rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 dark:text-amber-200 flex-1">
              <p className="font-semibold mb-1">Modo Cadastro Manual</p>
              <p>Open Finance (conexão automática com o banco) ainda não está ativado. As contas cadastradas aqui são <strong>apenas registros manuais</strong> — o sistema não acessa dados do banco e não importa extratos automaticamente.</p>
              <Link href="/configuracoes/integracoes" className="inline-flex items-center gap-1 mt-2 text-amber-900 dark:text-amber-100 underline hover:no-underline text-xs font-medium">
                <Settings className="w-3 h-3" /> Configurar Open Finance
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><Building2 className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Contas Cadastradas</p>
                <p className="text-xl font-bold text-foreground">{stats.totalConnections || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Contas Ativas</p>
                <p className="text-xl font-bold text-foreground">{stats.activeConnections || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {scope === 'PF' ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><ArrowRightLeft className="w-5 h-5 text-amber-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Transações</p>
                  <p className="text-xl font-bold text-foreground">{stats.totalTransactions || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"><Clock className="w-5 h-5 text-purple-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Última Sincronização</p>
                <p className="text-sm font-bold text-foreground">{stats.lastSync ? new Date(stats.lastSync).toLocaleDateString('pt-BR') : '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Balance Overview */}
      <BalanceOverview refreshKey={balanceRefreshKey} />

      {/* Connections list */}
      {connections.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <Building2 className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma conta bancária cadastrada</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Cadastre contas bancárias manualmente para organização ou conecte via Open Finance (quando ativado) para sincronização automática.
            </p>
            <Button onClick={() => setShowAdd(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Adicionar Primeira Conta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {connections.map((conn, i) => {
            const logoUrl = conn.bankLogo || getBankLogo(conn.bankName);
            return (
              <motion.div key={conn.id} initial={{ y: 5 }} animate={{ y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {logoUrl ? (
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-white border border-gray-100 flex-shrink-0">
                            <NextImage src={logoUrl} alt={conn.bankName} fill className="object-contain p-1" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-6 h-6 text-blue-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-foreground">{conn.bankName}</h3>
                            {getProviderBadge(conn.provider)}
                            {getStatusBadge(conn.status)}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span>{ACCOUNT_TYPES.find(t => t.id === conn.accountType)?.label || 'Conta'}</span>
                            {conn.agency && <><span>•</span><span>Ag. {conn.agency}</span></>}
                            {conn.accountNumber && <><span>•</span><span>CC {conn.accountNumber}</span></>}
                          </div>
                          {conn.lastSyncAt && conn.provider !== 'manual' && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Última sync: {new Date(conn.lastSyncAt).toLocaleString('pt-BR')}
                            </p>
                          )}
                          {conn.provider === 'manual' && (
                            <p className="text-xs text-muted-foreground mt-1">Cadastro manual — sem sincronização automática</p>
                          )}
                          {conn.syncError && <p className="text-xs text-red-500 mt-1">{conn.syncError}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {conn.provider === 'pluggy' && conn.status === 'active' && (
                          <Button variant="outline" size="sm" onClick={() => handleAction(conn.id, 'sync')} disabled={syncing === conn.id} className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50">
                            <RefreshCw className={`w-3.5 h-3.5 ${syncing === conn.id ? 'animate-spin' : ''}`} /> Sincronizar
                          </Button>
                        )}
                        {conn.provider === 'manual' && (
                          <Button variant="outline" size="sm" onClick={() => setEditConn(conn)} className="gap-1">
                            <PencilLine className="w-3.5 h-3.5" /> Editar
                          </Button>
                        )}
                        {conn.status === 'disconnected' && (
                          <Button variant="outline" size="sm" onClick={() => handleAction(conn.id, 'reconnect')} className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50">
                            <Link2 className="w-3.5 h-3.5" /> Reconectar
                          </Button>
                        )}
                        {conn.status === 'active' && conn.provider === 'pluggy' && (
                          <Button variant="outline" size="sm" onClick={() => handleAction(conn.id, 'disconnect')} className="gap-1 text-muted-foreground border-gray-200 hover:bg-gray-50">
                            <Unplug className="w-3.5 h-3.5" /> Desconectar
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(conn.id)} className="text-red-500 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Edit dialog (manual accounts) */}
      <Dialog open={!!editConn} onOpenChange={(o) => { if (!o) setEditConn(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Conta Manual</DialogTitle></DialogHeader>
          {editConn && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground">Banco</label>
                <Input value={editConn.bankName} onChange={e => setEditConn({ ...editConn, bankName: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Tipo</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {ACCOUNT_TYPES.map(t => (
                    <button key={t.id} onClick={() => setEditConn({ ...editConn, accountType: t.id })}
                      className={`flex items-center gap-2 p-2 rounded-lg border-2 text-sm ${editConn.accountType === t.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-muted-foreground'}`}>
                      <t.icon className="w-4 h-4" /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium text-foreground">Agência</label>
                  <Input value={editConn.agency || ''} onChange={e => setEditConn({ ...editConn, agency: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Conta</label>
                  <Input value={editConn.accountNumber || ''} onChange={e => setEditConn({ ...editConn, accountNumber: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Saldo Inicial (R$)</label>
                <Input type="number" step="0.01" value={editConn.openingBalance ?? 0} onChange={e => setEditConn({ ...editConn, openingBalance: parseFloat(e.target.value) || 0 })} className="mt-1" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditConn(null)} className="flex-1">Cancelar</Button>
                <Button onClick={handleUpdate} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Pluggy Connect Widget loader (idempotent)
async function loadPluggyWidget(accessToken: string, onSuccess: (itemId: string) => void, onError: (err: any) => void) {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (!w.PluggyConnect) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.pluggy.ai/pluggy-connect/v2.9.2/pluggy-connect.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Não foi possível carregar o widget Pluggy'));
      document.head.appendChild(s);
    });
  }
  const PluggyConnect = (window as any).PluggyConnect;
  if (!PluggyConnect) { onError(new Error('Widget Pluggy indisponível')); return; }

  const instance = new PluggyConnect({
    connectToken: accessToken,
    includeSandbox: true,
    onSuccess: (data: any) => {
      const itemId = data?.item?.id;
      if (itemId) onSuccess(itemId);
      else onError(new Error('Conexão concluída sem itemId'));
    },
    onError: (err: any) => onError(err),
    onClose: () => { /* dismissed */ },
  });
  instance.init();
}
