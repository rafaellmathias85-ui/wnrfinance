'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, FileText, Users, ReceiptText, DollarSign } from 'lucide-react';

const ENTITIES = [
  {
    value: 'payable',
    label: 'Contas a Pagar',
    icon: FileText,
    description: 'Despesas e obrigações financeiras',
    hasDateFilter: true,
  },
  {
    value: 'receivable',
    label: 'Contas a Receber',
    icon: FileSpreadsheet,
    description: 'Receitas e cobranças emitidas',
    hasDateFilter: true,
  },
  {
    value: 'client',
    label: 'Clientes',
    icon: Users,
    description: 'Cadastro completo de clientes',
    hasDateFilter: false,
  },
  {
    value: 'nfe',
    label: 'Notas Fiscais',
    icon: ReceiptText,
    description: 'NF-e, NFS-e e NFC-e emitidas',
    hasDateFilter: true,
  },
  {
    value: 'commission',
    label: 'Comissões',
    icon: DollarSign,
    description: 'Comissões de vendedores e agentes',
    hasDateFilter: true,
  },
];

export default function ExportacaoPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const download = async (entity: string) => {
    setLoading(entity);
    const params = new URLSearchParams({ entity });
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    try {
      const res = await apiFetch(`/api/pj/export?${params}`);
      if (!res.ok) { toast.error('Erro ao exportar'); setLoading(null); return; }
      const blob = await res.blob();
      const disp = res.headers.get('Content-Disposition') ?? '';
      const filenameMatch = disp.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `${entity}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${filename} baixado`);
    } catch {
      toast.error('Erro ao gerar exportação');
    }
    setLoading(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-slate-700 rounded-lg flex items-center justify-center">
          <Download className="w-5 h-5 text-slate-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Exportação de Dados</h1>
          <p className="text-slate-400 text-sm mt-0.5">Baixe relatórios em formato CSV para uso em planilhas</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <p className="text-slate-400 text-sm font-medium mb-3">Filtro de período (opcional)</p>
        <div className="flex gap-4 flex-wrap">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Data início</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Data fim</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
          </div>
          {(startDate || endDate) && (
            <div className="self-end">
              <button onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-xs text-slate-400 hover:text-white px-3 py-2">
                Limpar datas
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Export cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ENTITIES.map(e => {
          const Icon = e.icon;
          const isLoading = loading === e.value;
          return (
            <div key={e.value} className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-slate-300" />
                </div>
                <div>
                  <p className="text-white font-medium">{e.label}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{e.description}</p>
                  {!e.hasDateFilter && (
                    <p className="text-slate-500 text-xs mt-1">Exporta todos os registros</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => download(e.value)}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                {isLoading ? 'Gerando...' : 'Exportar CSV'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <p className="text-slate-400 text-sm font-medium mb-1">Sobre os arquivos CSV</p>
        <p className="text-slate-500 text-xs leading-relaxed">
          Os arquivos são gerados no formato UTF-8 com separador de vírgulas, compatíveis com Excel, Google Sheets e outros editores de planilhas.
          Para abrir corretamente no Excel, use Dados → Importar de texto e selecione UTF-8 como codificação.
        </p>
      </div>
    </div>
  );
}
