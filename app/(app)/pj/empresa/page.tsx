'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/fetch';
import { usePJ } from '@/lib/pj-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Building2, Save, Plus, Loader2, Trash2,
  Upload, MapPin, FileText, Settings, X, RefreshCw,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const UF_LIST = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const REGIMES = [
  { value: '', label: '— Selecione —' },
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
  { value: 'mei', label: 'MEI' },
];

const PORTE_LIST = [
  { value: '', label: '— Selecione —' },
  { value: 'mei', label: 'MEI' },
  { value: 'me', label: 'Micro empresa (ME)' },
  { value: 'epp', label: 'Empresa de Pequeno Porte (EPP)' },
  { value: 'medio', label: 'Médio Porte' },
  { value: 'grande', label: 'Grande Porte' },
];

const NATUREZA_LIST = [
  { value: '', label: '— Selecione —' },
  { value: '2062', label: 'Sociedade Empresária Limitada (LTDA)' },
  { value: '2305', label: 'Sociedade Anônima (S.A.)' },
  { value: '2135', label: 'Empresário Individual' },
  { value: '2143', label: 'Empresa Individual de Resp. Limitada (EIRELI)' },
  { value: '4120', label: 'Associação Privada' },
  { value: '2144', label: 'Cooperativa' },
];

const TIPO_LOGRADOURO = ['Rua','Avenida','Alameda','Travessa','Praça','Rodovia','Estrada','Viela','Outros'];

const REGIME_ESPECIAL = [
  { value: '', label: '— Selecione —' },
  { value: '1', label: 'Microempresa Municipal' },
  { value: '2', label: 'Estimativa' },
  { value: '3', label: 'Sociedade de Profissionais' },
  { value: '4', label: 'Cooperativa' },
  { value: '5', label: 'MEI' },
  { value: '6', label: 'ME-EPP (MEEPP)' },
];

const NATUREZA_OPERACAO = [
  { value: '1', label: 'Tributação do Município' },
  { value: '2', label: 'Tributação Fora do Município' },
  { value: '3', label: 'Isenção' },
  { value: '4', label: 'Imune' },
  { value: '5', label: 'Exigibilidade Suspensa por Decisão Judicial' },
  { value: '6', label: 'Exigibilidade Suspensa por Procedimento Administrativo' },
];

