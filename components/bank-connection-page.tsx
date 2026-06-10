'use client';

import { apiFetch } from '@/lib/fetch';
import NextImage from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Building2,
  CheckCircle2,
  FileSearch,
  FileText,
  History,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PersonType = 'PF' | 'PJ';
type BankCode = 'INTER' | 'ITAU';
type ConnectionMode = 'API' | 'OFX' | 'CSV' | 'OPEN_FINANCE_FUTURE';

interface BankConnection {
  id: string;
  bankName: string;
  bankLogo?: string | null;
  bankCode?: string | null;
  personType: PersonType;
  provider: string;
  connectionMode: ConnectionMode;
  status: string;
  agency?: string | null;
  accountNumber?: string | null;
  accountDigit?: string | null;
  currentBalance?: number | null;
  lastSyncAt?: string | null;
  syncError?: string | null;
}

interface PreviewResult {
  importId: string;
  total: number;
  duplicates: number;
  errors: Array<{ row: number; message: string }>;
  transactions: Array<any & { duplicate: boolean }>;
}

interface Props {
  scope: PersonType;
  title: string;
  subtitle: string;
}

const BANKS: Array<{ code: BankCode; name: string; logo: string }> = [
  { code: 'INTER', name: 'Banco Inter', logo: '/banks/inter.png' },
  { code: 'ITAU', name: 'Itaú', logo: '/banks/itau.png' },
];

