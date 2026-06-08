'use client';
import { apiFetch } from '@/lib/fetch';
import { usePJ } from '@/lib/pj-context';
import { useEffect, useState } from 'react';
import { Building2, History, Plus, Save, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';


export default function EmpresaPage() {
  const { activeCompanyId, companies, switchCompany } = usePJ();
  const { toast } = useToast();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeLogs, setUpgradeLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    if (!activeCompanyId) { setLoading(false); return; }
    apiFetch(`/api/pj/companies/${activeCompanyId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setCompany)
      .catch(() => setCompany(null))
      .finally(() => setLoading(false));
  }, [activeCompanyId]);

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get('name'),
      tradeName: fd.get('tradeName'),
      address: fd.get('address'),
      phone: fd.get('phone'),
      email: fd.get('email'),
    };
    const res = await apiFetch(`/api/pj/companies/${activeCompanyId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) {
      toast({ title: 'Empresa atualizada' });
      setCompany(await res.json());
    } else {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { name: fd.get('name'), cnpj: fd.get('cnpj'), tradeName: fd.get('tradeName'), phone: fd.get('phone'), email: fd.get('email'), address: fd.get('address') };
    const res = await apiFetch('/api/pj/companies', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) {
      const newCompany = await res.json();
      toast({ title: 'Empresa criada com sucesso!' });
      setShowNew(false);
      await switchCompany(newCompany.id);
      window.location.reload();
    } else {
      const err = await res.json();
      toast({ title: 'Erro', description: err.error, variant: 'destructive' });
    }
  };

  if (!activeCompanyId && !showNew) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Empresa</h1>
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma empresa cadastrada. Crie sua primeira empresa para começar.</p>
            <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-2" />Cadastrar Empresa</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Configurações da Empresa</h1>
        <Button variant="outline" onClick={() => setShowNew(!showNew)}><Plus className="w-4 h-4 mr-2" />Nova Empresa</Button>
      </div>

      {showNew && (
        <Card className="border-primary">
          <CardHeader><CardTitle>Cadastrar Nova Empresa</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Razão Social *</Label><Input name="name" required /></div>
              <div><Label>CNPJ *</Label><Input name="cnpj" required placeholder="00.000.000/0000-00" /></div>
              <div><Label>Nome Fantasia</Label><Input name="tradeName" /></div>
              <div><Label>Telefone</Label><Input name="phone" /></div>
              <div><Label>Email</Label><Input name="email" type="email" /></div>
              <div><Label>Endereço</Label><Input name="address" /></div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
                <Button type="submit">Criar Empresa</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeCompanyId && company && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" />{company.name}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleUpdate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Razão Social</Label><Input name="name" defaultValue={company.name} required /></div>
              <div><Label>CNPJ</Label><Input value={company.cnpj} disabled className="bg-muted" /></div>
              <div><Label>Nome Fantasia</Label><Input name="tradeName" defaultValue={company.tradeName || ''} /></div>
              <div><Label>Telefone</Label><Input name="phone" defaultValue={company.phone || ''} /></div>
              <div><Label>Email</Label><Input name="email" type="email" defaultValue={company.email || ''} /></div>
              <div><Label>Endereço</Label><Input name="address" defaultValue={company.address || ''} /></div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar Alterações'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* PJ Full Upgrade Section */}
      {activeCompanyId && company && (
        <Card className={company.isPjFull ? 'border-green-200 dark:border-green-800' : 'border-amber-200 dark:border-amber-800'}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className={`w-5 h-5 ${company.isPjFull ? 'text-green-500' : 'text-amber-500'}`} />
                PJ Full
              </div>
              {company.isPjFull && (
                <span className="text-xs px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                  {company.pjFullPlan || 'Ativo'}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {company.isPjFull ? (
              <>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/10">
                  <Shield className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-400">PJ Full Ativo</p>
                    <p className="text-sm text-green-700 dark:text-green-500 mt-1">
                      Sua empresa tem acesso a funcionalidades avançadas: NF-e, boletos integrados, conexões bancárias via API, gestão de certificados e mais.
                    </p>
                    {company.pjFullActivatedAt && (
                      <p className="text-xs text-green-600 dark:text-green-500 mt-2">
                        Ativado em {new Date(company.pjFullActivatedAt).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const logs = await apiFetch(`/api/pj/companies/${activeCompanyId}/upgrade`).then(r => r.json());
                      setUpgradeLogs(logs);
                      setShowLogs(!showLogs);
                    }}
                    className="gap-1"
                  >
                    <History className="w-4 h-4" />
                    Histórico
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 gap-1"
                    disabled={upgrading}
                    onClick={async () => {
                      if (!confirm('Tem certeza que deseja desativar o PJ Full?')) return;
                      setUpgrading(true);
                      const res = await apiFetch(`/api/pj/companies/${activeCompanyId}/upgrade`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ activate: false, reason: 'Desativação manual pelo proprietário' }),
                      });
                      if (res.ok) {
                        setCompany(await res.json());
                        toast({ title: 'PJ Full desativado' });
                      }
                      setUpgrading(false);
                    }}
                  >
                    Desativar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/10">
                  <Zap className="w-5 h-5 text-amber-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-400">Upgrade disponível: PJ Full</p>
                    <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
                      Desbloqueie funcionalidades avançadas para PME/ERP: emissão de NF-e, boletos integrados, conexões bancárias via Open Finance, gestão de certificados digitais, e mais.
                    </p>
                  </div>
                </div>
                <Button
                  disabled={upgrading}
                  onClick={async () => {
                    if (!confirm('Ativar PJ Full para esta empresa? Isso habilitará todas as funcionalidades avançadas.')) return;
                    setUpgrading(true);
                    const res = await apiFetch(`/api/pj/companies/${activeCompanyId}/upgrade`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ activate: true, plan: 'PJ_FULL_PRO', reason: 'Ativação manual pelo proprietário' }),
                    });
                    if (res.ok) {
                      setCompany(await res.json());
                      toast({ title: 'PJ Full ativado com sucesso!' });
                    }
                    setUpgrading(false);
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                >
                  <Zap className="w-4 h-4" />
                  {upgrading ? 'Ativando...' : 'Ativar PJ Full'}
                </Button>
              </>
            )}

            {/* Upgrade Logs */}
            {showLogs && upgradeLogs.length > 0 && (
              <div className="space-y-2 mt-4">
                <p className="text-sm font-medium text-muted-foreground">Histórico de alterações</p>
                {upgradeLogs.map((log: any) => (
                  <div key={log.id} className="p-3 rounded-lg bg-muted/50 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{log.reason || 'Alteração'}</span>
                      <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
