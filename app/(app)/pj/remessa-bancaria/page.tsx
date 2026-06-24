'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Download, Upload, FileText, CheckCircle, AlertCircle, Building } from 'lucide-react';

interface BoletoItem {
  id: string;
  customerName: string;
  amount: number;
  dueDate: string;
  status: string;
}

interface BankConn {
  id: string;
  name: string;
}

type Tab = 'remessa' | 'retorno';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

export default function RemessaBancariaPage() {
  const [tab, setTab] = useState<Tab>('remessa');
  const [boletos, setBoletos] = useState<BoletoItem[]>([]);
  const [bankConns, setBankConns] = useState<BankConn[]>([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Retorno state
  const [retornoFile, setRetornoFile] = useState<File | null>(null);
  const [retornoPreview, setRetornoPreview] = useState<any | null>(null);
  const [processing, setProcessing] = useState(false);
  const [retornoResult, setRetornoResult] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [boletosRes, banksRes] = await Promise.all([
      apiFetch('/api/pj/cobrancas?status=pendente&type=boleto'),
      apiFetch('/api/pj/bancos'),
    ]);
    const boletosData = await boletosRes.json();
    const banksData = await banksRes.json();
    setBoletos(Array.isArray(boletosData) ? boletosData : []);
    const banks = Array.isArray(banksData) ? banksData : [];
    setBankConns(banks);
    if (banks.length > 0 && !selectedBank) setSelectedBank(banks[0].id);
    setLoading(false);
  }, [selectedBank]);

  useEffect(() => { loadData(); }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === boletos.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(boletos.map((b) => b.id)));
  };

  const generateRemessa = async () => {
    if (selectedIds.size === 0) { toast.error('Selecione ao menos um boleto'); return; }
    setGenerating(true);
    try {
      const r = await apiFetch('/api/pj/cnab/remessa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boletoIds: Array.from(selectedIds), bankConnectionId: selectedBank }),
      });
      if (!r.ok) { const d = await r.json(); toast.error(d.error || 'Erro ao gerar CNAB'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remessa_${new Date().toISOString().slice(0, 10)}.rem`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Arquivo de remessa gerado com ${selectedIds.size} boleto(s)`);
      setSelectedIds(new Set());
    } finally { setGenerating(false); }
  };

  const handleRetornoFile = async (file: File) => {
    setRetornoFile(file);
    setRetornoResult(null);
    const formData = new FormData();
    formData.append('file', file);
    const r = await apiFetch('/api/pj/cnab/retorno', { method: 'POST', body: formData });
    const d = await r.json();
    setRetornoPreview(d);
  };

  const processRetorno = async () => {
    if (!retornoFile) return;
    setProcessing(true);
    const formData = new FormData();
    formData.append('file', retornoFile);
    const r = await apiFetch('/api/pj/cnab/retorno?confirm=true', { method: 'POST', body: formData });
    const d = await r.json();
    if (r.ok) {
      toast.success(`Retorno processado: ${d.processed} boleto(s) baixado(s)`);
      setRetornoResult(d);
      setRetornoPreview(null);
      setRetornoFile(null);
    } else {
      toast.error(d.error || 'Erro ao processar retorno');
    }
    setProcessing(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Remessa Bancária</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Envio de remessa CNAB 240 e processamento de retorno bancário</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card/60 border border-border rounded-xl p-1 w-fit">
        {([
          { id: 'remessa' as Tab, label: 'Envio de Remessa' },
          { id: 'retorno' as Tab, label: 'Retorno Bancário' },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-muted text-white' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'remessa' && (
        <>
          {/* Bank selector + actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-muted-foreground" />
              <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}
                className="bg-card border border-border text-foreground rounded-lg px-3 py-2 text-sm">
                <option value="">Selecionar banco</option>
                {bankConns.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <button onClick={generateRemessa} disabled={generating || selectedIds.size === 0}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
              <Download className="w-4 h-4" />
              {generating ? 'Gerando...' : `Gerar CNAB (${selectedIds.size} selecionado(s))`}
            </button>
          </div>

          {/* Boletos table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <input type="checkbox" checked={selectedIds.size === boletos.length && boletos.length > 0}
                onChange={selectAll} className="rounded" />
              <span className="text-foreground font-medium">Boletos pendentes ({boletos.length})</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="w-10 px-4 py-3"></th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Cliente</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Valor</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Vencimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>
                ) : boletos.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhum boleto pendente</td></tr>
                ) : boletos.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => toggleSelect(b.id)}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedIds.has(b.id)} readOnly className="rounded" />
                    </td>
                    <td className="px-4 py-3 text-foreground">{b.customerName}</td>
                    <td className="px-4 py-3 text-right text-foreground font-medium">{fmt(b.amount)}</td>
                    <td className="px-4 py-3 text-foreground">{fmtDate(b.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'retorno' && (
        <div className="space-y-4">
          {/* Upload area */}
          <div
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleRetornoFile(file);
            }}
          >
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-foreground font-medium">
              {retornoFile ? retornoFile.name : 'Arraste ou clique para enviar o arquivo .ret'}
            </p>
            <p className="text-muted-foreground text-xs mt-1">Formato CNAB 240</p>
            <input ref={fileInputRef} type="file" accept=".ret,.txt" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRetornoFile(f); }} />
          </div>

          {/* Preview */}
          {retornoPreview && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-foreground font-medium">Preview do retorno</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/60 rounded-lg p-3 text-center">
                  <p className="text-muted-foreground text-xs">Total</p>
                  <p className="font-bold text-lg">{retornoPreview.total}</p>
                </div>
                <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3 text-center">
                  <p className="text-green-300 text-xs">Pagos</p>
                  <p className="text-green-400 font-bold text-lg">{retornoPreview.paid}</p>
                </div>
                <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-center">
                  <p className="text-red-300 text-xs">Erros/Outros</p>
                  <p className="text-red-400 font-bold text-lg">{retornoPreview.errors}</p>
                </div>
              </div>
              <button onClick={processRetorno} disabled={processing}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {processing ? 'Processando...' : 'Confirmar e Processar Retorno'}
              </button>
            </div>
          )}

          {/* Result */}
          {retornoResult && (
            <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-green-300 font-medium">Retorno processado com sucesso</span>
              </div>
              <p className="text-green-400/80 text-sm">
                {retornoResult.processed} boleto(s) baixado(s) de {retornoResult.paid} pagamento(s) encontrado(s).
                {retornoResult.failed > 0 && ` ${retornoResult.failed} erro(s) ao baixar.`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
