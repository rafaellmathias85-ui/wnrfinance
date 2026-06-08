'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle, Clock, Copy, Download, Plus, QrCode, XCircle } from 'lucide-react';


interface Charge {
  id: string;
  type: string;
  status: string;
  customerName: string;
  customerDoc?: string;
  amount: number;
  dueDate: string;
  description?: string;
  boletoBarCode?: string;
  boletoUrl?: string;
  pixCopiaECola?: string;
  pixQrCodeUrl?: string;
  paidAt?: string;
  paidAmount?: number;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pendente: { label: 'Pendente', color: 'text-yellow-400 bg-yellow-900/30', icon: <Clock className="w-3.5 h-3.5" /> },
  pago: { label: 'Pago', color: 'text-green-400 bg-green-900/30', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  vencido: { label: 'Vencido', color: 'text-red-400 bg-red-900/30', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  cancelado: { label: 'Cancelado', color: 'text-slate-400 bg-slate-800', icon: <XCircle className="w-3.5 h-3.5" /> },
};

const fmtCurrency = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '-';

export default function CobrancasPage() {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedCharge, setSelectedCharge] = useState<Charge | null>(null);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    const r = await apiFetch(`/api/pj/cobrancas?${params}`);
    const d = await r.json();
    setCharges(d.charges || []);
    setTotal(d.total || 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, [page, statusFilter, typeFilter]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const totals = charges.reduce((acc, c) => {
    acc.total += c.amount;
    if (c.status === 'pago') acc.received += c.paidAmount || c.amount;
    if (c.status === 'pendente') acc.pending += c.amount;
    return acc;
  }, { total: 0, received: 0, pending: 0 });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cobranças</h1>
          <p className="text-slate-400 text-sm mt-0.5">Boleto bancário e PIX Cobrança</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" />
          Nova Cobrança
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Total Emitido</p>
          <p className="text-2xl font-bold text-white mt-1">{fmtCurrency(totals.total)}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Recebido</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{fmtCurrency(totals.received)}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-sm">A Receber</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">{fmtCurrency(totals.pending)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2">
          <option value="">Todos os tipos</option>
          <option value="boleto">Boleto</option>
          <option value="pix">PIX</option>
          <option value="boleto_pix">Boleto + PIX</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Cliente</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Vencimento</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Valor</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Status</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
            ) : charges.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhuma cobrança encontrada</td></tr>
            ) : charges.map((c) => {
              const sc = STATUS_CONFIG[c.status] || STATUS_CONFIG.pendente;
              const isOverdue = c.status === 'pendente' && new Date(c.dueDate) < new Date();
              return (
                <tr key={c.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-white">{c.customerName}</div>
                    <div className="text-slate-400 text-xs">{c.customerDoc || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.type === 'pix' ? 'bg-teal-900/40 text-teal-400' : 'bg-blue-900/40 text-blue-400'}`}>
                      {c.type === 'boleto_pix' ? 'Boleto + PIX' : c.type.toUpperCase()}
                    </span>
                  </td>
                  <td className={`px-4 py-3 ${isOverdue ? 'text-red-400' : 'text-slate-300'}`}>{fmtDate(c.dueDate)}</td>
                  <td className="px-4 py-3 text-right text-white font-medium">{fmtCurrency(c.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.color}`}>
                      {sc.icon} {sc.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {c.boletoUrl && (
                        <a href={c.boletoUrl} target="_blank" title="Boleto PDF" className="text-blue-400 hover:text-blue-300">
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                      {c.boletoBarCode && (
                        <button onClick={() => copy(c.boletoBarCode!)} title="Copiar código de barras" className="text-slate-400 hover:text-white">
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                      {c.pixCopiaECola && (
                        <button onClick={() => copy(c.pixCopiaECola!)} title="Copiar PIX Copia e Cola" className="text-teal-400 hover:text-teal-300">
                          <QrCode className="w-4 h-4" />
                        </button>
                      )}
                      {(c.pixQrCodeUrl || c.boletoBarCode || c.pixCopiaECola) && (
                        <button onClick={() => setSelectedCharge(c)} title="Detalhes" className="text-slate-400 hover:text-white text-xs">Ver</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
            <span className="text-slate-400 text-sm">{total} cobranças no total</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-slate-700 text-white rounded disabled:opacity-40 text-sm">Anterior</button>
              <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-slate-700 text-white rounded disabled:opacity-40 text-sm">Próxima</button>
            </div>
          </div>
        )}
      </div>

      {/* Charge detail modal */}
      {selectedCharge && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-white">Cobrança — {selectedCharge.customerName}</h3>
            <p className="text-slate-400 text-sm">Valor: <span className="text-white">{fmtCurrency(selectedCharge.amount)}</span> | Vencimento: <span className="text-white">{fmtDate(selectedCharge.dueDate)}</span></p>

            {selectedCharge.pixQrCodeUrl && (
              <div className="flex flex-col items-center gap-3">
                <img src={selectedCharge.pixQrCodeUrl} alt="QR Code PIX" className="w-48 h-48 bg-white p-2 rounded-lg" />
                <button onClick={() => copy(selectedCharge.pixCopiaECola || '')}
                  className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 text-white px-4 py-2 rounded-lg text-sm">
                  <Copy className="w-4 h-4" /> Copiar PIX Copia e Cola
                </button>
              </div>
            )}

            {selectedCharge.boletoBarCode && !selectedCharge.pixQrCodeUrl && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Código de Barras:</p>
                <p className="font-mono text-sm text-white bg-slate-900 rounded p-3 break-all">{selectedCharge.boletoBarCode}</p>
                <button onClick={() => copy(selectedCharge.boletoBarCode!)}
                  className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
                  <Copy className="w-4 h-4" /> Copiar Código
                </button>
              </div>
            )}

            {selectedCharge.boletoUrl && (
              <a href={selectedCharge.boletoUrl} target="_blank"
                className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm">
                <Download className="w-4 h-4" /> Baixar Boleto PDF
              </a>
            )}

            <button onClick={() => setSelectedCharge(null)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm">Fechar</button>
          </div>
        </div>
      )}

      {/* New Charge Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold text-white mb-4">Nova Cobrança</h3>
            <ChargeForm onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); load(); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ChargeForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ type: 'boleto', customerName: '', customerDoc: '', customerEmail: '', amount: '', dueDate: '', description: '', instructions: '', emit: true });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.customerName || !form.customerDoc || !form.amount || !form.dueDate) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    const r = await apiFetch('/api/pj/cobrancas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok || r.status === 201) {
      toast.success(form.emit ? 'Cobrança gerada!' : 'Cobrança salva');
      onSuccess();
    } else {
      toast.error(d.error || d.errorMessage || 'Erro ao criar cobrança');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-slate-400 mb-1">Tipo de Cobrança</label>
        <div className="grid grid-cols-3 gap-2">
          {[['boleto', 'Boleto'], ['pix', 'PIX'], ['boleto_pix', 'Boleto + PIX']].map(([v, l]) => (
            <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))}
              className={`py-2 rounded-lg text-sm font-medium transition-colors ${form.type === v ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {[
        ['customerName', 'Nome do Cliente *', 'text', 'João da Silva'],
        ['customerDoc', 'CPF / CNPJ *', 'text', '000.000.000-00'],
        ['customerEmail', 'E-mail', 'email', 'cliente@email.com'],
        ['amount', 'Valor (R$) *', 'number', '0,00'],
        ['dueDate', 'Data de Vencimento *', 'date', ''],
        ['description', 'Descrição', 'text', 'Referente a...'],
      ].map(([key, label, type, placeholder]) => (
        <div key={key}>
          <label className="block text-xs text-slate-400 mb-1">{label}</label>
          <input type={type} value={(form as any)[key]} placeholder={placeholder}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
        </div>
      ))}

      {(form.type === 'boleto' || form.type === 'boleto_pix') && (
        <div>
          <label className="block text-xs text-slate-400 mb-1">Instruções do Boleto</label>
          <textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} rows={2}
            placeholder="Ex: Não receber após o vencimento"
            className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
        </div>
      )}

      <div className="flex gap-3 pt-2 border-t border-slate-700">
        <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg text-sm">Cancelar</button>
        <button onClick={() => { setForm(f => ({ ...f, emit: false })); setTimeout(submit, 0); }} disabled={saving}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg text-sm">Salvar</button>
        <button onClick={() => { setForm(f => ({ ...f, emit: true })); setTimeout(submit, 0); }} disabled={saving}
          className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg text-sm font-medium">
          {saving ? 'Gerando...' : 'Gerar Cobrança'}
        </button>
      </div>
    </div>
  );
}
