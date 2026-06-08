'use client';
import { apiFetch } from '@/lib/fetch';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle, CloudUpload, FileText, Upload, X } from 'lucide-react';


interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  batchId: string;
  period?: { start?: string; end?: string };
  bankId?: string;
}

interface Props {
  bankConnectionId?: string;
  onSuccess?: (result: ImportResult) => void;
  onClose?: () => void;
}

export function BankImportDialog({ bankConnectionId, onSuccess, onClose }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ALLOWED = ['ofx', 'qfx', 'csv'];

  const validate = (f: File): string | null => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED.includes(ext)) return `Formato inválido. Use: ${ALLOWED.join(', ').toUpperCase()}`;
    if (f.size > 5 * 1024 * 1024) return 'Arquivo muito grande (máx 5MB)';
    return null;
  };

  const selectFile = (f: File) => {
    const err = validate(f);
    if (err) { setError(err); return; }
    setError(null);
    setResult(null);
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    const fd = new FormData();
    fd.append('file', file);
    if (bankConnectionId) fd.append('bankConnectionId', bankConnectionId);

    try {
      const r = await apiFetch('/api/banks/import', { method: 'POST', body: fd });
      const d = await r.json();

      if (!r.ok) {
        setError(d.error || 'Erro ao importar');
        setUploading(false);
        return;
      }

      setResult(d);
      toast.success(`${d.imported} transações importadas!`);
      onSuccess?.(d);
    } catch (err: any) {
      setError(err.message || 'Erro na importação');
    }
    setUploading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Importar Extrato Bancário</h3>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <p className="text-slate-400 text-sm">
        Importe seu extrato no formato OFX (Open Financial Exchange) ou CSV. Todos os bancos brasileiros suportam exportação OFX.
      </p>

      {/* Drag-and-drop zone */}
      {!result && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) selectFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-green-500 bg-green-900/20' : 'border-slate-600 hover:border-slate-400 hover:bg-slate-700/30'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".ofx,.qfx,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) selectFile(f); }}
          />

          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="w-8 h-8 text-green-400" />
              <div className="text-left">
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-slate-400 text-sm">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="ml-4 text-slate-400 hover:text-red-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <CloudUpload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-white mb-1">Arraste o arquivo aqui ou clique para selecionar</p>
              <p className="text-slate-400 text-sm">Suporta: OFX, QFX (Open Finance) e CSV — máx 5MB</p>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-900/30 border border-red-700/40 rounded-xl px-4 py-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Success result */}
      {result && (
        <div className="bg-green-900/30 border border-green-700/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-400" />
            <h4 className="text-green-300 font-semibold">Importação concluída!</h4>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="text-2xl font-bold text-green-400">{result.imported}</p>
              <p className="text-slate-400 text-xs">Importadas</p>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="text-2xl font-bold text-yellow-400">{result.skipped}</p>
              <p className="text-slate-400 text-xs">Duplicadas (ignoradas)</p>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="text-2xl font-bold text-white">{result.total}</p>
              <p className="text-slate-400 text-xs">Total no arquivo</p>
            </div>
          </div>
          {result.period?.start && (
            <p className="text-slate-400 text-xs text-center">
              Período: {new Date(result.period.start).toLocaleDateString('pt-BR')}
              {result.period.end ? ` a ${new Date(result.period.end).toLocaleDateString('pt-BR')}` : ''}
            </p>
          )}
          <p className="text-slate-500 text-xs text-center">
            As transações foram adicionadas ao banco e estão disponíveis para conciliação.
          </p>
        </div>
      )}

      {/* How to export OFX */}
      {!result && !file && (
        <details className="group">
          <summary className="text-slate-400 text-sm cursor-pointer hover:text-slate-300">
            Como exportar o extrato OFX do meu banco?
          </summary>
          <div className="mt-3 space-y-2 text-sm text-slate-400 bg-slate-900/40 rounded-xl p-4">
            <p className="text-white font-medium mb-2">Passo a passo por banco:</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { bank: 'Banco do Brasil', path: 'Extrato → Exportar → OFX' },
                { bank: 'Itaú', path: 'Extrato → Arquivo → OFX' },
                { bank: 'Bradesco', path: 'Extrato → Salvar como → OFX' },
                { bank: 'Santander', path: 'Extrato → Opções → Exportar OFX' },
                { bank: 'Nubank', path: 'Ajuda → Meus dados → Extrato (CSV)' },
                { bank: 'Caixa', path: 'Extrato → Exportar extrato' },
              ].map((b) => (
                <div key={b.bank} className="bg-slate-800/60 rounded-lg p-2">
                  <p className="text-white text-xs font-medium">{b.bank}</p>
                  <p className="text-slate-400 text-xs">{b.path}</p>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {onClose && (
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg text-sm">
            {result ? 'Fechar' : 'Cancelar'}
          </button>
        )}
        {!result && (
          <button
            onClick={upload}
            disabled={!file || uploading}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Importando...' : 'Importar Extrato'}
          </button>
        )}
        {result && (
          <button
            onClick={() => { setResult(null); setFile(null); }}
            className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            Importar outro arquivo
          </button>
        )}
      </div>
    </div>
  );
}
