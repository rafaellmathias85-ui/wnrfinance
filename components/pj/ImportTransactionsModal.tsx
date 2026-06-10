'use client';

import { useCallback, useRef, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Upload, X, ChevronRight, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface PreviewTransaction {
  externalId: string;
  type: 'credit' | 'debit';
  amount: number;
  date: string;
  description: string;
}

interface PreviewResult {
  preview: true;
  source: string;
  total: number;
  totalEntradas: number;
  totalSaidas: number;
  totalEntradas$: number;
  totalSaidas$: number;
  transactions: PreviewTransaction[];
}

interface Category {
  id: string;
  name: string;
  type: string;
  code: string | null;
}

interface Props {
  importType: 'expense' | 'income';
  categories: Category[];
  onClose: () => void;
  onImported: () => void;
}

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return d; }
};

export function ImportTransactionsModal({ importType, categories, onClose, onImported }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [categoryMapping, setCategoryMapping] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const fetchPreview = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch(`/api/pj/import-transactions?importType=${importType}`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Erro ao processar arquivo');
        return;
      }
      const data: PreviewResult = await res.json();
      setPreview(data);
      setStep(2);
    } catch {
      toast.error('Erro ao enviar arquivo');
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!file || !preview) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('categoryMapping', JSON.stringify(categoryMapping));
      const res = await apiFetch(
        `/api/pj/import-transactions?importType=${importType}&confirm=true`,
        { method: 'POST', body: fd }
      );
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Erro ao importar');
        return;
      }
      const result = await res.json();
      toast.success(`Importação concluída: ${result.saved} lançamentos salvos`);
      setStep(3);
      onImported();
    } catch {
      toast.error('Erro ao confirmar importação');
    } finally {
      setLoading(false);
    }
  };

  const typeLabel = importType === 'expense' ? 'Despesas' : 'Receitas';
  const relevantTxs = preview?.transactions.filter((t) =>
    importType === 'expense' ? t.type === 'debit' : t.type === 'credit'
  ) ?? [];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h3 className="text-white font-bold text-lg">Importar Lançamentos</h3>
            <p className="text-slate-400 text-xs mt-0.5">{typeLabel} via OFX / CSV bancário</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-700 text-xs">
          {(['Upload', 'Revisão', 'Conclusão'] as const).map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
              <span className={`px-2 py-0.5 rounded-full font-medium ${
                step === i + 1 ? 'bg-blue-600 text-white' : step > i + 1 ? 'bg-green-700 text-white' : 'bg-slate-700 text-slate-400'
              }`}>
                {i + 1}. {label}
              </span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Step 1: Upload ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                  dragging ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-slate-300 font-medium">Arraste o arquivo aqui ou clique para selecionar</p>
                <p className="text-slate-500 text-xs mt-1">Suporta .OFX, .QFX e .CSV bancário</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".ofx,.qfx,.csv,.txt"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              {file && (
                <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{file.name}</p>
                    <p className="text-slate-400 text-xs">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button onClick={() => setFile(null)} className="text-slate-500 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="p-3 bg-slate-700/30 rounded-lg text-xs text-slate-400 space-y-1">
                <p className="font-medium text-slate-300">Modo: {typeLabel}</p>
                <p>Créditos (entradas) serão salvos em <span className="text-green-400">Contas a Receber</span></p>
                <p>Débitos (saídas) serão salvos em <span className="text-red-400">Contas a Pagar</span></p>
                {importType === 'expense' && <p className="text-amber-400">Lançamentos de entrada serão ignorados neste modo.</p>}
                {importType === 'income' && <p className="text-amber-400">Lançamentos de saída serão ignorados neste modo.</p>}
              </div>
            </div>
          )}

          {/* ── Step 2: Preview & category assignment ── */}
          {step === 2 && preview && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-700/40 rounded-lg p-3 text-center">
                  <p className="text-slate-400 text-xs">Total</p>
                  <p className="text-white font-bold text-lg">{preview.total}</p>
                </div>
                <div className="bg-green-900/20 rounded-lg p-3 text-center">
                  <p className="text-green-400 text-xs">Entradas</p>
                  <p className="text-green-300 font-bold text-lg">{preview.totalEntradas}</p>
                  <p className="text-green-400 text-xs">{fmt(preview.totalEntradas$)}</p>
                </div>
                <div className="bg-red-900/20 rounded-lg p-3 text-center">
                  <p className="text-red-400 text-xs">Saídas</p>
                  <p className="text-red-300 font-bold text-lg">{preview.totalSaidas}</p>
                  <p className="text-red-400 text-xs">{fmt(preview.totalSaidas$)}</p>
                </div>
              </div>

              <p className="text-slate-400 text-xs">
                Fonte: <span className="text-white">{preview.source}</span>
                {importType === 'expense'
                  ? ` — ${relevantTxs.length} débitos serão importados`
                  : ` — ${relevantTxs.length} créditos serão importados`}
              </p>

              {/* Table */}
              <div className="border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/60">
                    <tr>
                      <th className="text-left px-3 py-2 text-slate-400">Data</th>
                      <th className="text-left px-3 py-2 text-slate-400">Descrição</th>
                      <th className="text-right px-3 py-2 text-slate-400">Valor</th>
                      <th className="text-left px-3 py-2 text-slate-400">Categoria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {preview.transactions.map((tx) => {
                      const skip =
                        (importType === 'expense' && tx.type === 'credit') ||
                        (importType === 'income' && tx.type === 'debit');
                      return (
                        <tr key={tx.externalId} className={`hover:bg-slate-700/20 ${skip ? 'opacity-30' : ''}`}>
                          <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{fmtDate(tx.date)}</td>
                          <td className="px-3 py-2 text-white max-w-[200px] truncate">{tx.description}</td>
                          <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${tx.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                            {tx.type === 'credit' ? '+' : '-'}{fmt(tx.amount)}
                          </td>
                          <td className="px-3 py-2">
                            {skip ? (
                              <span className="text-slate-600 italic">ignorado</span>
                            ) : (
                              <select
                                value={categoryMapping[tx.externalId] || ''}
                                onChange={(e) => setCategoryMapping((m) => ({ ...m, [tx.externalId]: e.target.value }))}
                                className="bg-slate-900 border border-slate-600 text-white rounded px-1.5 py-1 text-xs w-full max-w-[160px]"
                              >
                                <option value="">— Sem categoria</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.code ? `${c.code} ` : ''}{c.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {preview.total > 100 && (
                  <p className="text-xs text-slate-500 text-center py-2">
                    Exibindo primeiros 100 de {preview.total} lançamentos
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <CheckCircle2 className="w-16 h-16 text-green-400" />
              <p className="text-white text-xl font-bold">Importação concluída!</p>
              <p className="text-slate-400 text-sm">Os lançamentos foram salvos com sucesso.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
          >
            {step === 3 ? 'Fechar' : 'Cancelar'}
          </button>
          <div className="flex gap-3">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
              >
                Voltar
              </button>
            )}
            {step === 1 && (
              <button
                onClick={fetchPreview}
                disabled={!file || loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Processando...' : 'Analisar arquivo'}
              </button>
            )}
            {step === 2 && (
              <button
                onClick={confirmImport}
                disabled={loading || relevantTxs.length === 0}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Importando...' : `Confirmar Importação (${relevantTxs.length})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