const COR_LIST = [
  { value: 'azul',     label: 'Azul',     tw: 'bg-blue-500' },
  { value: 'verde',    label: 'Verde',    tw: 'bg-green-500' },
  { value: 'ciano',    label: 'Ciano',    tw: 'bg-cyan-500' },
  { value: 'laranja',  label: 'Laranja',  tw: 'bg-orange-500' },
  { value: 'vermelho', label: 'Vermelho', tw: 'bg-red-500' },
  { value: 'roxo',     label: 'Roxo',     tw: 'bg-purple-500' },
  { value: 'cinza',    label: 'Cinza',    tw: 'bg-gray-500' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-3 border-b mb-5">
      <Icon className="w-4 h-4 text-primary shrink-0" />
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-teal-500' : 'bg-muted-foreground/30'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function SelectField({ label, value, onChange, options, className }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Initial form state ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '', tradeName: '', phone: '', email: '',
  // empresa extras
  porte: '', naturezaJuridica: '', sigla: '', cor: 'azul',
  excessoSublimite: false, observacoes: '',
  // fiscal
  regimeTributario: '', inscricaoEstadual: '', inscricaoEstadualIsento: false,
  ufInscricaoEstadual: '', inscricaoMunicipal: '', aliquotaDas: '',
  cnaeList: [] as string[],
  // address
  cep: '', estado: '', cidade: '', tipoLogradouro: 'Rua',
  logradouro: '', numero: '', complemento: '', bairro: '', referencia: '',
  // nfse
  nfseEmite: false, nfseAmbienteProducao: true, nfseIncentivadorCultural: false,
  nfseRegimeEspecial: '', nfseNaturezaOperacao: '1', nfseEmailRemetente: '',
  nfseNumeroRps: '', nfseSerieRps: '1', nfseUsuario: '', nfseSenha: '',
  nfseDiscriminacao: '',
  // nfe/nfce
  nfeSerie: '1', nfceSerie: '65', nfceCsc: '', nfceCscId: '', sefazEnvironment: 'producao',
  // vendas
  vendasVende: true, vendasDiasOrcamento: '5', vendasMaxParcelas: '12',
  vendaServicoVende: true, vendaProdutoVende: false, vendaProdutoBaixaAuto: false,
};

type ConfigTab = 'vendas' | 'nfse' | 'nfe' | 'certificado' | 'faturamento';

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EmpresaPage() {
  const { activeCompanyId, switchCompany } = usePJ();
  const { toast } = useToast();

  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTab>('nfse');
  const [certificates, setCertificates] = useState<any[]>([]);
  const [certUploading, setCertUploading] = useState(false);
  const [cnaeInput, setCnaeInput] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  const sf = (field: keyof typeof EMPTY_FORM, value: any) =>
    setForm(p => ({ ...p, [field]: value }));

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadCompany = useCallback(async () => {
    if (!activeCompanyId) { setLoading(false); return; }
    setLoading(true);
    const res = await apiFetch(`/api/pj/companies/${activeCompanyId}`);
    if (res.ok) {
      const data = await res.json();
      setCompany(data);
      const f: any = data.features ?? {};
      const fiscal: any = f.fiscal ?? {};
      const addr: any = f.address ?? {};
      const nfse: any = f.nfse ?? {};
      const emp: any = f.empresa ?? {};
      const vendas: any = f.vendas ?? {};
      setForm({
        name: data.name || '',
        tradeName: data.tradeName || '',
        phone: data.phone || '',
        email: data.email || '',
        porte: emp.porte || '',
        naturezaJuridica: emp.naturezaJuridica || '',
        sigla: emp.sigla || '',
        cor: emp.cor || 'azul',
        excessoSublimite: emp.excessoSublimite || false,
        observacoes: emp.observacoes || '',
        regimeTributario: fiscal.regimeTributario || '',
        inscricaoEstadual: fiscal.inscricaoEstadualIsento ? '' : (fiscal.inscricaoEstadual || ''),
        inscricaoEstadualIsento: fiscal.inscricaoEstadualIsento || fiscal.inscricaoEstadual === 'ISENTO' || false,
        ufInscricaoEstadual: fiscal.ufInscricaoEstadual || '',
        inscricaoMunicipal: fiscal.inscricaoMunicipal || '',
        aliquotaDas: fiscal.aliquotaDas || '',
        cnaeList: fiscal.cnaeList || (fiscal.cnae ? [fiscal.cnae] : []),
        cep: addr.cep || '',
        estado: addr.estado || '',
        cidade: addr.cidade || '',
        tipoLogradouro: addr.tipoLogradouro || 'Rua',
        logradouro: addr.logradouro || '',
        numero: addr.numero || '',
        complemento: addr.complemento || '',
        bairro: addr.bairro || '',
        referencia: addr.referencia || '',
        nfseEmite: nfse.emite || false,
        nfseAmbienteProducao: nfse.ambienteProducao !== false,
        nfseIncentivadorCultural: nfse.incentivadorCultural || false,
        nfseRegimeEspecial: nfse.regimeEspecial || '',
        nfseNaturezaOperacao: nfse.naturezaOperacao || '1',
        nfseEmailRemetente: nfse.emailRemetente || '',
        nfseNumeroRps: nfse.numeroRps || '',
        nfseSerieRps: nfse.serieRps || '1',
        nfseUsuario: nfse.usuario || '',
        nfseSenha: nfse.senha || '',
        nfseDiscriminacao: nfse.discriminacao || '',
        nfeSerie: fiscal.nfeSerie || '1',
        nfceSerie: fiscal.nfceSerie || '65',
        nfceCsc: fiscal.nfceCsc || '',
        nfceCscId: fiscal.nfceCscId || '',
        sefazEnvironment: fiscal.sefazEnvironment || 'producao',
        vendasVende: vendas.vende !== false,
        vendasDiasOrcamento: String(vendas.diasOrcamento ?? '5'),
        vendasMaxParcelas: String(vendas.maxParcelas ?? '12'),
        vendaServicoVende: vendas.servico?.vende !== false,
        vendaProdutoVende: vendas.produto?.vende || false,
        vendaProdutoBaixaAuto: vendas.produto?.baixaAuto || false,
      });
    }
    setLoading(false);
  }, [activeCompanyId]);

  const loadCerts = useCallback(async () => {
    if (!activeCompanyId) return;
    const res = await apiFetch(`/api/pj/companies/${activeCompanyId}/certificates`);
    if (res.ok) setCertificates((await res.json()).certificates || []);
  }, [activeCompanyId]);

  useEffect(() => { loadCompany(); loadCerts(); }, [loadCompany, loadCerts]);

  // ── CEP lookup ──────────────────────────────────────────────────────────────

  const lookupCep = async (raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const d = await res.json();
      if (!d.erro) {
        const full = d.logradouro || '';
        const tipo = TIPO_LOGRADOURO.find(t => full.toLowerCase().startsWith(t.toLowerCase()));
        setForm(p => ({
          ...p,
          tipoLogradouro: tipo || 'Rua',
          logradouro: tipo ? full.slice(tipo.length).trim() : full,
          bairro: d.bairro || p.bairro,
          cidade: d.localidade || p.cidade,
          estado: d.uf || p.estado,
        }));
      }
    } catch { /* ignore */ }
    setCepLoading(false);
  };

  // ── CNAE list ───────────────────────────────────────────────────────────────

  const addCnae = () => {
    const v = cnaeInput.trim();
    if (!v || form.cnaeList.includes(v)) return;
    sf('cnaeList', [...form.cnaeList, v]);
    setCnaeInput('');
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!activeCompanyId) return;
    setSaving(true);
    const body = {
      name: form.name,
      tradeName: form.tradeName,
      phone: form.phone,
      email: form.email,
      empresa: {
        porte: form.porte, naturezaJuridica: form.naturezaJuridica,
        sigla: form.sigla, cor: form.cor,
        excessoSublimite: form.excessoSublimite, observacoes: form.observacoes,
      },
      fiscal: {
        regimeTributario: form.regimeTributario,
        inscricaoEstadual: form.inscricaoEstadualIsento ? 'ISENTO' : form.inscricaoEstadual,
        inscricaoEstadualIsento: form.inscricaoEstadualIsento,
        ufInscricaoEstadual: form.ufInscricaoEstadual,
        inscricaoMunicipal: form.inscricaoMunicipal,
        cnaeList: form.cnaeList,
        cnae: form.cnaeList[0] || '',
        aliquotaDas: form.aliquotaDas,
        nfeSerie: form.nfeSerie,
        nfceSerie: form.nfceSerie,
        nfceCsc: form.nfceCsc,
        nfceCscId: form.nfceCscId,
        sefazEnvironment: form.sefazEnvironment,
      },
      address: {
        cep: form.cep, estado: form.estado, cidade: form.cidade,
        tipoLogradouro: form.tipoLogradouro, logradouro: form.logradouro,
        numero: form.numero, complemento: form.complemento,
        bairro: form.bairro, referencia: form.referencia,
      },
      nfse: {
        emite: form.nfseEmite, ambienteProducao: form.nfseAmbienteProducao,
        incentivadorCultural: form.nfseIncentivadorCultural,
        regimeEspecial: form.nfseRegimeEspecial,
        naturezaOperacao: form.nfseNaturezaOperacao,
        emailRemetente: form.nfseEmailRemetente,
        numeroRps: form.nfseNumeroRps, serieRps: form.nfseSerieRps,
        usuario: form.nfseUsuario, senha: form.nfseSenha,
        discriminacao: form.nfseDiscriminacao,
      },
      vendas: {
        vende: form.vendasVende,
        diasOrcamento: parseInt(form.vendasDiasOrcamento) || 5,
        maxParcelas: parseInt(form.vendasMaxParcelas) || 12,
        servico: { vende: form.vendaServicoVende },
        produto: { vende: form.vendaProdutoVende, baixaAuto: form.vendaProdutoBaixaAuto },
      },
    };
    const res = await apiFetch(`/api/pj/companies/${activeCompanyId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast({ title: 'Empresa salva com sucesso' });
      setCompany(await res.json());
    } else {
      const err = await res.json();
      toast({ title: 'Erro ao salvar', description: err.error, variant: 'destructive' });
    }
    setSaving(false);
  };

  // ── Certificate helpers ─────────────────────────────────────────────────────

  const uploadCert = async (file: File) => {
    setCertUploading(true);
    const res = await apiFetch(`/api/pj/companies/${activeCompanyId}/certificates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, uploadedBy: 'Usuário' }),
    });
    if (res.ok) { toast({ title: 'Certificado registrado.' }); loadCerts(); }
    else toast({ title: 'Erro ao registrar certificado', variant: 'destructive' });
    setCertUploading(false);
  };

  const deleteCert = async (certId: string) => {
    if (!confirm('Remover certificado?')) return;
    await apiFetch(`/api/pj/companies/${activeCompanyId}/certificates?certId=${certId}`, { method: 'DELETE' });
    loadCerts();
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const corObj = COR_LIST.find(c => c.value === form.cor) ?? COR_LIST[0];
  const avatarChar = (form.sigla?.[0] || form.name?.[0] || '?').toUpperCase();

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!activeCompanyId && !showNew) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Empresa</h1>
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma empresa cadastrada.</p>
            <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-2" />Cadastrar Empresa</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl pb-10">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cadastro de Empresa</h1>
          {company && <p className="text-xs text-muted-foreground mt-0.5">CNPJ {company.cnpj}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowNew(!showNew)}>
            <Plus className="w-4 h-4 mr-1" />Nova
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* ── New company inline form ─────────────────────────────────────────── */}
      {showNew && (
        <Card className="border-primary">
          <CardContent className="pt-5">
            <p className="font-semibold mb-4">Cadastrar Nova Empresa</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const res = await apiFetch('/api/pj/companies', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: fd.get('name'), cnpj: fd.get('cnpj'), tradeName: fd.get('tradeName'), phone: fd.get('phone'), email: fd.get('email') }),
              });
              if (res.ok) {
                const newC = await res.json();
                toast({ title: 'Empresa criada!' });
                setShowNew(false);
                await switchCompany(newC.id);
                window.location.reload();
              } else {
                const err = await res.json();
                toast({ title: 'Erro', description: err.error, variant: 'destructive' });
              }
            }} className="grid sm:grid-cols-2 gap-4">
              <div><Label>Razão Social *</Label><Input name="name" required className="mt-1" /></div>
              <div><Label>CNPJ *</Label><Input name="cnpj" required placeholder="00.000.000/0000-00" className="mt-1" /></div>
              <div><Label>Nome Fantasia</Label><Input name="tradeName" className="mt-1" /></div>
              <div><Label>Telefone</Label><Input name="phone" className="mt-1" /></div>
              <div><Label>E-mail</Label><Input name="email" type="email" className="mt-1" /></div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
                <Button type="submit">Criar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {company && (
        <>
          {/* ── Dados Básicos ──────────────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-5">
              <SectionHeader icon={Building2} title="Dados Básicos" />
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">

                <div>
                  <Label>CNPJ</Label>
                  <Input value={company.cnpj} disabled className="mt-1 bg-muted" />
                </div>
                <div>
                  <Label>Nome Fantasia</Label>
                  <Input value={form.tradeName} onChange={e => sf('tradeName', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Razão Social</Label>
                  <Input value={form.name} onChange={e => sf('name', e.target.value)} required className="mt-1" />
                </div>

                <SelectField label="Regime Tributário" value={form.regimeTributario}
                  onChange={v => sf('regimeTributario', v)} options={REGIMES} />
                <SelectField label="Porte" value={form.porte}
                  onChange={v => sf('porte', v)} options={PORTE_LIST} />
                <SelectField label="Natureza Jurídica" value={form.naturezaJuridica}
                  onChange={v => sf('naturezaJuridica', v)} options={NATUREZA_LIST} />

                {/* Inscrição Estadual + ISENTO */}
                <div>
                  <Label>Inscrição Estadual</Label>
                  <div className="mt-1 flex gap-2 items-center">
                    <Input
                      value={form.inscricaoEstadualIsento ? 'ISENTO' : form.inscricaoEstadual}
                      onChange={e => sf('inscricaoEstadual', e.target.value)}
                      disabled={form.inscricaoEstadualIsento}
                      className={form.inscricaoEstadualIsento ? 'bg-muted flex-1' : 'flex-1'}
                      placeholder="000.000.000.000"
                    />
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer select-none">
                      <input type="checkbox" checked={form.inscricaoEstadualIsento}
                        onChange={e => sf('inscricaoEstadualIsento', e.target.checked)} className="w-3.5 h-3.5" />
                      ISENTO
                    </label>
                  </div>
                </div>
                <div>
                  <Label>UF da Insc. Estadual</Label>
                  <select value={form.ufInscricaoEstadual} onChange={e => sf('ufInscricaoEstadual', e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">— UF —</option>
                    {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Inscrição Municipal</Label>
                  <Input value={form.inscricaoMunicipal} onChange={e => sf('inscricaoMunicipal', e.target.value)} className="mt-1" placeholder="Ex: 298481" />
                </div>

                <div>
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={e => sf('phone', e.target.value)} className="mt-1" placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={e => sf('email', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Sigla</Label>
                  <Input value={form.sigla} onChange={e => sf('sigla', e.target.value.slice(0, 3).toUpperCase())}
                    className="mt-1" placeholder="W" maxLength={3} />
                </div>

                {/* Cor + Preview */}
                <div>
                  <Label>Cor</Label>
                  <select value={form.cor} onChange={e => sf('cor', e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {COR_LIST.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-4">
                  <div>
                    <Label>Preview</Label>
                    <div className={`mt-1 w-10 h-10 rounded-full ${corObj.tw} flex items-center justify-center text-white font-bold text-lg select-none`}>
                      {avatarChar}
                    </div>
                  </div>
                  {form.regimeTributario === 'simples_nacional' && (
                    <div className="flex-1">
                      <Label>Alíquota DAS (%)</Label>
                      <Input type="number" step="0.01" value={form.aliquotaDas}
                        onChange={e => sf('aliquotaDas', e.target.value)} className="mt-1" placeholder="6,00" />
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-2 pt-1">
                  <input type="checkbox" id="excesso" checked={form.excessoSublimite}
                    onChange={e => sf('excessoSublimite', e.target.checked)} className="w-4 h-4 rounded" />
                  <label htmlFor="excesso" className="text-sm cursor-pointer select-none">
                    Excesso de sublimite de receita bruta
                  </label>
                </div>

              </div>
            </CardContent>
          </Card>

          {/* ── Localização ────────────────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-5">
              <SectionHeader icon={MapPin} title="Localização" />
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label>CEP</Label>
                  <div className="mt-1 flex gap-1">
                    <Input value={form.cep} onChange={e => sf('cep', e.target.value)}
                      onBlur={e => lookupCep(e.target.value)} placeholder="00000-000" className="flex-1" />
                    <Button type="button" variant="outline" size="sm" className="px-2 shrink-0"
                      onClick={() => lookupCep(form.cep)} disabled={cepLoading}>
                      {cepLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Estado</Label>
                  <select value={form.estado} onChange={e => sf('estado', e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">— UF —</option>
                    {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <Label>Cidade</Label>
                  <Input value={form.cidade} onChange={e => sf('cidade', e.target.value)} className="mt-1" placeholder="São Paulo" />
                </div>

                <div>
                  <Label>Tipo de Logradouro</Label>
                  <select value={form.tipoLogradouro} onChange={e => sf('tipoLogradouro', e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {TIPO_LOGRADOURO.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <Label>Logradouro</Label>
                  <Input value={form.logradouro} onChange={e => sf('logradouro', e.target.value)} className="mt-1" placeholder="Brasil" />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input value={form.numero} onChange={e => sf('numero', e.target.value)} className="mt-1" placeholder="1170" />
                </div>

                <div>
                  <Label>Complemento</Label>
                  <Input value={form.complemento} onChange={e => sf('complemento', e.target.value)} className="mt-1" placeholder="Sala 34" />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input value={form.bairro} onChange={e => sf('bairro', e.target.value)} className="mt-1" />
                </div>
                <div className="lg:col-span-2">
                  <Label>Referência</Label>
                  <Input value={form.referencia} onChange={e => sf('referencia', e.target.value)} className="mt-1" placeholder="Próximo ao..." />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── CNAE ───────────────────────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-5">
              <SectionHeader icon={FileText} title="CNAE" />
              <div className="flex gap-2 mb-3">
                <Input value={cnaeInput} onChange={e => setCnaeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCnae(); } }}
                  placeholder="Ex: 6201-5/01 — Desenvolvimento de programas de computador"
                  className="flex-1" />
                <Button type="button" variant="outline" onClick={addCnae}>
                  <Plus className="w-4 h-4 mr-1" />Adicionar
                </Button>
              </div>
              {form.cnaeList.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum CNAE cadastrado.</p>
              ) : (
                <div className="space-y-1">
                  {form.cnaeList.map((cnae, i) => (
                    <div key={cnae} className="flex items-center justify-between px-3 py-2 rounded-md border bg-muted/30 text-sm">
                      <div>
                        {i === 0 && <span className="text-[10px] font-semibold text-primary uppercase mr-2">Principal</span>}
                        {cnae}
                      </div>
                      <button type="button" onClick={() => sf('cnaeList', form.cnaeList.filter(c => c !== cnae))}
                        className="text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Configurações (tabbed) ─────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-5">
              <SectionHeader icon={Settings} title="Configurações" />
              <div className="flex flex-wrap gap-1 border-b pb-2 mb-5">
                {([
                  { id: 'vendas',      label: 'Vendas' },
                  { id: 'nfse',        label: 'NFSe' },
                  { id: 'nfe',         label: 'NF-e / NFC-e' },
                  { id: 'certificado', label: 'Certificado' },
                  { id: 'faturamento', label: 'Faturamento' },
                ] as const).map(t => (
                  <button key={t.id} type="button" onClick={() => setConfigTab(t.id)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${configTab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Vendas */}
              {configTab === 'vendas' && (
                <div className="space-y-5">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <div>
                      <Label>Vende?</Label>
                      <div className="mt-2 flex items-center gap-2">
                        <Toggle checked={form.vendasVende} onChange={v => sf('vendasVende', v)} />
                        <span className="text-sm">{form.vendasVende ? 'Sim' : 'Não'}</span>
                      </div>
                    </div>
                    <div>
                      <Label>Dias de validade do orçamento</Label>
                      <Input type="number" value={form.vendasDiasOrcamento} onChange={e => sf('vendasDiasOrcamento', e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label>Máx. parcelas na venda</Label>
                      <Input type="number" value={form.vendasMaxParcelas} onChange={e => sf('vendasMaxParcelas', e.target.value)} className="mt-1" />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold mb-3">Venda de Serviço</p>
                    <div className="flex items-center gap-2">
                      <Toggle checked={form.vendaServicoVende} onChange={v => sf('vendaServicoVende', v)} />
                      <span className="text-sm">{form.vendaServicoVende ? 'Sim' : 'Não'}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold mb-3">Venda de Produto</p>
                    <div className="flex flex-wrap gap-6">
                      <div className="flex items-center gap-2">
                        <Toggle checked={form.vendaProdutoVende} onChange={v => sf('vendaProdutoVende', v)} />
                        <span className="text-sm">{form.vendaProdutoVende ? 'Sim' : 'Não'}</span>
                      </div>
                      {form.vendaProdutoVende && (
                        <div className="flex items-center gap-2">
                          <Label>Baixa automática de estoque?</Label>
                          <Toggle checked={form.vendaProdutoBaixaAuto} onChange={v => sf('vendaProdutoBaixaAuto', v)} />
                          <span className="text-sm">{form.vendaProdutoBaixaAuto ? 'Sim' : 'Não'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* NFSe */}
              {configTab === 'nfse' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-8">
                    <div>
                      <Label>Emite NFSe?</Label>
                      <div className="mt-2 flex items-center gap-2">
                        <Toggle checked={form.nfseEmite} onChange={v => sf('nfseEmite', v)} />
                        <span className="text-sm">{form.nfseEmite ? 'Sim' : 'Não'}</span>
                      </div>
                    </div>
                    {form.nfseEmite && (
                      <>
                        <div>
                          <Label>Ambiente de Produção</Label>
                          <div className="mt-2 flex items-center gap-2">
                            <Toggle checked={form.nfseAmbienteProducao} onChange={v => sf('nfseAmbienteProducao', v)} />
                            <span className="text-sm">{form.nfseAmbienteProducao ? 'Sim' : 'Não'}</span>
                          </div>
                        </div>
                        <div>
                          <Label>Incentivador Cultural</Label>
                          <div className="mt-2 flex items-center gap-2">
                            <Toggle checked={form.nfseIncentivadorCultural} onChange={v => sf('nfseIncentivadorCultural', v)} />
                            <span className="text-sm">{form.nfseIncentivadorCultural ? 'Sim' : 'Não'}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {form.nfseEmite && (
                    <>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <SelectField label="Regime Especial de Tributação" value={form.nfseRegimeEspecial}
                          onChange={v => sf('nfseRegimeEspecial', v)} options={REGIME_ESPECIAL} />
                        <SelectField label="Natureza da Operação" value={form.nfseNaturezaOperacao}
                          onChange={v => sf('nfseNaturezaOperacao', v)} options={NATUREZA_OPERACAO} />
                        <div>
                          <Label>E-mail Remetente</Label>
                          <Input type="email" value={form.nfseEmailRemetente}
                            onChange={e => sf('nfseEmailRemetente', e.target.value)} className="mt-1" placeholder="nfe@empresa.com.br" />
                        </div>
                        <div>
                          <Label>Número Atual RPS</Label>
                          <Input value={form.nfseNumeroRps} onChange={e => sf('nfseNumeroRps', e.target.value)} className="mt-1" placeholder="1.776" />
                        </div>
                        <div>
                          <Label>Série RPS</Label>
                          <Input value={form.nfseSerieRps} onChange={e => sf('nfseSerieRps', e.target.value)} className="mt-1" placeholder="1" />
                        </div>
                        <div>
                          <Label>Usuário (CNPJ / login prefeitura)</Label>
                          <Input value={form.nfseUsuario} onChange={e => sf('nfseUsuario', e.target.value)} className="mt-1" />
                        </div>
                        <div>
                          <Label>Senha</Label>
                          <Input type="password" value={form.nfseSenha}
                            onChange={e => sf('nfseSenha', e.target.value)} className="mt-1" autoComplete="new-password" />
                        </div>
                      </div>

                      <div>
                        <Label>Discriminação do Serviço (template)</Label>
                        <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                          Variáveis disponíveis:{' '}
                          <code className="bg-muted px-1 rounded text-xs">{'{{ServicosSimplificado}}'}</code>{' '}
                          <code className="bg-muted px-1 rounded text-xs">{'{{InformacaoImposto}}'}</code>
                        </p>
                        <textarea value={form.nfseDiscriminacao}
                          onChange={e => sf('nfseDiscriminacao', e.target.value)} rows={4}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder={'{{ServicosSimplificado}}\n{{InformacaoImposto}}'} />
                      </div>

                      {!form.nfseAmbienteProducao && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-3 text-sm text-amber-800 dark:text-amber-400">
                          Ambiente de homologação ativo — notas emitidas não têm validade fiscal.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* NF-e / NFC-e */}
              {configTab === 'nfe' && (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label>Ambiente SEFAZ</Label>
                      <select value={form.sefazEnvironment} onChange={e => sf('sefazEnvironment', e.target.value)}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="producao">Produção</option>
                        <option value="homologacao">Homologação (Testes)</option>
                      </select>
                    </div>
                    <div>
                      <Label>Série NF-e padrão</Label>
                      <Input value={form.nfeSerie} onChange={e => sf('nfeSerie', e.target.value)} className="mt-1" placeholder="1" />
                    </div>
                    <div>
                      <Label>Série NFC-e</Label>
                      <Input value={form.nfceSerie} onChange={e => sf('nfceSerie', e.target.value)} className="mt-1" placeholder="65" />
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-xs text-muted-foreground mb-3">CSC — Código de Segurança do Contribuinte (obrigatório para NFC-e em produção)</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label>CSC ID</Label>
                        <Input value={form.nfceCscId} onChange={e => sf('nfceCscId', e.target.value)} className="mt-1" placeholder="000001" />
                      </div>
                      <div>
                        <Label>CSC Token</Label>
                        <Input type="password" value={form.nfceCsc} onChange={e => sf('nfceCsc', e.target.value)} className="mt-1" placeholder="Token SEFAZ" />
                      </div>
                    </div>
                  </div>
                  {form.sefazEnvironment === 'homologacao' && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-3 text-sm text-amber-800 dark:text-amber-400">
                      Ambiente de Homologação ativo — notas não têm validade fiscal.
                    </div>
                  )}
                </div>
              )}

              {/* Certificado */}
              {configTab === 'certificado' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Certificado digital A1 (.pfx / .p12) para assinatura de NF-e e NFC-e.</p>
                    <div>
                      <Button type="button" variant="outline" size="sm" className="gap-2" disabled={certUploading}
                        onClick={() => document.getElementById('cert-file-input')?.click()}>
                        {certUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Adicionar Novo Certificado
                      </Button>
                      <input id="cert-file-input" type="file" accept=".pfx,.p12,.pem,.crt" className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) await uploadCert(file);
                          e.target.value = '';
                        }} />
                    </div>
                  </div>
                  {certificates.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Nenhum certificado cadastrado.</p>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr className="text-xs text-muted-foreground uppercase">
                            <th className="px-3 py-2 text-left">Nome do Arquivo</th>
                            <th className="px-3 py-2 text-left">Data de Upload</th>
                            <th className="px-3 py-2 text-left">Data de Expiração</th>
                            <th className="px-3 py-2 text-left">Ativo</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {certificates.map((cert: any) => {
                            const expired = cert.expiresAt && new Date(cert.expiresAt) < new Date();
                            return (
                              <tr key={cert.id} className="border-t">
                                <td className="px-3 py-2 font-medium">{cert.fileName}</td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {cert.createdAt ? new Date(cert.createdAt).toLocaleDateString('pt-BR') : '—'}
                                </td>
                                <td className="px-3 py-2">
                                  {cert.expiresAt ? (
                                    <span className={expired ? 'text-red-500 font-medium' : 'text-green-600 font-medium'}>
                                      {new Date(cert.expiresAt).toLocaleDateString('pt-BR')}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className="px-3 py-2">
                                  {cert.isActive
                                    ? <span className="text-green-600 font-medium">Sim</span>
                                    : <span className="text-muted-foreground">Não</span>}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button type="button" onClick={() => deleteCert(cert.id)}
                                    className="text-muted-foreground hover:text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Faturamento */}
              {configTab === 'faturamento' && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Configurações de faturamento (planos, cobrança, NPS) — disponível em breve.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Outros ─────────────────────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-5">
              <SectionHeader icon={FileText} title="Outros" />
              <div>
                <Label>Observações</Label>
                <textarea value={form.observacoes} onChange={e => sf('observacoes', e.target.value)} rows={3}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Observações internas sobre a empresa..." />
              </div>
            </CardContent>
          </Card>

          {/* ── Footer buttons ──────────────────────────────────────────────── */}
          <div className="flex justify-between pt-2">
            <Button type="button" variant="outline" onClick={() => window.history.back()}>Voltar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
