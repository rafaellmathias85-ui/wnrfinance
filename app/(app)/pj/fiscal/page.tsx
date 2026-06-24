'use client';
import { apiFetch } from '@/lib/fetch';
import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Calculator, Calendar, CheckCircle, Clock, FileText, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';


interface TaxRecord { id: string; type: string; period: string; year: number; month?: number; baseValue: number; taxValue: number; rate?: number; status: string; dueDate?: string; paidAt?: string; paidAmount?: number; notes?: string; metadata?: any; }
interface DASCalc { regime: string; anexo?: string; bruto12Months: number; receitaMes: number; aliquotaNominal: number; aliquotaEfetiva: number; dasAmount: number; details: string; breakdown?: Record<string, number>; }
interface ServiceFiscalRule { id: string; name: string; serviceCodeLc116: string; cnae?: string; providerCityCode: string; providerCityName?: string; customerCityCode?: string; customerCityName?: string; operationNature: string; taxRegime: string; isSimplesNacional: boolean; issRate: number; issWithheld: boolean; isDefault: boolean; isActive: boolean; cbsRate?: number; ibsRate?: number; updatedAt?: string; }

const fmtCurrency = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '-';
const now = new Date();

const STATUS_BADGE: Record<string, string> = {
  aberto: 'text-yellow-400 bg-yellow-900/30',
  pago: 'text-green-400 bg-green-900/30',
  vencido: 'text-red-400 bg-red-900/30',
  dispensado: 'text-muted-foreground bg-card',
};

type Tab = 'das' | 'icms' | 'regras';

function FiscalPJContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(searchParams.get('type') === 'ICMS' ? 'icms' : 'das');

  // DAS state
  const [records, setRecords] = useState<TaxRecord[]>([]);
  const [calc, setCalc] = useState<DASCalc | null>(null);
  const [dueDate, setDueDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [calcLoading, setCalcLoading] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [showMarkPaid, setShowMarkPaid] = useState<TaxRecord | null>(null);

  // ICMS/ISS state
  const [icmsRecords, setIcmsRecords] = useState<TaxRecord[]>([]);
  const [icmsLoading, setIcmsLoading] = useState(false);
  const [icmsYear, setIcmsYear] = useState(now.getFullYear());
  const [showNewIcms, setShowNewIcms] = useState(false);
  const [rules, setRules] = useState<ServiceFiscalRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState<ServiceFiscalRule | null | 'new'>(null);

  const loadDAS = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/pj/fiscal?year=${year}&action=calculate&month=${month}`);
      const d = await r.json();
      setRecords(d.records || []);
      setCalc(d.calculation || null);
      setDueDate(d.dueDate ? new Date(d.dueDate).toLocaleDateString('pt-BR') : '');
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, [year, month]);

  const loadICMS = useCallback(async () => {
    setIcmsLoading(true);
    try {
      const r = await apiFetch(`/api/pj/fiscal?year=${icmsYear}&type=ICMS`);
      const d = await r.json();
      setIcmsRecords(d.records || []);
    } catch { /* noop */ } finally {
      setIcmsLoading(false);
    }
  }, [icmsYear]);

  useEffect(() => { if (activeTab === 'das') loadDAS(); }, [activeTab, loadDAS]);
  useEffect(() => { if (activeTab === 'icms') loadICMS(); }, [activeTab, loadICMS]);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const r = await apiFetch('/api/pj/fiscal/regras-servico');
      const d = await r.json();
      setRules(d.rules || []);
    } catch { /* noop */ } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => { if (activeTab === 'regras') loadRules(); }, [activeTab, loadRules]);

  const generateDAS = async () => {
    setCalcLoading(true);
    try {
      const r = await apiFetch('/api/pj/fiscal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateDAS: true, year, month }),
      });
      if (r.ok) { toast.success('DAS gerado e salvo!'); loadDAS(); }
      else { const d = await r.json().catch(() => ({})); toast.error((d as any).error || 'Erro ao gerar DAS'); }
    } catch { toast.error('Erro ao gerar DAS'); } finally {
      setCalcLoading(false);
    }
  };

  const markPaid = async (record: TaxRecord, paidAmount: string, paidAt: string) => {
    const r = await apiFetch(`/api/pj/fiscal/${record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pago', paidAmount: parseFloat(paidAmount), paidAt }),
    });
    if (r.ok) {
      toast.success('Marcado como pago');
      setShowMarkPaid(null);
      if (activeTab === 'das') loadDAS(); else loadICMS();
    } else toast.error('Erro ao atualizar');
  };

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Módulo Fiscal PJ</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Impostos, DAS, ICMS, ISS e outros tributos</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card/60 border border-border rounded-xl p-1 w-fit">
        {([
          { id: 'das' as Tab, label: 'DAS / Simples Nacional', icon: Calculator },
          { id: 'icms' as Tab, label: 'ICMS / ISS', icon: FileText },
          { id: 'regras' as Tab, label: 'Regras NFS-e', icon: ShieldCheck },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-muted text-white'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'das' && (
        <>
          {/* Period selector */}
          <div className="flex items-center gap-3">
            <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
              className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-2">
              {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(parseInt(e.target.value))}
              className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-2">
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>

          {/* DAS Calculator */}
          {calc && (
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-green-400" />
                  Cálculo DAS — {months[month - 1]}/{year}
                </h2>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Calendar className="w-4 h-4" />
                  Vencimento: <span className="text-foreground font-medium">{dueDate}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-muted/60 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">Regime</p>
                  <p className="text-foreground font-semibold mt-1">{calc.regime} {calc.anexo ? `— Anexo ${calc.anexo}` : ''}</p>
                </div>
                <div className="bg-muted/60 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">Receita do Mês</p>
                  <p className="text-foreground font-semibold mt-1">{fmtCurrency(calc.receitaMes)}</p>
                </div>
                <div className="bg-muted/60 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">Alíquota Efetiva</p>
                  <p className="text-foreground font-semibold mt-1">{(calc.aliquotaEfetiva ?? 0).toFixed(2).replace('.', ',')}%</p>
                </div>
                <div className="bg-green-900/40 border border-green-700/40 rounded-lg p-3">
                  <p className="text-green-300 text-xs">DAS a Pagar</p>
                  <p className="text-green-400 font-bold text-xl mt-1">{fmtCurrency(calc.dasAmount)}</p>
                </div>
              </div>

              {calc.breakdown && (
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-4">
                  {Object.entries(calc.breakdown).map(([k, v]) => (
                    <span key={k}>{k}: <span className="text-foreground">{fmtCurrency(v as number)}</span></span>
                  ))}
                </div>
              )}

              <p className="text-muted-foreground text-xs mb-4">{calc.details}</p>

              <button onClick={generateDAS} disabled={calcLoading}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <RefreshCw className={`w-4 h-4 ${calcLoading ? 'animate-spin' : ''}`} />
                {calcLoading ? 'Gerando...' : 'Gerar DAS e Salvar'}
              </button>
            </div>
          )}

          {/* DAS Records table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-foreground font-semibold">Registros Fiscais — {year}</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Período</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Base</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Imposto</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Vencimento</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>
                ) : records.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhum registro. Gere o DAS acima para começar.</td></tr>
                ) : records.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{r.type}</span>
                      {r.rate && <span className="text-muted-foreground text-xs ml-2">{r.rate.toFixed(2)}%</span>}
                    </td>
                    <td className="px-4 py-3 text-foreground">{r.period}</td>
                    <td className="px-4 py-3 text-right text-foreground">{fmtCurrency(r.baseValue)}</td>
                    <td className="px-4 py-3 text-right text-foreground font-semibold">{fmtCurrency(r.taxValue)}</td>
                    <td className={`px-4 py-3 ${r.status === 'aberto' && r.dueDate && new Date(r.dueDate) < new Date() ? 'text-red-400' : 'text-foreground'}`}>
                      {fmtDate(r.dueDate || '')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] || STATUS_BADGE.aberto}`}>
                        {r.status === 'pago' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.status === 'aberto' && (
                        <button onClick={() => setShowMarkPaid(r)} className="text-green-400 hover:text-green-300 text-xs">Marcar como pago</button>
                      )}
                      {r.status === 'pago' && r.paidAt && <span className="text-muted-foreground text-xs">Pago em {fmtDate(r.paidAt)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'icms' && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <select value={icmsYear} onChange={e => setIcmsYear(parseInt(e.target.value))}
                className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-2">
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <button
              onClick={() => setShowNewIcms(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              + Lançar Imposto
            </button>
          </div>

          {/* Info box */}
          <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-4">
            <p className="text-blue-300 text-sm font-medium mb-1">ICMS / ISS — Impostos estaduais e municipais</p>
            <p className="text-blue-400/80 text-xs">
              ICMS: imposto sobre circulação de mercadorias (alíquota varia por estado, geralmente 7%–18%).
              ISS: imposto sobre serviços (alíquota municipal, geralmente 2%–5%). Registre os valores mensais e marque como pago após o recolhimento.
            </p>
          </div>

          {/* ICMS/ISS Records */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-foreground font-semibold">ICMS / ISS — {icmsYear}</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Período</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Base</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Imposto</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Vencimento</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {icmsLoading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>
                ) : icmsRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-muted-foreground">Nenhum lançamento de ICMS/ISS para {icmsYear}.</p>
                      <p className="text-slate-600 text-xs mt-1">Use o botão "Lançar Imposto" para registrar.</p>
                    </td>
                  </tr>
                ) : icmsRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.type === 'ICMS' ? 'bg-orange-900/30 text-orange-300' : 'bg-blue-900/30 text-blue-300'}`}>{r.type}</span>
                      {r.rate && <span className="text-muted-foreground text-xs ml-2">{r.rate.toFixed(2)}%</span>}
                    </td>
                    <td className="px-4 py-3 text-foreground">{r.period}</td>
                    <td className="px-4 py-3 text-right text-foreground">{fmtCurrency(r.baseValue)}</td>
                    <td className="px-4 py-3 text-right text-foreground font-semibold">{fmtCurrency(r.taxValue)}</td>
                    <td className={`px-4 py-3 ${r.status === 'aberto' && r.dueDate && new Date(r.dueDate) < new Date() ? 'text-red-400' : 'text-foreground'}`}>
                      {fmtDate(r.dueDate || '')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] || STATUS_BADGE.aberto}`}>
                        {r.status === 'pago' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.status === 'aberto' && (
                        <button onClick={() => setShowMarkPaid(r)} className="text-green-400 hover:text-green-300 text-xs">Marcar como pago</button>
                      )}
                      {r.status === 'pago' && r.paidAt && <span className="text-muted-foreground text-xs">Pago em {fmtDate(r.paidAt)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showNewIcms && <NewIcmsDialog onClose={() => setShowNewIcms(false)} onSaved={loadICMS} />}
        </>
      )}

      {activeTab === 'regras' && (
        <div className="space-y-4">
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4">
            <p className="text-amber-300 text-sm font-medium mb-1">Validacao obrigatoria antes de NFS-e automatica</p>
            <p className="text-amber-400/80 text-xs">
              A automacao de nota e cobranca usa a regra padrao ativa. Sem municipio, LC 116, CNAE, ISS, regime e retencoes revisadas, a emissao fica bloqueada em rascunho.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-foreground font-semibold">Regras fiscais de servico</h2>
            <button
              onClick={() => setShowRuleForm('new')}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Nova regra
            </button>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Regra</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Servico</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Municipios</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">ISS</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rulesLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>
                ) : rules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <ShieldCheck className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-muted-foreground">Nenhuma regra fiscal cadastrada.</p>
                      <p className="text-slate-600 text-xs mt-1">Crie uma regra padrao antes de automatizar NFS-e e cobrancas.</p>
                    </td>
                  </tr>
                ) : rules.map(rule => (
                  <tr key={rule.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{rule.name}</span>
                        {rule.isDefault && <span className="px-2 py-0.5 rounded bg-green-900/40 text-green-300 text-xs">Padrao</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{rule.taxRegime} {rule.isSimplesNacional ? 'Simples Nacional' : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      LC 116: {rule.serviceCodeLc116}<br />
                      <span className="text-xs text-muted-foreground">CNAE: {rule.cnae || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      Prestador: {rule.providerCityName || rule.providerCityCode}<br />
                      <span className="text-xs text-muted-foreground">Tomador: {rule.customerCityName || rule.customerCityCode || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {rule.issRate.toFixed(2)}%
                      {rule.issWithheld && <p className="text-xs text-amber-300">Retido</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${rule.isActive ? 'text-green-300 bg-green-900/30' : 'text-muted-foreground bg-muted/70'}`}>
                        {rule.isActive ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {rule.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setShowRuleForm(rule)} className="p-1.5 text-foreground hover:text-foreground hover:bg-muted rounded-lg" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('Excluir ou arquivar esta regra fiscal?')) return;
                          const r = await apiFetch(`/api/pj/fiscal/regras-servico/${rule.id}`, { method: 'DELETE' });
                          if (r.ok) { toast.success('Regra removida'); loadRules(); } else toast.error('Erro ao remover regra');
                        }}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showMarkPaid && <MarkPaidModal record={showMarkPaid} onClose={() => setShowMarkPaid(null)} onSave={markPaid} />}
      {showRuleForm && <FiscalRuleDialog rule={showRuleForm === 'new' ? null : showRuleForm} onClose={() => setShowRuleForm(null)} onSaved={loadRules} />}
    </div>
  );
}

function FiscalRuleDialog({ rule, onClose, onSaved }: { rule: any | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({
    name: rule?.name || '',
    serviceDescription: rule?.serviceDescription || '',
    serviceCodeLc116: rule?.serviceCodeLc116 || '',
    cnae: rule?.cnae || '',
    providerMunicipalRegistration: rule?.providerMunicipalRegistration || '',
    providerCityCode: rule?.providerCityCode || '',
    providerCityName: rule?.providerCityName || '',
    customerCityCode: rule?.customerCityCode || '',
    customerCityName: rule?.customerCityName || '',
    operationNature: rule?.operationNature || 'Prestacao de servico',
    taxRegime: rule?.taxRegime || 'simples_nacional',
    isSimplesNacional: rule?.isSimplesNacional ?? true,
    issRate: rule?.issRate ?? 2,
    issWithheld: rule?.issWithheld ?? false,
    inssRate: rule?.inssRate ?? 0,
    irrfRate: rule?.irrfRate ?? 0,
    csllRate: rule?.csllRate ?? 0,
    pisRate: rule?.pisRate ?? 0,
    cofinsRate: rule?.cofinsRate ?? 0,
    cbsRate: rule?.cbsRate ?? 0,
    ibsRate: rule?.ibsRate ?? 0,
    cbsCst: rule?.cbsCst || '',
    ibsCst: rule?.ibsCst || '',
    cbsClassificationCode: rule?.cbsClassificationCode || '',
    ibsClassificationCode: rule?.ibsClassificationCode || '',
    isDefault: rule?.isDefault ?? false,
    isActive: rule?.isActive ?? true,
    notes: rule?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: any) => setForm((prev: any) => ({ ...prev, [key]: value }));
  const field = (key: string, label: string, props: any = {}) => (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <input
        value={form[key] ?? ''}
        onChange={e => set(key, e.target.value)}
        className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm"
        {...props}
      />
    </div>
  );

  const save = async () => {
    setSaving(true);
    const method = rule ? 'PATCH' : 'POST';
    const url = rule ? `/api/pj/fiscal/regras-servico/${rule.id}` : '/api/pj/fiscal/regras-servico';
    const r = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        issRate: Number(form.issRate || 0),
        inssRate: Number(form.inssRate || 0),
        irrfRate: Number(form.irrfRate || 0),
        csllRate: Number(form.csllRate || 0),
        pisRate: Number(form.pisRate || 0),
        cofinsRate: Number(form.cofinsRate || 0),
        cbsRate: Number(form.cbsRate || 0),
        ibsRate: Number(form.ibsRate || 0),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      const warnings = data.validation?.warnings?.length ? ` Avisos: ${data.validation.warnings.join(' ')}` : '';
      toast.success(`Regra fiscal salva.${warnings}`);
      onSaved();
      onClose();
    } else {
      const details = data.details ? Object.values(data.details).flat().join(' ') : '';
      toast.error(data.error || details || 'Erro ao salvar regra');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{rule ? 'Editar regra NFS-e' : 'Nova regra NFS-e'}</h3>
            <p className="text-xs text-muted-foreground mt-1">Campos fiscais usados para validar e emitir NFS-e de servicos.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">Fechar</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {field('name', 'Nome da regra *')}
          {field('serviceCodeLc116', 'Codigo LC 116 *')}
          {field('cnae', 'CNAE *')}
          {field('providerMunicipalRegistration', 'Inscricao municipal *')}
          {field('providerCityCode', 'Municipio prestador - IBGE *')}
          {field('providerCityName', 'Municipio prestador')}
          {field('customerCityCode', 'Municipio tomador - IBGE *')}
          {field('customerCityName', 'Municipio tomador')}
          {field('operationNature', 'Natureza da operacao *')}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Regime tributario *</label>
            <select value={form.taxRegime} onChange={e => set('taxRegime', e.target.value)}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm">
              <option value="simples_nacional">Simples Nacional</option>
              <option value="lucro_presumido">Lucro Presumido</option>
              <option value="lucro_real">Lucro Real</option>
            </select>
          </div>
          {field('issRate', 'ISS (%) *', { type: 'number', step: '0.01', min: '0', max: '5' })}
          <div className="flex items-end gap-4 pb-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={form.issWithheld} onChange={e => set('issWithheld', e.target.checked)} />
              ISS retido
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={form.isSimplesNacional} onChange={e => set('isSimplesNacional', e.target.checked)} />
              Simples
            </label>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-white mb-2">Retencoes federais</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {field('inssRate', 'INSS (%)', { type: 'number', step: '0.01', min: '0' })}
            {field('irrfRate', 'IRRF (%)', { type: 'number', step: '0.01', min: '0' })}
            {field('csllRate', 'CSLL (%)', { type: 'number', step: '0.01', min: '0' })}
            {field('pisRate', 'PIS (%)', { type: 'number', step: '0.01', min: '0' })}
            {field('cofinsRate', 'COFINS (%)', { type: 'number', step: '0.01', min: '0' })}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-white mb-2">CBS / IBS</p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {field('cbsRate', 'CBS (%)', { type: 'number', step: '0.01', min: '0' })}
            {field('ibsRate', 'IBS (%)', { type: 'number', step: '0.01', min: '0' })}
            {field('cbsCst', 'CST CBS')}
            {field('ibsCst', 'CST IBS')}
            {field('cbsClassificationCode', 'Class. CBS')}
            {field('ibsClassificationCode', 'Class. IBS')}
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Descricao / observacoes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm min-h-20" />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.isDefault} onChange={e => set('isDefault', e.target.checked)} />
            Regra padrao
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} />
            Ativa
          </label>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-muted hover:bg-muted text-foreground text-sm">Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar regra'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewIcmsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    type: 'ISS', period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    baseValue: '', rate: '', taxValue: '', dueDate: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const calcTax = (base: string, rate: string) => {
    const b = parseFloat(base), r = parseFloat(rate);
    if (!isNaN(b) && !isNaN(r)) setForm(prev => ({ ...prev, taxValue: (b * r / 100).toFixed(2) }));
  };

  const save = async () => {
    if (!form.baseValue || !form.taxValue) { toast.error('Preencha os valores'); return; }
    setSaving(true);
    const [y, m] = form.period.split('-');
    const r = await apiFetch('/api/pj/fiscal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: form.type,
        period: form.period,
        year: parseInt(y),
        month: parseInt(m),
        baseValue: parseFloat(form.baseValue),
        rate: parseFloat(form.rate) || null,
        taxValue: parseFloat(form.taxValue),
        dueDate: form.dueDate || null,
        notes: form.notes || null,
      }),
    });
    if (r.ok) { toast.success('Imposto registrado'); onSaved(); onClose(); }
    else { const d = await r.json(); toast.error(d.error || 'Erro ao salvar'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4">
        <h3 className="text-lg font-bold">Lançar ICMS / ISS</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tipo</label>
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm">
              <option value="ISS">ISS</option>
              <option value="ICMS">ICMS</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Período (AAAA-MM)</label>
            <input type="month" value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Base de Cálculo (R$)</label>
            <input type="number" step="0.01" value={form.baseValue}
              onChange={e => { setForm(p => ({ ...p, baseValue: e.target.value })); calcTax(e.target.value, form.rate); }}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Alíquota (%)</label>
            <input type="number" step="0.01" value={form.rate}
              onChange={e => { setForm(p => ({ ...p, rate: e.target.value })); calcTax(form.baseValue, e.target.value); }}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Valor do Imposto (R$)</label>
            <input type="number" step="0.01" value={form.taxValue} onChange={e => setForm(p => ({ ...p, taxValue: e.target.value }))}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Vencimento</label>
            <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
              className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Observações</label>
          <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-muted hover:bg-muted text-foreground py-2 rounded-lg text-sm">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FiscalPJPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Carregando...</div>}>
      <FiscalPJContent />
    </Suspense>
  );
}

function MarkPaidModal({ record, onClose, onSave }: { record: TaxRecord; onClose: () => void; onSave: (r: TaxRecord, amt: string, dt: string) => void }) {
  const [amount, setAmount] = useState(String(record.taxValue));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4">
        <h3 className="text-lg font-bold">Registrar Pagamento</h3>
        <p className="text-muted-foreground text-sm">{record.type} — {record.period}</p>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Valor pago (R$)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} step="0.01"
            className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Data do pagamento</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full bg-muted border border-border text-foreground rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-muted hover:bg-muted text-foreground py-2 rounded-lg text-sm">Cancelar</button>
          <button onClick={() => onSave(record, amount, date)} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg text-sm font-medium">Confirmar</button>
        </div>
      </div>
    </div>
  );
}

