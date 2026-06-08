'use client';
import { apiFetch } from '@/lib/fetch';
import { Calculator } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';


interface IRPFCalc {
  grossIncome: number;
  deductions: number;
  taxableBase: number;
  rate: number;
  taxDue: number;
  effectiveRate: number;
  exempt: boolean;
  bracket: string;
  withheld?: number;
  balanceDue?: number;
  refund?: number;
  message?: string;
}

interface TaxRecord { id: string; type: string; period: string; year: number; month?: number; baseValue: number; taxValue: number; rate?: number; status: string; dueDate?: string; paidAt?: string; }
interface CarneEntry { id: string; period: string; incomeType: string; sourceName: string; grossAmount: number; taxAmount: number; rate: number; createdAt: string; }

const fmtCurrency = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '-';
const now = new Date();

const INCOME_TYPES: Record<string, string> = {
  autonomo: 'Trabalho Autônomo / Freelancer',
  alugueis: 'Aluguéis',
  exterior: 'Rendimentos do Exterior',
  pensao_alimenticia: 'Pensão Alimentícia',
  outros: 'Outros',
};

export default function ImpostosPFPage() {
  const [tab, setTab] = useState<'mensal' | 'anual' | 'carne'>('mensal');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthCalc, setMonthCalc] = useState<any>(null);
  const [annualCalc, setAnnualCalc] = useState<IRPFCalc | null>(null);
  const [carneEntries, setCarneEntries] = useState<CarneEntry[]>([]);
  const [carneSummary, setCarneSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dependents, setDependents] = useState(0);
  const [deductions, setDeductions] = useState(0);
  const [showCarneForm, setShowCarneForm] = useState(false);

  const loadMonthly = async () => {
    setLoading(true);
    const r = await apiFetch(`/api/pf/impostos?action=monthly_summary&year=${year}&month=${month}`);
    if (r.ok) setMonthCalc(await r.json());
    setLoading(false);
  };

  const loadAnnual = async () => {
    setLoading(true);
    const r = await apiFetch(`/api/pf/impostos?action=calculate_annual&year=${year}&dependents=${dependents}&deductions=${deductions}`);
    if (r.ok) setAnnualCalc(await r.json());
    setLoading(false);
  };

  const loadCarne = async () => {
    setLoading(true);
    const r = await apiFetch(`/api/pf/carne-leao?year=${year}`);
    if (r.ok) { const d = await r.json(); setCarneEntries(d.entries || []); setCarneSummary(d.summary); }
    setLoading(false);
  };

  useEffect(() => {
    if (tab === 'mensal') loadMonthly();
    else if (tab === 'anual') loadAnnual();
    else loadCarne();
  }, [tab, year, month]);

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Impostos PF</h1>
          <p className="text-slate-400 text-sm mt-0.5">IRPF, Carnê-Leão e declaração anual</p>
        </div>
        <div className="flex items-center gap-3">
          {tab === 'mensal' && (
            <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2">
              {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          )}
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2">
            {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 w-fit">
        {[['mensal', 'Mensal (Carnê-Leão)'], ['anual', 'Declaração Anual'], ['carne', 'Lançamentos']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === k ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Monthly IRPF */}
      {tab === 'mensal' && monthCalc && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs">Rendimento Bruto</p>
              <p className="text-white font-bold text-lg mt-1">{fmtCurrency(monthCalc.gross)}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs">Base de Cálculo</p>
              <p className="text-white font-bold text-lg mt-1">{fmtCurrency(monthCalc.taxableBase)}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-xs">Alíquota</p>
              <p className="text-white font-bold text-lg mt-1">{monthCalc.rate}%</p>
            </div>
            <div className={`rounded-xl p-4 border ${monthCalc.exempt ? 'bg-green-900/30 border-green-700/40' : 'bg-yellow-900/30 border-yellow-700/40'}`}>
              <p className={`text-xs ${monthCalc.exempt ? 'text-green-300' : 'text-yellow-300'}`}>
                {monthCalc.exempt ? 'Isento' : 'Carnê-Leão'}
              </p>
              <p className={`font-bold text-lg mt-1 ${monthCalc.exempt ? 'text-green-400' : 'text-yellow-400'}`}>
                {fmtCurrency(monthCalc.taxDue)}
              </p>
            </div>
          </div>

          {!monthCalc.exempt && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-400 text-sm mb-2">Faixa de tributação: <span className="text-white">{monthCalc.bracket}</span></p>
              <p className="text-slate-400 text-sm">Vencimento: <span className="text-white font-medium">{fmtDate(monthCalc.dueDate)}</span></p>
              <p className="text-slate-400 text-sm mt-1">Base legal: Tabela IRPF 2024 (RFB)</p>
            </div>
          )}
        </div>
      )}

      {/* Annual IRPF */}
      {tab === 'anual' && (
        <div className="space-y-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-4">Simulação — Declaração IRPF {year}</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Dependentes</label>
                <input type="number" value={dependents} onChange={e => setDependents(parseInt(e.target.value) || 0)} min={0}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Deduções (R$) — saúde, educação, etc.</label>
                <input type="number" value={deductions} onChange={e => setDeductions(parseFloat(e.target.value) || 0)} min={0} step={100}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <button onClick={loadAnnual} disabled={loading} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Calculator className="w-4 h-4 inline mr-2" />
              {loading ? 'Calculando...' : 'Recalcular'}
            </button>
          </div>

          {annualCalc && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                ['Renda Bruta', fmtCurrency(annualCalc.grossIncome), 'text-white'],
                ['Deduções', fmtCurrency(annualCalc.deductions), 'text-yellow-400'],
                ['Base de Cálculo', fmtCurrency(annualCalc.taxableBase), 'text-white'],
                ['Imposto Calculado', fmtCurrency(annualCalc.taxDue), 'text-orange-400'],
                ['IR Retido (carnê)', fmtCurrency(annualCalc.withheld || 0), 'text-blue-400'],
                annualCalc.refund && annualCalc.refund > 0
                  ? ['Restituição', fmtCurrency(annualCalc.refund), 'text-green-400']
                  : ['Imposto a Pagar', fmtCurrency(annualCalc.balanceDue || 0), 'text-red-400'],
              ].map(([label, value, color]) => (
                <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                  <p className="text-slate-400 text-xs">{label}</p>
                  <p className={`font-bold text-lg mt-1 ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          )}
          {annualCalc?.message && (
            <div className={`border rounded-xl p-4 text-sm ${annualCalc.refund && annualCalc.refund > 0 ? 'border-green-700/40 bg-green-900/20 text-green-300' : 'border-yellow-700/40 bg-yellow-900/20 text-yellow-300'}`}>
              {annualCalc.message}
            </div>
          )}
        </div>
      )}

      {/* Carnê-Leão entries */}
      {tab === 'carne' && (
        <div className="space-y-4">
          {carneSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <p className="text-slate-400 text-xs">Total Bruto</p>
                <p className="text-white font-bold text-lg mt-1">{fmtCurrency(carneSummary.totalGross)}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <p className="text-slate-400 text-xs">Deduções</p>
                <p className="text-yellow-400 font-bold text-lg mt-1">{fmtCurrency(carneSummary.totalDeductions)}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <p className="text-slate-400 text-xs">Base Tributável</p>
                <p className="text-white font-bold text-lg mt-1">{fmtCurrency(carneSummary.totalTaxable)}</p>
              </div>
              <div className="bg-orange-900/30 border border-orange-700/40 rounded-xl p-4">
                <p className="text-orange-300 text-xs">Total de IR</p>
                <p className="text-orange-400 font-bold text-lg mt-1">{fmtCurrency(carneSummary.totalTax)}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={() => setShowCarneForm(true)} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> Novo Lançamento
            </button>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Período</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Fonte</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Bruto</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">IR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
                ) : carneEntries.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhum lançamento para {year}. Adicione os rendimentos recebidos.</td></tr>
                ) : carneEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-white">{e.period}</td>
                    <td className="px-4 py-3 text-slate-300">{INCOME_TYPES[e.incomeType] || e.incomeType}</td>
                    <td className="px-4 py-3 text-slate-300">{e.sourceName}</td>
                    <td className="px-4 py-3 text-right text-white">{fmtCurrency(e.grossAmount)}</td>
                    <td className="px-4 py-3 text-right text-orange-400 font-medium">{fmtCurrency(e.taxAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCarneForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">Novo Lançamento — Carnê-Leão</h3>
            <CarneForm year={year} onClose={() => setShowCarneForm(false)} onSuccess={() => { setShowCarneForm(false); loadCarne(); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function CarneForm({ year, onClose, onSuccess }: { year: number; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ period: `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}`, incomeType: 'autonomo', sourceName: '', sourceDoc: '', grossAmount: '', deductions: '0', dependents: '0', notes: '' });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  const calcPreview = async () => {
    if (!form.grossAmount) return;
    const r = await apiFetch(`/api/pf/impostos?action=monthly_summary&year=${year}&month=${parseInt(form.period.split('-')[1])}`);
    if (r.ok) setPreview(await r.json());
  };

  const submit = async () => {
    if (!form.period || !form.sourceName || !form.grossAmount) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    const r = await apiFetch('/api/pf/carne-leao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok) {
      toast.success(`Lançamento salvo — IR: ${fmtCurrency(d.calculation?.taxDue || 0)}`);
      onSuccess();
    } else {
      toast.error(d.error || 'Erro ao salvar lançamento');
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Período *</label>
          <input type="month" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Tipo de Rendimento *</label>
          <select value={form.incomeType} onChange={e => setForm(f => ({ ...f, incomeType: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm">
            {Object.entries(INCOME_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Nome da Fonte Pagadora *</label>
        <input value={form.sourceName} onChange={e => setForm(f => ({ ...f, sourceName: e.target.value }))} placeholder="Empresa XYZ Ltda" className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">CPF/CNPJ da Fonte</label>
          <input value={form.sourceDoc} onChange={e => setForm(f => ({ ...f, sourceDoc: e.target.value }))} placeholder="00.000.000/0001-00" className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Valor Bruto Recebido (R$) *</label>
          <input type="number" value={form.grossAmount} onChange={e => { setForm(f => ({ ...f, grossAmount: e.target.value })); }}
            onBlur={calcPreview} placeholder="0,00" step="0.01" className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      {preview && !preview.exempt && (
        <div className="bg-orange-900/20 border border-orange-700/40 rounded-lg px-4 py-3 text-sm text-orange-300">
          IR estimado para {fmtCurrency(parseFloat(form.grossAmount))}: <strong className="text-orange-400">{fmtCurrency(preview.taxDue)}</strong>
          {' '}(alíquota {preview.rate}% — vencimento {fmtDate(preview.dueDate)})
        </div>
      )}
      {preview?.exempt && (
        <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3 text-sm text-green-300">
          Rendimento isento de IR neste mês (abaixo do limite de tributação).
        </div>
      )}
      <div className="flex gap-3 pt-2 border-t border-slate-700">
        <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg text-sm">Cancelar</button>
        <button onClick={submit} disabled={saving} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg text-sm font-medium">
          {saving ? 'Salvando...' : 'Salvar Lançamento'}
        </button>
      </div>
    </div>
  );
}