export function BankConnectionPage({ scope, title, subtitle }: Props) {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [step, setStep] = useState(1);
  const [bankCode, setBankCode] = useState<BankCode>('INTER');
  const [personType, setPersonType] = useState<PersonType>(scope);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('OFX');
  const [connectionName, setConnectionName] = useState('');
  const [ownerTaxId, setOwnerTaxId] = useState('');
  const [agency, setAgency] = useState('');
  const [account, setAccount] = useState('');
  const [accountDigit, setAccountDigit] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [certificatePassword, setCertificatePassword] = useState('');
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [createdConnectionId, setCreatedConnectionId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/api/banking/connections?personType=${scope}`);
    const data = await res.json();
    setConnections(data.connections || []);
    setLoading(false);
  }, [scope]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    setPersonType(scope);
  }, [scope]);

  useEffect(() => {
    const firstAvailable = getMethods(bankCode, personType)[0];
    setConnectionMode(firstAvailable.mode);
    setPreview(null);
    setCreatedConnectionId(null);
  }, [bankCode, personType]);

  const stats = useMemo(() => {
    const active = connections.filter((item) => item.status === 'ACTIVE' || item.status === 'active').length;
    const api = connections.filter((item) => item.connectionMode === 'API').length;
    const ofx = connections.filter((item) => item.connectionMode === 'OFX' || item.connectionMode === 'CSV').length;
    return { total: connections.length, active, api, ofx };
  }, [connections]);

  const resetForm = () => {
    setShowAdd(false);
    setStep(1);
    setBankCode('INTER');
    setPersonType(scope);
    setConnectionMode('OFX');
    setConnectionName('');
    setOwnerTaxId('');
    setAgency('');
    setAccount('');
    setAccountDigit('');
    setClientId('');
    setClientSecret('');
    setCertificatePassword('');
    setCertificateFile(null);
    setPrivateKeyFile(null);
    setStatementFile(null);
    setCreatedConnectionId(null);
    setPreview(null);
    setMessage('');
    setError('');
  };

  const saveConnection = async (keepOpen = false) => {
    setBusy('save');
    setError('');
    setMessage('');

    try {
      const payload = {
        name: connectionName || selectedBank().name,
        bankCode,
        personType,
        connectionMode,
        agency: agency || null,
        account: account || null,
        accountDigit: accountDigit || null,
        ownerTaxId: ownerTaxId || null,
        clientId: clientId || null,
        clientSecret: clientSecret || null,
        certificate: certificateFile ? await certificateFile.text() : null,
        privateKey: privateKeyFile ? await privateKeyFile.text() : null,
        certificatePassword: certificatePassword || null,
      };

      const res = await apiFetch('/api/banking/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar conexão');

      setCreatedConnectionId(data.connection.id);
      setMessage('Conexão salva com credenciais criptografadas.');
      await loadConnections();
      if (!keepOpen) resetForm();
      return data.connection as BankConnection;
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar conexão');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const ensureConnection = async () => {
    if (createdConnectionId) return createdConnectionId;
    const connection = await saveConnection(true);
    return connection?.id || null;
  };

  const testConnection = async () => {
    const id = await ensureConnection();
    if (!id) return;
    setBusy('test');
    setError('');
    setMessage('');
    try {
      const res = await apiFetch(`/api/banking/connections/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', personType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao testar conexão');
      setMessage(data.message || 'Teste concluído.');
      await loadConnections();
    } catch (err: any) {
      setError(err.message || 'Erro ao testar conexão');
    } finally {
      setBusy(null);
    }
  };

  const previewImport = async () => {
    if (!statementFile) {
      setError('Selecione um arquivo OFX ou CSV.');
      return;
    }
    const id = await ensureConnection();
    if (!id) return;
    setBusy('preview');
    setError('');
    setMessage('');
    const formData = new FormData();
    formData.append('file', statementFile);
    formData.append('connectionId', id);
    formData.append('personType', personType);
    formData.append('bankCode', bankCode);
    try {
      const res = await apiFetch('/api/banking/import/preview', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao pré-visualizar');
      setPreview(data);
      setMessage(`${data.total} transações encontradas; ${data.duplicates} duplicadas.`);
    } catch (err: any) {
      setError(err.message || 'Erro ao pré-visualizar');
    } finally {
      setBusy(null);
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    const id = await ensureConnection();
    if (!id) return;
    setBusy('import');
    setError('');
    setMessage('');
    try {
      const res = await apiFetch('/api/banking/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: id,
          personType,
          transactions: preview.transactions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao importar');
      setMessage(`Importadas: ${data.imported}. Duplicadas ignoradas: ${data.skipped}.`);
      setPreview(null);
      setStatementFile(null);
      await loadConnections();
    } catch (err: any) {
      setError(err.message || 'Erro ao importar');
    } finally {
      setBusy(null);
    }
  };

  const syncNow = async (connection: BankConnection) => {
    setBusy(`sync:${connection.id}`);
    setError('');
    setMessage('');
    try {
      const res = await apiFetch(`/api/banking/connections/${connection.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', personType: connection.personType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao sincronizar');
      setMessage(`Sincronização concluída. Importadas: ${data.imported || 0}.`);
      await loadConnections();
    } catch (err: any) {
      setError(err.message || 'Erro ao sincronizar');
    } finally {
      setBusy(null);
    }
  };

  const removeConnection = async (connection: BankConnection) => {
    if (!confirm('Remover conexão bancária?')) return;
    setBusy(`delete:${connection.id}`);
    await apiFetch(`/api/banking/connections/${connection.id}`, { method: 'DELETE' });
    await loadConnections();
    setBusy(null);
  };

  const selectedBank = () => BANKS.find((item) => item.code === bankCode) || BANKS[0];
  const methods = getMethods(bankCode, personType);
  const isApiMode = connectionMode === 'API';
  const isManualImportMode = connectionMode === 'OFX' || connectionMode === 'CSV';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Nova conexão
        </Button>
      </div>

      {(message || error) && (
        <div className={`rounded-lg border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
          {error || message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Conexões" value={stats.total} icon={Building2} />
        <Metric label="Ativas" value={stats.active} icon={CheckCircle2} />
        <Metric label="API PJ" value={stats.api} icon={Wifi} />
        <Metric label="OFX/CSV" value={stats.ofx} icon={FileText} />
      </div>

      {connections.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Banknote className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Nenhuma conexão bancária</h2>
            <p className="mt-1 text-sm text-muted-foreground">Crie uma conexão Inter/Itaú por API PJ ou importação OFX/CSV.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {connections.map((connection) => (
            <Card key={connection.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{connection.bankName}</h3>
                      <StatusBadge status={connection.status} mode={connection.connectionMode} />
                      <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {connection.personType} · {connection.connectionMode}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {connection.agency ? `Ag. ${connection.agency}` : 'Agência não informada'}
                      {' · '}
                      {connection.accountNumber ? `Conta ${connection.accountNumber}${connection.accountDigit ? `-${connection.accountDigit}` : ''}` : 'Conta não informada'}
                    </p>
                    {connection.syncError && <p className="mt-1 text-xs text-red-600">{connection.syncError}</p>}
                    {connection.lastSyncAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Última sincronização: {new Date(connection.lastSyncAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {connection.connectionMode === 'API' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncNow(connection)}
                        disabled={busy === `sync:${connection.id}`}
                        className="gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${busy === `sync:${connection.id}` ? 'animate-spin' : ''}`} />
                        Sincronizar agora
                      </Button>
                    )}
                    {(connection.connectionMode === 'OFX' || connection.connectionMode === 'CSV') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAdd(true);
                          setStep(3);
                          setBankCode((connection.bankCode as BankCode) || 'INTER');
                          setPersonType(connection.personType);
                          setConnectionMode(connection.connectionMode);
                          setCreatedConnectionId(connection.id);
                        }}
                        className="gap-2"
                      >
                        <Upload className="h-4 w-4" />
                        Importar OFX/CSV
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setMessage('Logs disponíveis em Auditoria.')} className="gap-2">
                      <History className="h-4 w-4" />
                      Ver logs
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeConnection(connection)}
                      disabled={busy === `delete:${connection.id}`}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) resetForm(); else setShowAdd(true); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Financeiro · Bancos · Nova conexão</DialogTitle>
          </DialogHeader>

          <StepHeader step={step} />

          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {BANKS.map((bank) => (
                <button
                  key={bank.code}
                  onClick={() => { setBankCode(bank.code); setStep(2); }}
                  className={`rounded-lg border p-4 text-left transition-colors ${bankCode === bank.code ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="relative h-9 w-9 overflow-hidden rounded-md bg-white">
                      <NextImage src={bank.logo} alt={bank.name} fill className="object-contain" />
                    </span>
                    <div>
                      <p className="font-semibold">{bank.name}</p>
                      <p className="text-xs text-muted-foreground">Saldo, extrato, OFX/CSV</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(['PJ', 'PF'] as PersonType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => { setPersonType(type); setStep(3); }}
                  className={`rounded-lg border p-4 text-left transition-colors ${personType === type ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted'}`}
                >
                  <p className="font-semibold">{type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {type === 'PJ' ? 'API empresarial quando disponível, com fallback OFX.' : 'OFX/CSV sem senha bancária.'}
                  </p>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid gap-2 sm:grid-cols-2">
                {methods.map((method) => (
                  <button
                    key={method.mode}
                    disabled={method.disabled}
                    onClick={() => !method.disabled && setConnectionMode(method.mode)}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${connectionMode === method.mode ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted'}`}
                  >
                    <p className="font-semibold">{method.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{method.description}</p>
                  </button>
                ))}
              </div>

              {personType === 'PF' && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  Por segurança, o sistema não solicita senha bancária nem acessa seu Internet Banking. Para conta PF, utilize OFX/CSV ou futuramente Open Finance.
                </div>
              )}

              {bankCode === 'ITAU' && personType === 'PJ' && connectionMode === 'API' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  A integração automática Itaú PJ depende de habilitação junto ao Itaú. Enquanto isso, use OFX para importar extratos.
                </div>
              )}

              <ConnectionFields
                isApiMode={isApiMode}
                bankCode={bankCode}
                personType={personType}
                connectionName={connectionName}
                ownerTaxId={ownerTaxId}
                agency={agency}
                account={account}
                accountDigit={accountDigit}
                clientId={clientId}
                clientSecret={clientSecret}
                certificatePassword={certificatePassword}
                setConnectionName={setConnectionName}
                setOwnerTaxId={setOwnerTaxId}
                setAgency={setAgency}
                setAccount={setAccount}
                setAccountDigit={setAccountDigit}
                setClientId={setClientId}
                setClientSecret={setClientSecret}
                setCertificatePassword={setCertificatePassword}
                setCertificateFile={setCertificateFile}
                setPrivateKeyFile={setPrivateKeyFile}
              />

              {isManualImportMode && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div>
                    <Label>Upload OFX</Label>
                    <Input type="file" accept=".ofx,.qfx,.csv" onChange={(event) => setStatementFile(event.target.files?.[0] || null)} className="mt-1" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={previewImport} disabled={busy === 'preview'} className="gap-2">
                      {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                      Pré-visualizar
                    </Button>
                    <Button onClick={confirmImport} disabled={!preview || busy === 'import'} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
                      {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Importar
                    </Button>
                    <Button variant="outline" onClick={() => setMessage(`${preview?.duplicates || 0} duplicadas detectadas.`)} disabled={!preview}>
                      Ver duplicados
                    </Button>
                    <Button variant="outline" onClick={() => setMessage('Transações importadas são enviadas automaticamente para conciliação.')} disabled={!preview}>
                      Enviar para conciliação
                    </Button>
                  </div>
                  {preview && (
                    <div className="max-h-44 overflow-y-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-2 py-2 text-left">Data</th>
                            <th className="px-2 py-2 text-left">Descrição</th>
                            <th className="px-2 py-2 text-right">Valor</th>
                            <th className="px-2 py-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.transactions.slice(0, 50).map((tx, index) => (
                            <tr key={`${tx.checksum}-${index}`} className="border-t">
                              <td className="px-2 py-1">{new Date(tx.date).toLocaleDateString('pt-BR')}</td>
                              <td className="px-2 py-1">{tx.description}</td>
                              <td className="px-2 py-1 text-right">{tx.direction === 'DEBIT' ? '-' : '+'}{Number(tx.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                              <td className="px-2 py-1 text-center">{tx.duplicate ? 'Duplicada' : 'Nova'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
                <div className="flex flex-wrap gap-2">
                  {isApiMode && (
                    <Button variant="outline" onClick={testConnection} disabled={busy === 'test'} className="gap-2">
                      {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Testar conexão
                    </Button>
                  )}
                  <Button onClick={() => saveConnection(false)} disabled={busy === 'save'} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
                    {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getMethods(bankCode: BankCode, personType: PersonType) {
  if (bankCode === 'INTER' && personType === 'PJ') {
    return [
      { mode: 'API' as ConnectionMode, label: 'API Banco Inter PJ', description: 'OAuth2 client_credentials com mTLS.' },
      { mode: 'OFX' as ConnectionMode, label: 'Importação OFX', description: 'Fallback manual de extrato.' },
    ];
  }
  if (bankCode === 'ITAU' && personType === 'PJ') {
    return [
      { mode: 'API' as ConnectionMode, label: 'API Itaú PJ', description: 'Preparada; depende de habilitação Itaú.' },
      { mode: 'OFX' as ConnectionMode, label: 'Importação OFX', description: 'Contingência obrigatória.' },
    ];
  }
  return [
    { mode: 'OFX' as ConnectionMode, label: 'Importação OFX/CSV', description: 'Disponível agora.' },
    { mode: 'OPEN_FINANCE_FUTURE' as ConnectionMode, label: 'Open Finance futuro', description: 'Desabilitado neste MVP.', disabled: true },
  ];
}

function StepHeader({ step }: { step: number }) {
  return (
    <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
      {['Banco', 'Tipo', 'Método'].map((label, index) => (
        <div key={label} className={`rounded-md px-3 py-2 text-center ${step === index + 1 ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'}`}>
          {label}
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, mode }: { status: string; mode: ConnectionMode }) {
  const normalized = status?.toUpperCase();
  if (mode === 'OFX' || mode === 'CSV') {
    return <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">OFX_ONLY</span>;
  }
  if (normalized === 'ACTIVE') return <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs text-emerald-700">CONNECTED</span>;
  if (normalized === 'ERROR') return <span className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-700">ERROR</span>;
  if (normalized === 'DISABLED') return <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">DISABLED</span>;
  return <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-700">PENDING_CONFIG</span>;
}

function ConnectionFields(props: {
  isApiMode: boolean;
  bankCode: BankCode;
  personType: PersonType;
  connectionName: string;
  ownerTaxId: string;
  agency: string;
  account: string;
  accountDigit: string;
  clientId: string;
  clientSecret: string;
  certificatePassword: string;
  setConnectionName: (value: string) => void;
  setOwnerTaxId: (value: string) => void;
  setAgency: (value: string) => void;
  setAccount: (value: string) => void;
  setAccountDigit: (value: string) => void;
  setClientId: (value: string) => void;
  setClientSecret: (value: string) => void;
  setCertificatePassword: (value: string) => void;
  setCertificateFile: (file: File | null) => void;
  setPrivateKeyFile: (file: File | null) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label>Nome da conexão</Label>
        <Input value={props.connectionName} onChange={(event) => props.setConnectionName(event.target.value)} placeholder="Conta principal" className="mt-1" />
      </div>
      <div>
        <Label>{props.personType === 'PJ' ? 'CNPJ' : 'CPF/CNPJ do titular'}</Label>
        <Input value={props.ownerTaxId} onChange={(event) => props.setOwnerTaxId(event.target.value)} placeholder="00.000.000/0000-00" className="mt-1" />
      </div>
      <div>
        <Label>Agência</Label>
        <Input value={props.agency} onChange={(event) => props.setAgency(event.target.value)} placeholder="0001" className="mt-1" />
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <div>
          <Label>Conta</Label>
          <Input value={props.account} onChange={(event) => props.setAccount(event.target.value)} placeholder="123456" className="mt-1" />
        </div>
        <div>
          <Label>Dígito</Label>
          <Input value={props.accountDigit} onChange={(event) => props.setAccountDigit(event.target.value)} placeholder="0" className="mt-1" />
        </div>
      </div>

      {props.isApiMode && (
        <>
          <div>
            <Label>Client ID</Label>
            <Input value={props.clientId} onChange={(event) => props.setClientId(event.target.value)} autoComplete="off" className="mt-1" />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input type="password" value={props.clientSecret} onChange={(event) => props.setClientSecret(event.target.value)} autoComplete="new-password" className="mt-1" />
          </div>
          <div>
            <Label>{props.bankCode === 'INTER' ? 'Upload certificado .crt' : 'Upload certificado'}</Label>
            <Input type="file" accept=".crt,.cer,.pem,.pfx" onChange={(event) => props.setCertificateFile(event.target.files?.[0] || null)} className="mt-1" />
          </div>
          {props.bankCode === 'INTER' ? (
            <div>
              <Label>Upload chave privada .key</Label>
              <Input type="file" accept=".key,.pem" onChange={(event) => props.setPrivateKeyFile(event.target.files?.[0] || null)} className="mt-1" />
            </div>
          ) : (
            <div>
              <Label>Senha certificado, se aplicável</Label>
              <Input type="password" value={props.certificatePassword} onChange={(event) => props.setCertificatePassword(event.target.value)} className="mt-1" />
            </div>
          )}
        </>
      )}

      {!props.isApiMode && (
        <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>Esta conta está configurada para importação manual de extrato.</span>
        </div>
      )}
    </div>
  );
}
