'use client';
import { apiFetch } from '@/lib/fetch';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronUp,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

// ─── Star Rating ──────────────────────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-6 h-6 transition-colors ${n <= value ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-300'}`}
        >
          <Star className="w-5 h-5 fill-current" />
        </button>
      ))}
    </div>
  );
}

// ─── Section accordion ───────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 text-left"
      >
        <span className="font-semibold text-slate-200 text-sm">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="p-4 space-y-4 bg-slate-900/30">{children}</div>}
    </div>
  );
}

// ─── ViaCEP fetch ─────────────────────────────────────────────────────────────
async function fetchViaCEP(cep: string) {
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) return null;
  const r = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
  const d = await r.json();
  if (d.erro) return null;
  return d;
}

// ─── Address row ──────────────────────────────────────────────────────────────
function AddressRow({
  addr,
  onSave,
  onDelete,
}: {
  addr: any;
  onSave: (data: any) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(!addr.id);
  const [form, setForm] = useState(addr);
  const [cepLoading, setCepLoading] = useState(false);

  const handleCEP = async (cep: string) => {
    setForm((f: any) => ({ ...f, cep }));
    if (cep.replace(/\D/g, '').length === 8) {
      setCepLoading(true);
      const d = await fetchViaCEP(cep);
      if (d) {
        setForm((f: any) => ({
          ...f,
          logradouro: d.logradouro,
          bairro: d.bairro,
          cidade: d.localidade,
          estado: d.uf,
        }));
      }
      setCepLoading(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2 p-3 bg-slate-800 rounded-lg border border-slate-700">
        <div className="text-sm text-slate-300">
          <div className="font-medium">{[form.logradouro, form.numero].filter(Boolean).join(', ')}</div>
          <div className="text-slate-500">{[form.bairro, form.cidade, form.estado, form.cep].filter(Boolean).join(' — ')}</div>
          {form.isPrimary && <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-blue-900/30 text-blue-300 mt-1">Principal</span>}
        </div>
        <div className="flex gap-1 shrink-0">
          <button type="button" onClick={() => setEditing(true)} className="p-1 rounded hover:bg-slate-700 text-slate-400"><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={onDelete} className="p-1 rounded hover:bg-red-900/40 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-slate-800 rounded-lg border border-blue-700/40 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="sm:col-span-1">
          <label className="text-xs text-slate-400 mb-1 block">CEP</label>
          <input
            className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-2 py-1.5 text-sm"
            value={form.cep || ''}
            onChange={(e) => handleCEP(e.target.value)}
            placeholder="00000-000"
          />
          {cepLoading && <span className="text-xs text-blue-400">Buscando...</span>}
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-slate-400 mb-1 block">Logradouro</label>
          <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-2 py-1.5 text-sm" value={form.logradouro || ''} onChange={(e) => setForm((f: any) => ({ ...f, logradouro: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Número</label>
          <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-2 py-1.5 text-sm" value={form.numero || ''} onChange={(e) => setForm((f: any) => ({ ...f, numero: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Complemento</label>
          <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-2 py-1.5 text-sm" value={form.complemento || ''} onChange={(e) => setForm((f: any) => ({ ...f, complemento: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Bairro</label>
          <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-2 py-1.5 text-sm" value={form.bairro || ''} onChange={(e) => setForm((f: any) => ({ ...f, bairro: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Cidade</label>
          <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-2 py-1.5 text-sm" value={form.cidade || ''} onChange={(e) => setForm((f: any) => ({ ...f, cidade: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Estado</label>
          <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-2 py-1.5 text-sm" value={form.estado || ''} onChange={(e) => setForm((f: any) => ({ ...f, estado: e.target.value }))} maxLength={2} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm((f: any) => ({ ...f, isPrimary: e.target.checked }))} className="accent-blue-500" />
          Endereço principal
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(false)} className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg">Cancelar</button>
          <button type="button" onClick={() => { onSave(form); setEditing(false); }} className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Contact row ──────────────────────────────────────────────────────────────
function ContactRow({ contact, onSave, onDelete }: { contact: any; onSave: (data: any) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(!contact.id);
  const [form, setForm] = useState(contact);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 p-3 bg-slate-800 rounded-lg border border-slate-700">
        <div className="text-sm">
          <div className="font-medium text-slate-200">{form.name}</div>
          <div className="text-slate-500 flex items-center gap-3 mt-0.5">
            {form.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{form.email}</span>}
            {form.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{form.phone}</span>}
          </div>
          {form.isBilling && <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-emerald-900/30 text-emerald-300 mt-1">Faturamento</span>}
        </div>
        <div className="flex gap-1 shrink-0">
          <button type="button" onClick={() => setEditing(true)} className="p-1 rounded hover:bg-slate-700 text-slate-400"><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={onDelete} className="p-1 rounded hover:bg-red-900/40 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-slate-800 rounded-lg border border-blue-700/40 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Nome *</label>
          <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-2 py-1.5 text-sm" value={form.name || ''} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} required />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Email</label>
          <input type="email" className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-2 py-1.5 text-sm" value={form.email || ''} onChange={(e) => setForm((f: any) => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Telefone</label>
          <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-2 py-1.5 text-sm" value={form.phone || ''} onChange={(e) => setForm((f: any) => ({ ...f, phone: e.target.value }))} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.isBilling} onChange={(e) => setForm((f: any) => ({ ...f, isBilling: e.target.checked }))} className="accent-emerald-500" />
          Contato de faturamento
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(false)} className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg">Cancelar</button>
          <button type="button" onClick={() => { if (!form.name?.trim()) return; onSave(form); setEditing(false); }} className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Client Form Dialog ───────────────────────────────────────────────────────
function ClientFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isNew = !initial?.id;

  const [form, setForm] = useState<any>({
    clientType: 'PJ',
    name: '',
    tradeName: '',
    cnpj: '',
    cpf: '',
    email: '',
    phone: '',
    countryOrigin: 'BR',
    stateRegistration: '',
    stateRegistrationUF: '',
    municipalRegistration: '',
    activityBranch: '',
    simplesNacional: false,
    ignoreIMNfse: false,
    rating: 3,
    billingDaysAntecipation: '',
    billingDay: '',
    nfseEmissionMode: 'company',
    portalSupportEnabled: true,
    portalFinanceEnabled: true,
    notes: '',
  });
  const [addresses, setAddresses] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const clientId = useRef<string | null>(initial?.id || null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({ ...initial });
      setAddresses(initial.addresses || []);
      setContacts(initial.contacts || []);
      clientId.current = initial.id;
    } else {
      setForm({ clientType: 'PJ', name: '', tradeName: '', cnpj: '', cpf: '', email: '', phone: '', countryOrigin: 'BR', stateRegistration: '', stateRegistrationUF: '', municipalRegistration: '', activityBranch: '', simplesNacional: false, ignoreIMNfse: false, rating: 3, billingDaysAntecipation: '', billingDay: '', nfseEmissionMode: 'company', portalSupportEnabled: true, portalFinanceEnabled: true, notes: '' });
      setAddresses([]);
      setContacts([]);
      clientId.current = null;
    }
  }, [open, initial]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSaveClient = async () => {
    if (!form.name?.trim()) { toast({ title: 'Nome obrigatório', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      let res: Response;
      if (isNew) {
        res = await apiFetch('/api/pj/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      } else {
        res = await apiFetch(`/api/pj/clients/${initial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      }
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const saved = await res.json();
      clientId.current = saved.id;
      toast({ title: isNew ? 'Cliente criado' : 'Cliente atualizado' });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleSaveAddress = async (addr: any, idx: number) => {
    const id = clientId.current;
    if (!id) { toast({ title: 'Salve os dados básicos primeiro', variant: 'destructive' }); return; }
    try {
      let r: Response;
      if (addr.id) {
        r = await apiFetch(`/api/pj/clients/${id}/addresses/${addr.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addr) });
      } else {
        r = await apiFetch(`/api/pj/clients/${id}/addresses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addr) });
      }
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro ao salvar'); }
      const saved = await r.json();
      setAddresses((prev) => prev.map((a, i) => (i === idx ? saved : a)));
      toast({ title: 'Endereço salvo' });
    } catch (e: any) { toast({ title: 'Erro ao salvar endereço', description: e.message, variant: 'destructive' }); }
  };

  const handleDeleteAddress = async (addr: any, idx: number) => {
    const id = clientId.current;
    if (addr.id && id) {
      await apiFetch(`/api/pj/clients/${id}/addresses/${addr.id}`, { method: 'DELETE' });
    }
    setAddresses((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveContact = async (contact: any, idx: number) => {
    const id = clientId.current;
    if (!id) { toast({ title: 'Salve os dados básicos primeiro', variant: 'destructive' }); return; }
    try {
      if (contact.id) {
        const r = await apiFetch(`/api/pj/clients/${id}/contacts/${contact.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact) });
        const saved = await r.json();
        setContacts((prev) => prev.map((c, i) => (i === idx ? saved : c)));
      } else {
        const r = await apiFetch(`/api/pj/clients/${id}/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact) });
        const saved = await r.json();
        setContacts((prev) => prev.map((c, i) => (i === idx ? saved : c)));
      }
    } catch { toast({ title: 'Erro ao salvar contato', variant: 'destructive' }); }
  };

  const handleDeleteContact = async (contact: any, idx: number) => {
    const id = clientId.current;
    if (contact.id && id) {
      await apiFetch(`/api/pj/clients/${id}/contacts/${contact.id}`, { method: 'DELETE' });
    }
    setContacts((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700 text-white p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-700">
          <DialogTitle className="text-white">{isNew ? 'Novo Cliente' : `Editar: ${form.name}`}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6 space-y-4 mt-4">

          {/* 1. Dados Básicos */}
          <Section title="1. Dados Básicos">
            <div className="flex gap-3 mb-3">
              {['PJ', 'PF'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('clientType', t)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${form.clientType === t ? 'bg-blue-700 border-blue-600 text-white' : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white'}`}
                >
                  {t === 'PJ' ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  {t === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nome / Razão Social *</label>
                <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.name} onChange={(e) => set('name', e.target.value)} required />
              </div>
              {form.clientType === 'PJ' ? (
                <>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Nome Fantasia</label>
                    <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.tradeName || ''} onChange={(e) => set('tradeName', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">CNPJ</label>
                    <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.cnpj || ''} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Inscrição Estadual</label>
                    <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.stateRegistration || ''} onChange={(e) => set('stateRegistration', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">UF IE</label>
                    <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.stateRegistrationUF || ''} onChange={(e) => set('stateRegistrationUF', e.target.value)} maxLength={2} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Inscrição Municipal</label>
                    <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.municipalRegistration || ''} onChange={(e) => set('municipalRegistration', e.target.value)} />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">CPF</label>
                  <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.cpf || ''} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Email</label>
                <input type="email" className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Telefone</label>
                <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Ramo de Atividade</label>
                <input className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.activityBranch || ''} onChange={(e) => set('activityBranch', e.target.value)} />
              </div>
            </div>
            {form.clientType === 'PJ' && (
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={form.simplesNacional} onChange={(e) => set('simplesNacional', e.target.checked)} className="accent-blue-500" />
                  Simples Nacional
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={form.ignoreIMNfse} onChange={(e) => set('ignoreIMNfse', e.target.checked)} className="accent-blue-500" />
                  Ignorar IM na NFS-e
                </label>
              </div>
            )}
          </Section>

          {/* 2. Endereços */}
          <Section title="2. Endereços" defaultOpen={false}>
            <div className="space-y-2">
              {addresses.map((addr, i) => (
                <AddressRow
                  key={addr.id || `new-${i}`}
                  addr={addr}
                  onSave={(d) => handleSaveAddress(d, i)}
                  onDelete={() => handleDeleteAddress(addr, i)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAddresses((prev) => [...prev, { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', isPrimary: prev.length === 0 }])}
              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
            >
              <Plus className="w-4 h-4" /> Adicionar endereço
            </button>
          </Section>

          {/* 3. Contatos */}
          <Section title="3. Contatos" defaultOpen={false}>
            <div className="space-y-2">
              {contacts.map((c, i) => (
                <ContactRow
                  key={c.id || `new-${i}`}
                  contact={c}
                  onSave={(d) => handleSaveContact(d, i)}
                  onDelete={() => handleDeleteContact(c, i)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setContacts((prev) => [...prev, { name: '', email: '', phone: '', isBilling: false }])}
              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
            >
              <Plus className="w-4 h-4" /> Adicionar contato
            </button>
          </Section>

          {/* 4. Faturamento */}
          <Section title="4. Faturamento" defaultOpen={false}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Antecipação (dias)</label>
                <input type="number" className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.billingDaysAntecipation || ''} onChange={(e) => set('billingDaysAntecipation', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Dia de Faturamento</label>
                <input type="number" min="1" max="31" className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.billingDay || ''} onChange={(e) => set('billingDay', e.target.value)} placeholder="1-31" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Emissão NFS-e</label>
                <select className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" value={form.nfseEmissionMode || 'company'} onChange={(e) => set('nfseEmissionMode', e.target.value)}>
                  <option value="company">Padrão da empresa</option>
                  <option value="on_billing">No faturamento</option>
                  <option value="on_payment">No pagamento</option>
                </select>
              </div>
            </div>
          </Section>

          {/* 5. Info Adicional */}
          <Section title="5. Informações Adicionais" defaultOpen={false}>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Classificação</label>
                <StarRating value={form.rating || 3} onChange={(v) => set('rating', v)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Observações</label>
                <textarea
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm min-h-[80px]"
                  value={form.notes || ''}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </div>
            </div>
          </Section>

          {/* 6. Portal do Cliente */}
          <Section title="6. Portal do Cliente" defaultOpen={false}>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.portalSupportEnabled} onChange={(e) => set('portalSupportEnabled', e.target.checked)} className="accent-blue-500" />
                Habilitar portal de suporte
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.portalFinanceEnabled} onChange={(e) => set('portalFinanceEnabled', e.target.checked)} className="accent-blue-500" />
                Habilitar portal financeiro
              </label>
            </div>
          </Section>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-700">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSaveClient} disabled={saving}>
              {saving ? 'Salvando...' : isNew ? 'Criar Cliente' : 'Salvar Alterações'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientesPage() {
  const { activeCompanyId } = usePJ();
  const { toast } = useToast();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [clientType, setClientType] = useState('');

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      if (clientType) p.set('clientType', clientType);
      const res = await apiFetch(`/api/pj/clients?${p}`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch { setClients([]); }
    setLoading(false);
  }, [activeCompanyId, search, clientType]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este cliente?')) return;
    await apiFetch(`/api/pj/clients?id=${id}`, { method: 'DELETE' });
    load();
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) { toast({ title: 'CSV vazio', variant: 'destructive' }); return; }
    const headers = lines[0].split(';').map((h) => h.trim().toLowerCase());
    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';').map((c) => c.trim());
      const row: any = {};
      headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
      const body = {
        name: row.nome || row.name || '',
        document: row.cnpj || row.cpf || row.documento || '',
        email: row.email || '',
        phone: row.telefone || row.phone || '',
        clientType: row.tipo === 'PF' ? 'PF' : 'PJ',
      };
      if (!body.name) continue;
      const res = await apiFetch('/api/pj/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) imported++;
    }
    toast({ title: `${imported} clientes importados` });
    load();
    e.target.value = '';
  };

  if (!activeCompanyId)
    return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-slate-400 text-sm mt-0.5">Cadastro de clientes PJ e PF</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
            <Button variant="outline" asChild>
              <span><Upload className="w-4 h-4 mr-2" />Importar CSV</span>
            </Button>
          </label>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" />Novo Cliente
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Buscar por nome, CNPJ, CPF ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
            <select
              value={clientType}
              onChange={(e) => setClientType(e.target.value)}
              className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos os tipos</option>
              <option value="PJ">Pessoa Jurídica</option>
              <option value="PF">Pessoa Física</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : clients.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="py-12 text-center text-slate-500">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum cliente cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60">
              <tr>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Nome</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden sm:table-cell">Tipo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">CNPJ/CPF</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Contato Faturamento</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Cidade/UF</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Rating</th>
                <th className="px-4 py-3 text-right text-slate-400 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {clients.map((c: any) => {
                const billingContact = c.contacts?.find((ct: any) => ct.isBilling);
                const hasBillingContact = !!billingContact;
                return (
                  <tr key={c.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${c.clientType === 'PF' ? 'bg-purple-900/40 text-purple-300' : 'bg-blue-900/40 text-blue-300'}`}>
                          {c.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-white">{c.name}</div>
                          {c.tradeName && <div className="text-xs text-slate-500">{c.tradeName}</div>}
                        </div>
                        {!hasBillingContact && (
                          <span title="Sem contato de faturamento"><AlertCircle className="w-4 h-4 text-orange-400 shrink-0" /></span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${c.clientType === 'PF' ? 'bg-purple-900/30 text-purple-300' : 'bg-blue-900/30 text-blue-300'}`}>
                        {c.clientType}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-400">
                      {c.cnpj || c.cpf || c.document || '—'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {billingContact ? (
                        <div className="text-sm">
                          <div className="text-slate-200">{billingContact.name}</div>
                          {billingContact.email && (
                            <div className="text-xs text-slate-500 flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {billingContact.email}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-orange-400 text-xs flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Sem contato
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-400 text-sm">
                      {[c.city, c.state].filter(Boolean).join('/') || '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-center">
                      <div className="flex justify-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={`w-3.5 h-3.5 ${n <= (c.rating || 3) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}`} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => { setEditing(c); setShowForm(true); }}
                          className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ClientFormDialog
        open={showForm}
        initial={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSaved={load}
      />
    </div>
  );
}
