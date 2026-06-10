'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle, Clock, Plus, RefreshCw, Send, Trash2, XCircle } from 'lucide-react';

interface NFCe {
  id: string;
  number?: string;
  status: string;
  customerName?: string;
  customerDoc?: string;
  totals?: { totalNota: number };
  issuedAt?: string;
  createdAt: string;
  pdfUrl?: string;
  accessKey?: string;
  errorMessage?: string;
  items?: any[];
}

interface Item {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal?: number;
  cfop?: string;
  ncm?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho: { label: 'Rascunho', color: 'text-slate-400 bg-slate-800', icon: <Clock className="w-3.5 h-3.5" /> },
  enviada: { label: 'Enviada', color: 'text-blue-400 bg-blue-900/30', icon: <Send className="w-3.5 h-3.5" /> },
  autorizada: { label: 'Autorizada', color: 'text-green-400 bg-green-900/30', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  cancelada: { label: 'Cancelada', color: 'text-red-400 bg-red-900/30', icon: <XCircle className="w-3.5 h-3.5" /> },
  rejeitada: { label: 'Rejeitada', color: 'text-orange-400 bg-orange-900/30', icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '-';

const EMPTY_ITEM: Item = { descricao: '', quantidade: 1, valorUnitario: 0, cfop: '5102', ncm: '' };

export default function NFCePage() {
  const [nfces, setNfces] = useState<NFCe[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelModal, setCancelModal] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerDoc, setCustomerDoc] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [observations, setObservations] = useState('');
  const [items, setItems] = useState<Item[]>([{ ...EMPTY_ITEM }]);
  const [emitNow, setEmitNow] = useState(false);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (statusFilter) params.set('status', statusFilter);
    const r = await apiFetch(`/api/pj/nfce?${params}`);
    const d = await r.json();
    setNfces(d.nfces || []);
    setTotal(d.total || 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, [page, statusFilter]);

  const totalNota = items.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof Item, value: string | number) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const resetForm = () => {
    setCustomerName(''); setCustomerDoc(''); setPaymentMethod('dinheiro');
    setObservations(''); setItems([{ ...EMPTY_ITEM }]); setEmitNow(false);
  };

  const handleSubmit = async () => {
    if (!items.some((i) => i.descricao && i.quantidade > 0 && i.valorUnitario > 0)) {
      toast.error('Adicione pelo menos um item válido'); return;
    }
    setSaving(true);
    const payload = {
      customerName: customerName || null,
      customerDoc: customerDoc || null,
      paymentMethod,
      observations: observations || null,
      emit: emitNow,
      items: items.map((i) => ({
        ...i,
        valorTotal: i.quantidade * i.valorUnitario,
      })),
    };
    const res = await apiFetch('/api/pj/nfce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success(emitNow ? 'NFC-e enviada para emissão' : 'NFC-e criada como rascunho');
      setShowForm(false);
      resetForm();
      load();
    } else {
      const d = await res.json();
      toast.error(d.error || 'Erro ao criar NFC-e');
    }
    setSaving(false);
  };

  const emitDraft = async (id: string) => {
    const r = await apiFetch(`/api/pj/nfce?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'emit' }),
    });
    if (r.ok) { toast.success('Enviada para emissão'); load(); }
    else { const d = await r.json(); toast.error(d.error || 'Erro'); }
  };

  const cancelNFCe = async () => {
    if (!cancelModal) return;
    const r = await apiFetch(`/api/pj/nfce?id=${cancelModal}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', reason: cancelReason }),
    });
    if (r.ok) { toast.success('NFC-e cancelada'); setCancelModal(null); setCancelReason(''); load(); }
    else { const d = await r.json(); toast.error(d.error || 'Erro'); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">NFC-e</h1>
          <p className="text-slate-400 text-sm mt-0.5">Nota Fiscal do Consumidor Eletrônica — Série 65</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Nova NFC-e
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <span className="text-slate-400 text-sm">{total} nota(s)</span>
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Número</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Consumidor</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Total</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Data</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
            ) : nfces.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nenhuma NFC-e encontrada</td></tr>
            ) : nfces.map((nfce) => {
              const cfg = STATUS_CONFIG[nfce.status] || STATUS_CONFIG.rascunho;
              return (
                <tr key={nfce.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-3 text-white font-mono text-xs">
                    {nfce.number ? `65/${nfce.number}` : <span className="text-slate-500">Rascunho</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white text-sm">{nfce.customerName || <span className="text-slate-500 italic">Consumidor final</span>}</div>
                    {nfce.customerDoc && <div className="text-slate-400 text-xs">{nfce.customerDoc}</div>}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-medium">
                    {fmt(nfce.totals?.totalNota ?? 0)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                      {cfg.icon}{cfg.label}
                    </span>
                    {nfce.errorMessage && (
                      <div className="text-orange-400 text-xs mt-0.5 max-w-[200px] truncate">{nfce.errorMessage}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {fmtDate(nfce.issuedAt || nfce.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {nfce.status === 'rascunho' && (
                        <button onClick={() => emitDraft(nfce.id)}
                          className="px-2 py-1 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded text-xs">
                          Emitir
                        </button>
                      )}
                      {nfce.pdfUrl && (
                        <a href={nfce.pdfUrl} target="_blank" rel="noopener noreferrer"
                          className="px-2 py-1 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded text-xs">
                          DANFC-e
                        </a>
                      )}
                      {nfce.status === 'autorizada' && (
                        <button onClick={() => { setCancelModal(nfce.id); setCancelReason(''); }}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded">
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-sm disabled:opacity-40">
            Anterior
          </button>
          <span className="px-3 py-1.5 text-slate-400 text-sm">
            Pág. {page} / {Math.ceil(total / 20)}
          </span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / 20)}
            className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-sm disabled:opacity-40">
            Próxima
          </button>
        </div>
      )}

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-white font-bold text-lg">Nova NFC-e</h3>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Consumidor */}
              <div>
                <h4 className="text-slate-300 text-sm font-medium mb-3">Consumidor (opcional)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Nome</label>
                    <input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Consumidor final"
                      className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">CPF (opcional)</label>
                    <input value={customerDoc} onChange={(e) => setCustomerDoc(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-slate-300 text-sm font-medium">Itens</h4>
                  <button onClick={addItem} className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Adicionar item
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-900/50 p-2 rounded-lg">
                      <div className="col-span-5">
                        <input value={item.descricao} onChange={(e) => updateItem(idx, 'descricao', e.target.value)}
                          placeholder="Descrição do produto"
                          className="w-full bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-xs" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="1" value={item.quantidade}
                          onChange={(e) => updateItem(idx, 'quantidade', parseFloat(e.target.value) || 1)}
                          placeholder="Qtd"
                          className="w-full bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-xs" />
                      </div>
                      <div className="col-span-3">
                        <input type="number" min="0" step="0.01" value={item.valorUnitario}
                          onChange={(e) => updateItem(idx, 'valorUnitario', parseFloat(e.target.value) || 0)}
                          placeholder="Valor unit."
                          className="w-full bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-xs" />
                      </div>
                      <div className="col-span-1 text-right text-slate-400 text-xs">
                        {fmt(item.quantidade * item.valorUnitario)}
                      </div>
                      <div className="col-span-1 text-right">
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-right mt-2 text-white font-bold text-sm">
                  Total: {fmt(totalNota)}
                </div>
              </div>

              {/* Payment & observations */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Forma de pagamento</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm">
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_credito">Cartão de Crédito</option>
                    <option value="cartao_debito">Cartão de Débito</option>
                    <option value="pix">PIX</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Observações</label>
                  <input value={observations} onChange={(e) => setObservations(e.target.value)}
                    placeholder="Informações adicionais"
                    className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={emitNow} onChange={(e) => setEmitNow(e.target.checked)}
                  className="w-4 h-4" />
                Emitir imediatamente (requer integração com SEFAZ)
              </label>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
              <button onClick={() => { setShowForm(false); resetForm(); }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-60">
                {saving ? 'Salvando...' : emitNow ? 'Emitir NFC-e' : 'Salvar Rascunho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-white font-bold">Cancelar NFC-e</h3>
            <p className="text-slate-400 text-sm">Informe o motivo do cancelamento (mínimo 15 caracteres).</p>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              rows={3} placeholder="Motivo do cancelamento..."
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-3">
              <button onClick={() => setCancelModal(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm">
                Voltar
              </button>
              <button onClick={cancelNFCe} disabled={cancelReason.length < 15}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-60">
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
