'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { toast } from 'sonner';
import { Save, ArrowLeft, Calculator, Building2 } from 'lucide-react';
import Link from 'next/link';
import { SefazStatusBadge } from '@/components/sefaz-status-badge';

const REGIMES = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
  { value: 'mei', label: 'MEI' },
];

export default function FiscalSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    regimeTributario: '',
    inscricaoEstadual: '',
    inscricaoMunicipal: '',
    cnae: '',
    aliquotaDas: '',
    nfeSerie: '1',
    nfceSerie: '65',
    nfceCsc: '',
    nfceCscId: '',
    sefazEnvironment: 'producao',
  });

  useEffect(() => {
    apiFetch('/api/pj/configuracoes/fiscal')
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d === 'object') {
          setForm((prev) => ({
            ...prev,
            regimeTributario: d.regimeTributario ?? '',
            inscricaoEstadual: d.inscricaoEstadual ?? '',
            inscricaoMunicipal: d.inscricaoMunicipal ?? '',
            cnae: d.cnae ?? '',
            aliquotaDas: d.aliquotaDas ?? '',
            nfeSerie: d.nfeSerie ?? '1',
            nfceSerie: d.nfceSerie ?? '65',
            nfceCsc: d.nfceCsc ?? '',
            nfceCscId: d.nfceCscId ?? '',
            sefazEnvironment: d.sefazEnvironment ?? 'producao',
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/pj/configuracoes/fiscal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success('Configurações fiscais salvas com sucesso!');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || `Erro ao salvar (HTTP ${res.status})`);
      }
    } catch (err: any) {
      toast.error(`Erro de rede: ${err?.message ?? 'Tente novamente'}`);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500';
  const labelClass = 'block text-xs text-slate-400 mb-1';
  const selectClass = `${inputClass} cursor-pointer`;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-slate-400">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/pj/configuracoes" className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Configurações Fiscais</h1>
          <p className="text-slate-400 text-sm mt-0.5">Regime tributário, notas fiscais e SEFAZ</p>
        </div>
      </div>

      {/* Status Sefaz */}
      <SefazStatusBadge />

      {/* Regime & Inscrições */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="w-4 h-4 text-blue-400" />
          <h3 className="text-white font-medium">Dados Tributários</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Regime Tributário</label>
            <select value={form.regimeTributario} onChange={(e) => set('regimeTributario', e.target.value)} className={selectClass}>
              <option value="">— Selecione —</option>
              {REGIMES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Inscrição Estadual</label>
            <input value={form.inscricaoEstadual} onChange={(e) => set('inscricaoEstadual', e.target.value)}
              placeholder="IE — isento se não contribuinte"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Inscrição Municipal</label>
            <input value={form.inscricaoMunicipal} onChange={(e) => set('inscricaoMunicipal', e.target.value)}
              placeholder="IM — para NFS-e"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>CNAE Principal</label>
            <input value={form.cnae} onChange={(e) => set('cnae', e.target.value)}
              placeholder="ex: 6201-5/01"
              className={inputClass} />
          </div>
          {form.regimeTributario === 'simples_nacional' && (
            <div>
              <label className={labelClass}>Alíquota DAS (%)</label>
              <input type="number" min="0" max="100" step="0.01"
                value={form.aliquotaDas} onChange={(e) => set('aliquotaDas', e.target.value)}
                placeholder="ex: 6.00"
                className={inputClass} />
            </div>
          )}
        </div>
      </div>

      {/* NF-e / NFC-e */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Calculator className="w-4 h-4 text-green-400" />
          <h3 className="text-white font-medium">Notas Fiscais & SEFAZ</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Ambiente SEFAZ</label>
            <select value={form.sefazEnvironment} onChange={(e) => set('sefazEnvironment', e.target.value)} className={selectClass}>
              <option value="producao">Produção</option>
              <option value="homologacao">Homologação (Testes)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Série NF-e padrão</label>
            <input value={form.nfeSerie} onChange={(e) => set('nfeSerie', e.target.value)}
              placeholder="1"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Série NFC-e</label>
            <input value={form.nfceSerie} onChange={(e) => set('nfceSerie', e.target.value)}
              placeholder="65"
              className={inputClass} />
            <p className="text-slate-500 text-xs mt-0.5">NFC-e sempre usa série 65</p>
          </div>
        </div>
        <div className="border-t border-slate-700 pt-4">
          <p className="text-xs text-slate-400 mb-3">CSC — Código de Segurança do Contribuinte (obrigatório para NFC-e em produção)</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>CSC ID</label>
              <input value={form.nfceCscId} onChange={(e) => set('nfceCscId', e.target.value)}
                placeholder="000001"
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>CSC Token</label>
              <input value={form.nfceCsc} onChange={(e) => set('nfceCsc', e.target.value)}
                placeholder="Token fornecido pela SEFAZ"
                type="password"
                className={inputClass} />
            </div>
          </div>
        </div>
        {form.sefazEnvironment === 'homologacao' && (
          <div className="p-3 bg-amber-900/20 border border-amber-700/40 rounded-lg">
            <p className="text-amber-400 text-xs font-medium">Ambiente de Homologação ativo</p>
            <p className="text-amber-500 text-xs mt-0.5">Notas emitidas não têm validade fiscal. Use para testes.</p>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  );
}
