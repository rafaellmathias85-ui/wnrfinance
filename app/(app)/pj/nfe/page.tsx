'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle, Clock, Download, Plus, RefreshCw, Send, XCircle } from 'lucide-react';


interface NFe {
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
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho: { label: 'Rascunho', color: 'text-slate-400 bg-slate-800', icon: <Clock className="w-3.5 h-3.5" /> },
  enviada: { label: 'Enviada', color: 'text-blue-400 bg-blue-900/30', icon: <Send className="w-3.5 h-3.5" /> },
  autorizada: { label: 'Autorizada', color: 'text-green-400 bg-green-900/30', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  cancelada: { label: 'Cancelada', color: 'text-red-400 bg-red-900/30', icon: <XCircle className="w-3.5 h-3.5" /> },
  rejeitada: { label: 'Rejeitada', color: 'text-orange-400 bg-orange-900/30', icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

const fmtCurrency = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '-';

export default function NFePage() {
  const [nfes, setNfes] = useState<NFe[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelModal, setCancelModal] = useState<{ id: string; providerNFeId: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (statusFilter) params.set('status', statusFilter);
    const r = await apiFetch(`/api/pj/nfe?${params}`);
    const d = await r.json();
    setNfes(d.nfes || []);
    setTotal(d.total || 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, [page, statusFilter]);

  const syncStatus = async (id: string) => {
    const r = await apiFetch(`/api/pj/nfe/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_status' }),
    });
    if (r.ok) { toast.success('Status atualizado'); load(); }
    else toast.error('Erro ao sincronizar status');
  };

  const cancelNFe = async () => {
    if (!cancelModal || cancelReason.length < 15) {
      toast.error('Justificativa deve ter pelo menos 15 caracteres');
      return;
    }
    const r = await apiFetch(`/api/pj/nfe/${cancelModal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', cancelReason }),
    });
    const d = await r.json();
    if (d.success) { toast.success('NF-e cancelada'); setCancelModal(null); setCancelReason(''); load(); }
    else toast.error(d.errorMessage || 'Erro ao cancelar');
  };

  const emitDraft = async (id: string) => {
    const r = await apiFetch(`/api/pj/nfe/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'emit' }),
    });
    const d = await r.json();
    if (d.success) { toast.success('NF-e emitida com sucesso!'); load(); }
    else toast.error(d.errorMessage || 'Erro ao emitir NF-e');
  };

  const totals = nfes.reduce((acc, n) => {
    const val = (n.totals as any)?.totalNota || 0;
    if (n.status === 'autorizada') acc.authorized += val;
    acc.total += val;
    return acc;
  }, { authorized: 0, total: 0 });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notas Fiscais</h1>
          <p className="text-slate-400 text-sm mt-0.5">Emissão de NF-e e NFS-e</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova NF-e
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Total de NF-e</p>
          <p className="text-2xl font-bold text-white mt-1">{total}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Valor Autorizado</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{fmtCurrency(totals.authorized)}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Total no Período</p>
          <p className="text-2xl font-bold text-white mt-1">{fmtCurrency(totals.total)}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Número</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Destinatário</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Emissão</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Valor</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Status</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
            ) : nfes.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhuma nota fiscal encontrada</td></tr>
            ) : nfes.map((nfe) => {
              const sc = STATUS_CONFIG[nfe.status] || STATUS_CONFIG.rascunho;
              return (
                <tr key={nfe.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-white font-mono">{nfe.number || nfe.id.slice(-8)}</td>
                  <td className="px-4 py-3">
                    <div className="text-white">{nfe.customerName || '-'}</div>
                    <div className="text-slate-400 text-xs">{nfe.customerDoc || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{fmtDate(nfe.issuedAt || nfe.createdAt)}</td>
                  <td className="px-4 py-3 text-right text-white font-medium">
                    {fmtCurrency((nfe.totals as any)?.totalNota || 0)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.color}`}>
                      {sc.icon} {sc.label}
                    </span>
                    {nfe.errorMessage && <div className="text-red-400 text-xs mt-1 truncate max-w-xs" title={nfe.errorMessage}>{nfe.errorMessage}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {nfe.status === 'rascunho' && (
                        <button onClick={() => emitDraft(nfe.id)} title="Emitir" className="text-green-400 hover:text-green-300">
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                      {nfe.pdfUrl && (
                        <a href={nfe.pdfUrl} target="_blank" title="DANFE" className="text-blue-400 hover:text-blue-300">
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                      {(nfe.status === 'enviada' || nfe.status === 'autorizada') && (
                        <button onClick={() => syncStatus(nfe.id)} title="Sincronizar status" className="text-slate-400 hover:text-white">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      {nfe.status === 'autorizada' && (
                        <button onClick={() => setCancelModal({ id: nfe.id, providerNFeId: nfe.accessKey || '' })} title="Cancelar" className="text-red-400 hover:text-red-300">
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
            <span className="text-slate-400 text-sm">{total} notas no total</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-slate-700 text-white rounded disabled:opacity-40 text-sm">Anterior</button>
              <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-slate-700 text-white rounded disabled:opacity-40 text-sm">Próxima</button>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">Cancelar NF-e</h3>
            <p className="text-slate-400 text-sm mb-4">
              O cancelamento é irreversível. Informe a justificativa (mínimo 15 caracteres):
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Justificativa do cancelamento..."
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2.5 text-sm mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setCancelModal(null); setCancelReason(''); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm">Voltar</button>
              <button onClick={cancelNFe} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-sm">Confirmar Cancelamento</button>
            </div>
          </div>
        </div>
      )}

      {/* New NFe Form — simplified, links to full config */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-1">Nova Nota Fiscal</h3>
            <p className="text-slate-400 text-sm mb-6">Preencha os dados do destinatário e itens da nota</p>
            <NFeForm onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); load(); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function NFeForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    customerName: '', customerDoc: '', customerEmail: '',
    naturezaOperacao: 'Venda de mercadorias',
    items: [{ codigo: '001', descricao: '', unidade: 'UN', quantidade: 1, valorUnitario: 0, valorTotal: 0 }],
    observations: '', emit: false,
  });
  const [saving, setSaving] = useState(false);

  const updateItem = (i: number, key: string, value: any) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: value };
    if (key === 'quantidade' || key === 'valorUnitario') {
      items[i].valorTotal = items[i].quantidade * items[i].valorUnitario;
    }
    setForm(f => ({ ...f, items }));
  };

  const submit = async () => {
    if (!form.customerName || !form.customerDoc || !form.items[0].descricao) {
      toast.error('Preencha destinatário e pelo menos um item');
      return;
    }
    setSaving(true);
    const r = await apiFetch('/api/pj/nfe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok || r.status === 201) {
      toast.success(form.emit ? 'NF-e emitida!' : 'Rascunho salvo');
      onSuccess();
    } else {
      toast.error(d.error || d.errorMessage || 'Erro ao salvar NF-e');
    }
  };

  const total = form.items.reduce((s, i) => s + i.valorTotal, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Nome do Destinatário *</label>
          <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" placeholder="Razão Social ou Nome" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">CPF / CNPJ *</label>
          <input value={form.customerDoc} onChange={e => setForm(f => ({ ...f, customerDoc: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" placeholder="000.000.000-00" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">E-mail</label>
          <input value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" placeholder="email@cliente.com" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Natureza da Operação</label>
          <input value={form.naturezaOperacao} onChange={e => setForm(f => ({ ...f, naturezaOperacao: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-400">Itens da Nota</label>
          <button onClick={() => setForm(f => ({ ...f, items: [...f.items, { codigo: String(f.items.length + 1).padStart(3, '0'), descricao: '', unidade: 'UN', quantidade: 1, valorUnitario: 0, valorTotal: 0 }] }))}
            className="text-xs text-green-400 hover:text-green-300">+ Item</button>
        </div>
        <div className="space-y-2">
          {form.items.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                {i === 0 && <div className="text-xs text-slate-500 mb-1">Descrição</div>}
                <input value={item.descricao} onChange={e => updateItem(i, 'descricao', e.target.value)}
                  placeholder="Produto ou serviço"
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="col-span-2">
                {i === 0 && <div className="text-xs text-slate-500 mb-1">Unid.</div>}
                <select value={item.unidade} onChange={e => updateItem(i, 'unidade', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-sm">
                  {['UN', 'KG', 'LT', 'MT', 'M2', 'CX', 'PC', 'SV', 'HR'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                {i === 0 && <div className="text-xs text-slate-500 mb-1">Qtd</div>}
                <input type="number" value={item.quantidade} onChange={e => updateItem(i, 'quantidade', parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-sm" min={0} step={0.01} />
              </div>
              <div className="col-span-2">
                {i === 0 && <div className="text-xs text-slate-500 mb-1">Vl. Unit.</div>}
                <input type="number" value={item.valorUnitario} onChange={e => updateItem(i, 'valorUnitario', parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-sm" min={0} step={0.01} />
              </div>
              <div className="col-span-2">
                {i === 0 && <div className="text-xs text-slate-500 mb-1">Total</div>}
                <div className="bg-slate-900/60 border border-slate-700 text-green-400 rounded px-2 py-1.5 text-sm text-right">
                  {item.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-right mt-3 text-white font-semibold">
          Total: {fmtCurrency(total)}
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Observações</label>
        <textarea value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} rows={2}
          className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" placeholder="Informações adicionais..." />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-slate-700">
        <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg text-sm">Cancelar</button>
        <button onClick={() => { setForm(f => ({ ...f, emit: false })); setTimeout(submit, 0); }} disabled={saving}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg text-sm">Salvar Rascunho</button>
        <button onClick={() => { setForm(f => ({ ...f, emit: true })); setTimeout(submit, 0); }} disabled={saving}
          className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg text-sm font-medium">
          {saving ? 'Emitindo...' : 'Emitir NF-e'}
        </button>
      </div>
    </div>
  );
}
