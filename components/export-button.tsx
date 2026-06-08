'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/fetch';

interface ExportButtonProps {
  type: 'expenses' | 'incomes' | 'payables' | 'receivables' | 'investments';
  startDate?: string;
  endDate?: string;
  label?: string;
  className?: string;
}

export function ExportButton({ type, startDate, endDate, label = 'Exportar', className = '' }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const download = async (format: 'csv' | 'xlsx') => {
    setLoading(format);
    setOpen(false);

    const params = new URLSearchParams({ type, format });
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    try {
      const r = await apiFetch(`/api/export?${params}`);
      if (!r.ok) {
        const d = await r.json();
        toast.error(d.error || 'Erro ao exportar');
        setLoading(null);
        return;
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = r.headers.get('content-disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `export_${type}.${format === 'xlsx' ? 'xls' : 'csv'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Arquivo exportado!`);
    } catch (err: any) {
      toast.error('Erro ao baixar arquivo');
    }

    setLoading(null);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={!!loading}
        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-20 min-w-40 overflow-hidden">
            <button
              onClick={() => download('csv')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <FileText className="w-4 h-4 text-green-400" />
              CSV (Excel, Google Sheets)
            </button>
            <button
              onClick={() => download('xlsx')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-blue-400" />
              XLS (Excel formato)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
