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
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Settings2,
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
  openingBalance?: number | null;
  currentBalance?: number | null;
  allowsPayments?: boolean;
  allowsReceipts?: boolean;
  allowsTransfers?: boolean;
  extraConfig?: Record<string, any> | null;
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

  // ── Edit connection state ──────────────────────────────────────────────────
  const [editConnection, setEditConnection] = useState<BankConnection | null>(null);
  const [editTab, setEditTab] = useState<'basico' | 'bancario' | 'boleto' | 'pix' | 'conciliacao' | 'integracao'>('basico');
  // Dados básicos
  const [editName, setEditName] = useState('');
  const [editOpeningBalance, setEditOpeningBalance] = useState('');
  const [editOpeningDate, setEditOpeningDate] = useState('');
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [editAllowsPayments, setEditAllowsPayments] = useState(false);
  const [editAllowsReceipts, setEditAllowsReceipts] = useState(false);
  const [editAllowsTransfers, setEditAllowsTransfers] = useState(false);
  // Dados bancários
  const [editAgency, setEditAgency] = useState('');
  const [editAccount, setEditAccount] = useState('');
  const [editAccountDigit, setEditAccountDigit] = useState('');
  const [editLimit, setEditLimit] = useState('');
  const [editFinePercent, setEditFinePercent] = useState('');
  const [editInterestPercent, setEditInterestPercent] = useState('');
  const [editDiscountPercent, setEditDiscountPercent] = useState('');
  const [editDaysBeforeDue, setEditDaysBeforeDue] = useState('');
  // Boleto
  const [editBoletoEnabled, setEditBoletoEnabled] = useState(false);
  const [editBoletoUseApi, setEditBoletoUseApi] = useState(false);
  const [editBoletoDaysToSettle, setEditBoletoDaysToSettle] = useState('30');
  const [editBoletoMinValue, setEditBoletoMinValue] = useState('');
  const [editBoletoGracePeriod, setEditBoletoGracePeriod] = useState('');
  const [editBoletoInstructions, setEditBoletoInstructions] = useState('');
  // Pix
  const [editPixEnabled, setEditPixEnabled] = useState(false);
  const [editPixKey, setEditPixKey] = useState('');
  const [editPixKeyType, setEditPixKeyType] = useState('cpf');
  // Conciliação
  const [editAutoReconcile, setEditAutoReconcile] = useState(false);
  const [editSaveLoading, setEditSaveLoading] = useState(false);
  // Integração (credentials update)
  const [editClientId, setEditClientId] = useState('');
  const [editClientSecret, setEditClientSecret] = useState('');
  const [editCertFile, setEditCertFile] = useState<File | null>(null);
  const [editKeyFile, setEditKeyFile] = useState<File | null>(null);
  const [editAutoExtrato, setEditAutoExtrato] = useState(false);
  const [editIsPF, setEditIsPF] = useState(false);
  // Extra banking fields
  const [editMultaType, setEditMultaType] = useState('Percentual');
  const [editJurosTipo, setEditJurosTipo] = useState('Mensal');
  const [editDescontoTipo, setEditDescontoTipo] = useState('');
  const [editDescontoValue, setEditDescontoValue] = useState('');
  const [editDaysAntecDesconto, setEditDaysAntecDesconto] = useState('0');

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
    if (editConnection?.id === connection.id) setEditConnection(null);
    await loadConnections();
    setBusy(null);
  };

  const openEditDialog = (conn: BankConnection) => {
    const ex: any = conn.extraConfig || {};
    setEditConnection(conn);
    setEditTab('basico');
    setEditName(conn.bankName || '');
    setEditOpeningBalance(String(conn.openingBalance ?? ''));
    setEditOpeningDate(ex.openingDate || '');
    setEditIsDefault(ex.isDefault || false);
    setEditAllowsPayments(conn.allowsPayments || false);
    setEditAllowsReceipts(conn.allowsReceipts || false);
    setEditAllowsTransfers(conn.allowsTransfers || false);
    setEditAgency(conn.agency || '');
    setEditAccount(conn.accountNumber || '');
    setEditAccountDigit(conn.accountDigit || '');
    setEditLimit(String(ex.limit ?? ''));
    setEditFinePercent(String(ex.finePercent ?? ''));
    setEditInterestPercent(String(ex.interestPercent ?? ''));
    setEditDiscountPercent(String(ex.discountPercent ?? ''));
    setEditDaysBeforeDue(String(ex.daysBeforeDue ?? ''));
    const boleto = ex.boleto || {};
    setEditBoletoEnabled(boleto.enabled || false);
    setEditBoletoUseApi(boleto.useApi || false);
    setEditBoletoDaysToSettle(String(boleto.daysToSettle ?? '30'));
    setEditBoletoMinValue(String(boleto.minValue ?? ''));
    setEditBoletoGracePeriod(String(boleto.gracePeriod ?? ''));
    setEditBoletoInstructions(boleto.instructions || '');
    const pix = ex.pix || {};
    setEditPixEnabled(pix.enabled || false);
    setEditPixKey(pix.key || '');
    setEditPixKeyType(pix.keyType || 'cpf');
    setEditAutoReconcile(ex.autoReconciliation?.enabled || false);
    // Integração
    setEditClientId('');
    setEditClientSecret('');
    setEditCertFile(null);
    setEditKeyFile(null);
    setEditAutoExtrato(ex.autoExtrato || false);
    setEditIsPF(conn.personType === 'PF');
    // Extra banking fields
    setEditMultaType(ex.multaType || 'Percentual');
    setEditJurosTipo(ex.jurosTipo || 'Mensal');
    setEditDescontoTipo(ex.descontoTipo || '');
    setEditDescontoValue(String(ex.descontoValue ?? ''));
    setEditDaysAntecDesconto(String(ex.daysAntecDesconto ?? '0'));
  };

  const saveEdit = async () => {
    if (!editConnection) return;
    setEditSaveLoading(true);
    try {
      const extraConfig = {
        openingDate: editOpeningDate || null,
        isDefault: editIsDefault,
        limit: parseFloat(editLimit) || 0,
        finePercent: parseFloat(editFinePercent) || 0,
        multaType: editMultaType,
        interestPercent: parseFloat(editInterestPercent) || 0,
        jurosTipo: editJurosTipo,
        discountPercent: parseFloat(editDiscountPercent) || 0,
        descontoTipo: editDescontoTipo,
        descontoValue: parseFloat(editDescontoValue) || 0,
        daysBeforeDue: parseInt(editDaysBeforeDue) || 0,
        daysAntecDesconto: parseInt(editDaysAntecDesconto) || 0,
        isPF: editIsPF,
        autoExtrato: editAutoExtrato,
        boleto: {
          enabled: editBoletoEnabled,
          useApi: editBoletoUseApi,
          daysToSettle: parseInt(editBoletoDaysToSettle) || 30,
          minValue: parseFloat(editBoletoMinValue) || 0,
          gracePeriod: parseInt(editBoletoGracePeriod) || 0,
          instructions: editBoletoInstructions,
        },
        pix: {
          enabled: editPixEnabled,
          key: editPixKey,
          keyType: editPixKeyType,
        },
        autoReconciliation: { enabled: editAutoReconcile },
      };

      const certText = editCertFile ? await editCertFile.text() : undefined;
      const keyText  = editKeyFile  ? await editKeyFile.text()  : undefined;

      const res = await apiFetch(`/api/banking/connections/${editConnection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName: editName,
          agency: editAgency,
          accountNumber: editAccount,
          accountDigit: editAccountDigit,
          openingBalance: parseFloat(editOpeningBalance) || 0,
          allowsPayments: editAllowsPayments,
          allowsReceipts: editAllowsReceipts,
          allowsTransfers: editAllowsTransfers,
          extraConfig,
          ...(editClientId     && { clientId: editClientId }),
          ...(editClientSecret && { clientSecret: editClientSecret }),
          ...(certText         && { certificate: certText }),
          ...(keyText          && { privateKey: keyText }),
        }),
      });
      if (res.ok) {
        setEditConnection(null);
        await loadConnections();
        setMessage('Conta bancária atualizada com sucesso.');
      } else {
        const d = await res.json();
        setError(d.error || 'Erro ao salvar alterações.');
      }
    } finally {
      setEditSaveLoading(false);
    }
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
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(connection)} className="gap-2">
                      <Settings2 className="h-4 w-4" />
                      Configurar
                    </Button>
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

      {/* ── Edit connection dialog ─────────────────────────────────────────── */}
      <Dialog open={!!editConnection} onOpenChange={(open) => { if (!open) setEditConnection(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-blue-600" />
              Configurar Conta Bancária
            </DialogTitle>
          </DialogHeader>

          {/* Tab bar */}
          <div className="flex flex-wrap gap-1 border-b pb-2">
            {([
              { id: 'basico', label: 'Dados Básicos' },
              { id: 'bancario', label: 'Conta Bancária' },
              { id: 'boleto', label: 'Boleto' },
              { id: 'pix', label: 'Pix Cobrança' },
              { id: 'conciliacao', label: 'Conciliação' },
              { id: 'integracao', label: 'Integração' },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => setEditTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${editTab === t.id ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-4 pt-1">

            {/* ── Dados Básicos ───────────────────────────────────── */}
            {editTab === 'basico' && (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label>Nome da Conta</Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1" placeholder="Ex: Conta Principal" />
                  </div>
                  <div>
                    <Label>Data Abertura</Label>
                    <Input type="date" value={editOpeningDate} onChange={e => setEditOpeningDate(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label>Saldo de Abertura (R$)</Label>
                    <Input type="number" step="0.01" value={editOpeningBalance} onChange={e => setEditOpeningBalance(e.target.value)} className="mt-1" placeholder="0,00" />
                  </div>
                  <div>
                    <Label>Empresa</Label>
                    <Input value={editConnection?.personType === 'PF' ? 'Pessoa Física' : 'Empresa'} readOnly className="mt-1 bg-muted cursor-not-allowed text-muted-foreground" />
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-sm font-medium">Configurações da conta</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {([
                      { label: 'Conta padrão', val: editIsDefault, set: setEditIsDefault },
                      { label: 'Permite Pagamentos', val: editAllowsPayments, set: setEditAllowsPayments },
                      { label: 'Permite Recebimentos', val: editAllowsReceipts, set: setEditAllowsReceipts },
                      { label: 'Permite Transferência', val: editAllowsTransfers, set: setEditAllowsTransfers },
                      { label: 'Conta Pessoa Física', val: editIsPF, set: setEditIsPF },
                    ] as const).map(item => (
                      <div key={item.label} className="flex items-center justify-between gap-2">
                        <span className="text-sm">{item.label}</span>
                        <div className="flex rounded-md overflow-hidden border border-border">
                          <button
                            type="button"
                            onClick={() => item.set(true)}
                            className={`px-3 py-1 text-xs font-medium transition-colors ${item.val ? 'bg-blue-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                          >Sim</button>
                          <button
                            type="button"
                            onClick={() => item.set(false)}
                            className={`px-3 py-1 text-xs font-medium transition-colors border-l border-border ${!item.val ? 'bg-blue-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                          >Não</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Conta Bancária ──────────────────────────────────── */}
            {editTab === 'bancario' && (
              <div className="grid gap-4">
                <div>
                  <Label>Banco/Operadora</Label>
                  <Input value={editConnection?.bankName || ''} readOnly className="mt-1 bg-muted cursor-not-allowed text-muted-foreground" />
                </div>

                <div className="grid sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <Label>Agência</Label>
                    <Input value={editAgency} onChange={e => setEditAgency(e.target.value)} className="mt-1" placeholder="0001" />
                  </div>
                  <div>
                    <Label>Conta</Label>
                    <Input value={editAccount} onChange={e => setEditAccount(e.target.value)} className="mt-1" placeholder="123456" />
                  </div>
                  <div>
                    <Label>Dígito</Label>
                    <Input value={editAccountDigit} onChange={e => setEditAccountDigit(e.target.value)} className="mt-1" placeholder="0" />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Limite de crédito (R$)</Label>
                    <Input type="number" step="0.01" value={editLimit} onChange={e => setEditLimit(e.target.value)} className="mt-1" placeholder="0,00" />
                  </div>
                  <div>
                    <Label>Dias antecedência para boleto</Label>
                    <Input type="number" value={editDaysBeforeDue} onChange={e => setEditDaysBeforeDue(e.target.value)} className="mt-1" placeholder="5" />
                  </div>
                </div>

                {/* Multa */}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Multa</Label>
                    <select value={editMultaType} onChange={e => setEditMultaType(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="Percentual">Percentual</option>
                      <option value="Fixo">Fixo</option>
                    </select>
                  </div>
                  <div>
                    <Label>Valor {editMultaType === 'Percentual' ? '(%)' : '(R$)'}</Label>
                    <Input type="number" step="0.01" value={editFinePercent} onChange={e => setEditFinePercent(e.target.value)} className="mt-1" placeholder="2,00" />
                  </div>
                </div>

                {/* Juros */}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Juros</Label>
                    <select value={editJurosTipo} onChange={e => setEditJurosTipo(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="Mensal">Mensal</option>
                      <option value="Anual">Anual</option>
                      <option value="Diário">Diário</option>
                    </select>
                  </div>
                  <div>
                    <Label>Valor (%)</Label>
                    <Input type="number" step="0.01" value={editInterestPercent} onChange={e => setEditInterestPercent(e.target.value)} className="mt-1" placeholder="1,00" />
                  </div>
                </div>

                {/* Desconto */}
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <Label>Desconto</Label>
                    <select value={editDescontoTipo} onChange={e => setEditDescontoTipo(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">Selecione</option>
                      <option value="Percentual">Percentual</option>
                      <option value="Fixo">Fixo</option>
                    </select>
                  </div>
                  <div>
                    <Label>Valor {editDescontoTipo === 'Percentual' ? '(%)' : '(R$)'}</Label>
                    <Input type="number" step="0.01" value={editDescontoValue} onChange={e => setEditDescontoValue(e.target.value)} className="mt-1" placeholder="0,00" disabled={!editDescontoTipo} />
                  </div>
                  <div>
                    <Label>Dias antecedência para desconto</Label>
                    <Input type="number" value={editDaysAntecDesconto} onChange={e => setEditDaysAntecDesconto(e.target.value)} className="mt-1" placeholder="0" disabled={!editDescontoTipo} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Boleto ──────────────────────────────────────────── */}
            {editTab === 'boleto' && (
              <div className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editBoletoEnabled} onChange={e => setEditBoletoEnabled(e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="font-medium">Emitir Boletos nesta conta</span>
                </label>

                {editBoletoEnabled && (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editBoletoUseApi} onChange={e => setEditBoletoUseApi(e.target.checked)} className="w-4 h-4 rounded" />
                      <span className="text-sm">Emitir via API bancária</span>
                    </label>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Prazo de vencimento (dias)</Label>
                        <Input type="number" value={editBoletoDaysToSettle} onChange={e => setEditBoletoDaysToSettle(e.target.value)} className="mt-1" placeholder="30" />
                      </div>
                      <div>
                        <Label>Valor mínimo (R$)</Label>
                        <Input type="number" step="0.01" value={editBoletoMinValue} onChange={e => setEditBoletoMinValue(e.target.value)} className="mt-1" placeholder="5,00" />
                      </div>
                      <div>
                        <Label>Prazo de baixa automática (dias)</Label>
                        <Input type="number" value={editBoletoGracePeriod} onChange={e => setEditBoletoGracePeriod(e.target.value)} className="mt-1" placeholder="60" />
                      </div>
                    </div>
                    <div>
                      <Label>Instruções no boleto</Label>
                      <textarea
                        value={editBoletoInstructions}
                        onChange={e => setEditBoletoInstructions(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Ex: Após o vencimento cobrar multa de 2% e juros de 1% ao mês."
                      />
                    </div>
                  </>
                )}

                {!editBoletoEnabled && (
                  <p className="text-sm text-muted-foreground">Ative para configurar emissão de boletos nesta conta.</p>
                )}
              </div>
            )}

            {/* ── Pix Cobrança ────────────────────────────────────── */}
            {editTab === 'pix' && (
              <div className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editPixEnabled} onChange={e => setEditPixEnabled(e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="font-medium">Ativar Pix Cobrança nesta conta</span>
                </label>

                {editPixEnabled && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Tipo de chave Pix</Label>
                      <select
                        value={editPixKeyType}
                        onChange={e => setEditPixKeyType(e.target.value)}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="cpf">CPF</option>
                        <option value="cnpj">CNPJ</option>
                        <option value="email">E-mail</option>
                        <option value="phone">Telefone</option>
                        <option value="random">Chave aleatória</option>
                      </select>
                    </div>
                    <div>
                      <Label>Chave Pix</Label>
                      <Input value={editPixKey} onChange={e => setEditPixKey(e.target.value)} className="mt-1" placeholder="Ex: 00.000.000/0000-00" />
                    </div>
                  </div>
                )}

                {editPixEnabled && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex gap-2">
                    <QrCode className="w-4 h-4 mt-0.5 shrink-0" />
                    A chave Pix é usada para geração de QR Codes de cobrança nas notas e recebimentos.
                  </div>
                )}

                {!editPixEnabled && (
                  <p className="text-sm text-muted-foreground">Ative para configurar Pix Cobrança e geração de QR Codes nesta conta.</p>
                )}
              </div>
            )}

            {/* ── Conciliação ─────────────────────────────────────── */}
            {editTab === 'conciliacao' && (
              <div className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editAutoReconcile} onChange={e => setEditAutoReconcile(e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="font-medium">Conciliação automática ao importar extrato</span>
                </label>
                <p className="text-sm text-muted-foreground">
                  Quando ativada, o sistema tentará vincular automaticamente cada lançamento do extrato com os contas a pagar/receber ao importar.
                </p>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Regras de conciliação avançadas (por texto, categoria, valor exato) disponíveis na próxima versão.
                </div>
              </div>
            )}

            {/* ── Integração ──────────────────────────────────────── */}
            {editTab === 'integracao' && editConnection && (
              <div className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-5">
                  {/* Left: Credentials */}
                  <div className="space-y-4 rounded-lg border p-4">
                    <p className="text-sm font-semibold">Integração Bancária</p>

                    {editConnection.bankCode?.toUpperCase() === 'INTER' && (
                      <>
                        <div>
                          <Label>Client ID</Label>
                          <Input value={editClientId} onChange={e => setEditClientId(e.target.value)} placeholder="Informe para atualizar" autoComplete="off" className="mt-1" />
                        </div>
                        <div>
                          <Label>Client Secret</Label>
                          <Input type="password" value={editClientSecret} onChange={e => setEditClientSecret(e.target.value)} placeholder="Informe para atualizar" autoComplete="new-password" className="mt-1" />
                        </div>
                        <div>
                          <Label>Certificado (.crt)</Label>
                          <Input type="file" accept=".crt,.cer,.pem" onChange={e => setEditCertFile(e.target.files?.[0] || null)} className="mt-1" />
                          {editCertFile && <p className="mt-1 text-xs text-muted-foreground">{editCertFile.name}</p>}
                        </div>
                        <div>
                          <Label>Chave privada (.key)</Label>
                          <Input type="file" accept=".key,.pem" onChange={e => setEditKeyFile(e.target.files?.[0] || null)} className="mt-1" />
                          {editKeyFile && <p className="mt-1 text-xs text-muted-foreground">{editKeyFile.name}</p>}
                        </div>
                      </>
                    )}

                    {editConnection.bankCode?.toUpperCase() === 'ITAU' && (
                      <div>
                        <Label>Id Item</Label>
                        <Input value={editConnection.id} readOnly className="mt-1 bg-muted cursor-not-allowed font-mono text-xs" />
                        <p className="mt-1 text-xs text-muted-foreground">Identificador desta conexão para o sistema Itaú.</p>
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeConnection(editConnection)}
                      className="mt-2 w-full gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                      Desconectar
                    </Button>
                  </div>

                  {/* Right: Services */}
                  <div className="space-y-4 rounded-lg border p-4">
                    <p className="text-sm font-semibold">{editConnection.bankName}</p>
                    <table className="w-full text-sm">
                      <tbody>
                        {[
                          { label: 'Extrato', enabled: true },
                          { label: 'Boleto', enabled: editBoletoEnabled },
                          { label: 'Pix', enabled: editPixEnabled },
                        ].map(row => (
                          <tr key={row.label} className="border-b last:border-0">
                            <td className="py-2 text-muted-foreground">{row.label}</td>
                            <td className={`py-2 text-right font-semibold ${row.enabled ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                              {row.enabled ? 'Sim' : 'Não'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Button type="button" variant="outline" size="sm" className="w-full gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Atualizar serviços
                    </Button>
                  </div>
                </div>

                {/* Auto extrato toggle (API only) */}
                {editConnection.connectionMode === 'API' && (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Importação de Extrato automático</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Sincroniza o extrato bancário automaticamente a cada dia.</p>
                      </div>
                      <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
                        <button
                          type="button"
                          onClick={() => setEditAutoExtrato(true)}
                          className={`px-4 py-1.5 text-xs font-medium transition-colors ${editAutoExtrato ? 'bg-blue-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                        >Sim</button>
                        <button
                          type="button"
                          onClick={() => setEditAutoExtrato(false)}
                          className={`px-4 py-1.5 text-xs font-medium transition-colors border-l border-border ${!editAutoExtrato ? 'bg-blue-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                        >Não</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          <div className="flex justify-between border-t pt-4">
            <Button variant="outline" onClick={() => setEditConnection(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={editSaveLoading} className="gap-2 bg-blue-600 text-white hover:bg-blue-700 min-w-[100px]">
              {editSaveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
