'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { CheckCircle2, Clock, XCircle, AlertCircle, Building2, Phone, Mail } from 'lucide-react';

interface PortalData {
  client: { id: string; name: string; email?: string; phone?: string };
  company: { name: string; tradeName?: string; email?: string; phone?: string };
  receivables: {
    id: string;
    description: string;
    amount: number;
    amountReceived?: number;
    dueDate: string;
    receivedAt?: string;
    status: string;
    notes?: string;
  }[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pendente: { label: 'Pendente', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: <Clock className="w-3.5 h-3.5" /> },
  recebido: { label: 'Pago', color: 'text-green-600 bg-green-50 border-green-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  vencido: { label: 'Vencido', color: 'text-red-600 bg-red-50 border-red-200', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  cancelado: { label: 'Cancelado', color: 'text-gray-500 bg-gray-50 border-gray-200', icon: <XCircle className="w-3.5 h-3.5" /> },
};

const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '-';

export default function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Erro'); });
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Carregando portal...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-gray-800 font-bold text-lg mb-2">Link Inválido</h2>
          <p className="text-gray-500 text-sm">{error || 'Este link de acesso é inválido ou expirou.'}</p>
        </div>
      </div>
    );
  }

  const pending = data.receivables.filter((r) => r.status === 'pendente' || r.status === 'vencido');
  const paid = data.receivables.filter((r) => r.status === 'recebido');
  const totalPending = pending.reduce((s, r) => s + r.amount, 0);
  const totalPaid = paid.reduce((s, r) => s + (r.amountReceived ?? r.amount), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 py-4 px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-800 text-sm">{data.company.tradeName || data.company.name}</p>
              <p className="text-gray-500 text-xs">Portal do Cliente</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-gray-800 font-medium text-sm">{data.client.name}</p>
            {data.client.email && <p className="text-gray-500 text-xs">{data.client.email}</p>}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-gray-500 text-xs mb-1">Em aberto</p>
            <p className="text-2xl font-bold text-red-600">{fmt(totalPending)}</p>
            <p className="text-gray-400 text-xs mt-0.5">{pending.length} cobranças</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-gray-500 text-xs mb-1">Total pago</p>
            <p className="text-2xl font-bold text-green-600">{fmt(totalPaid)}</p>
            <p className="text-gray-400 text-xs mt-0.5">{paid.length} cobranças</p>
          </div>
        </div>

        {/* Receivables */}
        <div>
          <h2 className="text-gray-800 font-bold mb-3">Suas Cobranças</h2>
          {data.receivables.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
              <p className="text-gray-500">Nenhuma cobrança encontrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.receivables.map((r) => {
                const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pendente;
                const isOverdue = r.status === 'vencido';
                return (
                  <div key={r.id} className={`bg-white border rounded-xl p-4 ${isOverdue ? 'border-red-200' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-800 font-medium text-sm">{r.description}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span>Venc. {fmtDate(r.dueDate)}</span>
                          {r.receivedAt && <span>Pago em {fmtDate(r.receivedAt)}</span>}
                        </div>
                        {r.notes && <p className="text-gray-400 text-xs mt-1">{r.notes}</p>}
                      </div>
                      <div className="text-right ml-4">
                        <p className="font-bold text-gray-800">{fmt(r.amountReceived ?? r.amount)}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium mt-1 ${cfg.color}`}>
                          {cfg.icon}{cfg.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Contact */}
        {(data.company.email || data.company.phone) && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <h3 className="text-blue-800 font-medium text-sm mb-2">Dúvidas? Entre em contato</h3>
            <div className="flex gap-4">
              {data.company.email && (
                <a href={`mailto:${data.company.email}`} className="flex items-center gap-1 text-blue-600 text-sm hover:text-blue-700">
                  <Mail className="w-3.5 h-3.5" />{data.company.email}
                </a>
              )}
              {data.company.phone && (
                <a href={`tel:${data.company.phone}`} className="flex items-center gap-1 text-blue-600 text-sm hover:text-blue-700">
                  <Phone className="w-3.5 h-3.5" />{data.company.phone}
                </a>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-gray-400 text-xs">
          Portal seguro — {data.company.name}
        </p>
      </div>
    </div>
  );
}
