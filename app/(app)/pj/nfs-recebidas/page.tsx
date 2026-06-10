'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import {
  Upload, X, Plus, FileText, Search, RefreshCw, CheckCircle2,
  XCircle, AlertCircle, Clock, Trash2,
} from 'lucide-react';

interface ReceivedNFe {
  id: string;
  accessKey: string;
  number?: string;
  series?: string;
  supplierName?: string;
  supplierCnpj?: string;
  issueDate?: string;
  totalValue?: number;
  status: string;
  notes?: string;
  payableId?: string;
  items?: any[];
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  valida: { label: 'Válida', color: 'text-green-400 bg-green-900/30', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  cancelada: { label: 'Cancelada', color: 'text-red-400 bg-red-900/30', icon: <XCircle className="w-3.5 h-3.5" /> },
  denegada: { label: 'Denegada', color: 'text-orange-400 bg-orange-900/30', icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '-';
const maskKey = (k: string) => k ? `${k.slice(0, 8)}...${k.slice(-8)}` : '-';

export default function NFsRecebidasPage() {
  const [items, setItems] = useState<ReceivedNFe[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showXmlUpload, setShowXmlUpload] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ReceivedNFe | null>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);

  // Manual form state
  const [manualForm, setManualForm] = useState({
    accessKey: '', number: '', series: '', supplierName: '',
    supplierCnpj: '', issueDate: '', totalValue: '', notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: '20' });
    if (statusFilter) p.set('status', statusFilter);
    if (search) p.set('supplierCnpj', search);
    const r = await apiFetch(`/api/pj/sefaz/nfs-recebidas?${p}`);
    const d = await r.json();
    setItems(d.items || []);
    setTotal(d.total || 0);
    setLoading(false);
  }, [page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const handleXmlUpload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiFetch('/api/pj/sefaz/nfs-recebidas', { method: 'POST', body: fd });
    if (res.ok) {
      toast.success('NF-e importada com sucesso');
      setShowXmlUpload(false);
      load();
    } else {
      const d = await res.json();
      toast.error(d.error || 'Erro ao importar XML');
    }
    setUploading(false);
  };

  const handleManualSave = async () => {
    if (!manualForm.accessKey.trim()) { toast.error('Chave de acesso obrigatória'); return; }
    const res = await apiFetch('/api/pj/sefaz/nfs-recebidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...manualForm,
        totalValue: manualForm.totalValue ? parseFloat(manualForm.totalValue) : null,
      }),
    });
    if (res.ok) {
      toast.success('NF-e registrada');
      setShowForm(false);
      setManualForm({ accessKey: '', number: '', series: '', supplierName: '', supplierCnpj: '', issueDate: '', totalValue: '', notes: '' });
      load();
    } else {
      const d = await res.json();
      toast.error(d.error || 'Erro ao salvar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta NF-e da lista?')) return;
    const res = await apiFetch(`/api/pj/sefaz/nfs-recebidas?id=${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Removida'); load(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">NF-e Recebidas</h1>
          <p className="text-slate-400 text-sm mt-0.5">Notas fiscais de fornecedores — consulta SEFAZ</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowXmlUpload(true)}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm">
            <Upload className="w-4 h-4" /> Importar XML
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Registrar Manualmente
          </button>
        </div>
      </div>

      {/* SEFAZ info banner */}
      <div className="p-4 bg-blue-900/20 border border-blue-700/40 rounded-xl">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-300 text-sm font-medium">Consulta Automática SEFAZ</p>
            <p className="text-slate-400 text-xs mt-0.5">
              Para consulta automática das NF-e direcionadas ao seu CNPJ, configure o certificado digital A1 em{' '}
              <span className="text-blue-400">Configurações → Certificado Digital</span>.
              Enquanto isso, importe os XMLs manualmente ou registre pela chave de acesso.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="CNPJ do fornecedor"
            className="bg-transparent text-white text-sm outline-none w-40" />
        </div>
        <span className="text-slate-400 text-sm">{total} nota(s)</span>
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Chave / Número</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Fornecedor</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Valor</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Emissão</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400">Nenhuma NF-e recebida</p>
                  <p className="text-slate-500 text-xs mt-1">Importe um XML ou registre manualmente</p>
                </td>
              </tr>
            ) : items.map((item) => {
              const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.valida;
              return (
                <tr key={item.id} className="hover:bg-slate-700/20 cursor-pointer" onClick={() => setSelectedItem(item)}>
                  <td className="px-4 py-3">
                    <div className="text-white font-mono text-xs">{maskKey(item.accessKey)}</div>
                    {item.number && <div className="text-slate-400 text-xs">Nº {item.number}{item.series ? ` Série ${item.series}` : ''}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white text-sm">{item.supplierName || <span className="text-slate-500 italic">—</span>}</div>
                    {item.supplierCnpj && <div className="text-slate-400 text-xs">{item.supplierCnpj}</div>}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-medium">
                    {item.totalValue ? fmt(item.totalValue) : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {item.issueDate ? fmtDate(item.issueDate) : fmtDate(item.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                      {cfg.icon}{cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-sm disabled:opacity-40">
            Anterior
          </button>
          <span className="px-3 py-1.5 text-slate-400 text-sm">Pág. {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}
            className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-sm disabled:opacity-40">
            Próxima
          </button>
        </div>
      )}

      {/* XML upload modal */}
      {showXmlUpload && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Importar XML NF-e</h3>
              <button onClick={() => setShowXmlUpload(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                dragging ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) handleXmlUpload(f);
              }}
              onClick={() => xmlInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-slate-300 text-sm font-medium">Arraste o arquivo XML aqui</p>
              <p className="text-slate-500 text-xs mt-1">ou clique para selecionar</p>
              <input ref={xmlInputRef} type="file" accept=".xml" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleXmlUpload(f); }} />
            </div>
            {uploading && <p className="text-slate-400 text-sm text-center">Importando...</p>}
          </div>
        </div>
      )}

      {/* Manual form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Registrar NF-e Manualmente</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Chave de Acesso (44 dígitos) *</label>
                <input value={manualForm.accessKey} onChange={(e) => setManualForm((p) => ({ ...p, accessKey: e.target.value.replace(/\D/g, '') }))}
                  maxLength={44} placeholder="44 dígitos da chave"
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono" />
                <p className="text-slate-500 text-xs mt-0.5">{manualForm.accessKey.length}/44 dígitos</p>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Número da NF</label>
                <input value={manualForm.number} onChange={(e) => setManualForm((p) => ({ ...p, number: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Série</label>
                <input value={manualForm.series} onChange={(e) => setManualForm((p) => ({ ...p, series: e.target.value }))}
                  placeholder="1"
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Fornecedor</label>
                <input value={manualForm.supplierName} onChange={(e) => setManualForm((p) => ({ ...p, supplierName: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">CNPJ do Fornecedor</label>
                <input value={manualForm.supplierCnpj} onChange={(e) => setManualForm((p) => ({ ...p, supplierCnpj: e.target.value }))}
                  placeholder="00.000.000/0001-00"
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Data de Emissão</label>
                <input type="date" value={manualForm.issueDate} onChange={(e) => setManualForm((p) => ({ ...p, issueDate: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Valor Total (R$)</label>
                <input type="number" min="0" step="0.01" value={manualForm.totalValue}
                  onChange={(e) => setManualForm((p) => ({ ...p, totalValue: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Observações</label>
                <textarea value={manualForm.notes} onChange={(e) => setManualForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={handleManualSave}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Detalhes da NF-e</h3>
              <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Chave</span>
                <span className="text-white font-mono text-xs">{selectedItem.accessKey}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Número / Série</span>
                <span className="text-white">{selectedItem.number || '—'} / {selectedItem.series || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fornecedor</span>
                <span className="text-white">{selectedItem.supplierName || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">CNPJ</span>
                <span className="text-white">{selectedItem.supplierCnpj || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Emissão</span>
                <span className="text-white">{selectedItem.issueDate ? fmtDate(selectedItem.issueDate) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total</span>
                <span className="text-white font-bold">{selectedItem.totalValue ? fmt(selectedItem.totalValue) : '—'}</span>
              </div>
            </div>
            {selectedItem.items && Array.isArray(selectedItem.items) && selectedItem.items.length > 0 && (
              <div>
                <p className="text-slate-400 text-xs mb-2">Itens ({selectedItem.items.length})</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {selectedItem.items.map((it: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-slate-300 truncate max-w-[250px]">{it.descricao}</span>
                      <span className="text-white ml-2">{it.valorTotal ? fmt(it.valorTotal) : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setSelectedItem(null)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm">
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
