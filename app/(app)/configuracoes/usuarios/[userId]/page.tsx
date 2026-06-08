'use client';

import { apiFetch } from '@/lib/fetch';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Loader2, Save, ShieldOff, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AdminUserDetail {
  id: string;
  name: string | null;
  email: string;
  role: string;
  allowedEnvs: string;
  hasPF: boolean;
  hasPJ: boolean;
  defaultEnv: string;
  totpEnabled: boolean;
  subscription?: { plan: string; status: string } | null;
  companies?: Array<{
    id: string;
    role: string;
    company: { id: string; name: string; tradeName: string | null; cnpj: string };
  }>;
}

const ROLE_OPTIONS = [
  { value: 'user', label: 'Usuario' },
  { value: 'admin', label: 'Administrador' },
  { value: 'master', label: 'Master' },
];

const ENV_OPTIONS = [
  { value: 'pf', label: 'Somente PF' },
  { value: 'pj', label: 'Somente PJ' },
  { value: 'both', label: 'PF + PJ' },
];

const PLAN_OPTIONS = ['free', 'pro', 'premium'];
const STATUS_OPTIONS = ['active', 'trialing', 'past_due', 'canceled'];

export default function UsuarioDetalhePage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = params?.userId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'user',
    allowedEnvs: 'pf',
    defaultEnv: 'pf',
    password: '',
    plan: 'free',
    status: 'active',
    resetMfa: false,
  });

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/users?id=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar usuario');
      setUser(data);
      setForm({
        name: data.name || '',
        email: data.email || '',
        role: data.role || 'user',
        allowedEnvs: data.allowedEnvs || 'pf',
        defaultEnv: data.defaultEnv || 'pf',
        password: '',
        plan: data.subscription?.plan || 'free',
        status: data.subscription?.status || 'active',
        resetMfa: false,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao carregar usuario');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userId,
          name: form.name,
          email: form.email,
          role: form.role,
          allowedEnvs: form.allowedEnvs,
          defaultEnv: form.defaultEnv,
          password: form.password || undefined,
          totpEnabled: form.resetMfa ? false : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar usuario');

      const subRes = await apiFetch('/api/admin/users/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, plan: form.plan, status: form.status }),
      });
      const subData = await subRes.json().catch(() => ({}));
      if (!subRes.ok) throw new Error(subData.error || 'Usuario salvo, mas plano nao foi atualizado');

      toast.success('Usuario atualizado');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar usuario');
    } finally {
      setSaving(false);
    }
  };

  const validDefaultEnv = form.allowedEnvs === 'both'
    ? ['pf', 'pj']
    : [form.allowedEnvs];

  useEffect(() => {
    if (!validDefaultEnv.includes(form.defaultEnv)) {
      setForm(prev => ({ ...prev, defaultEnv: validDefaultEnv[0] || 'pf' }));
    }
  }, [form.allowedEnvs]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Usuario nao encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/configuracoes/usuarios')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UserCog className="h-6 w-6 text-primary" /> Editar Usuario
            </h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadastro e Acesso</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <Label>Perfil</Label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Ambientes</Label>
            <select value={form.allowedEnvs} onChange={e => setForm(p => ({ ...p, allowedEnvs: e.target.value }))} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
              {ENV_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Ambiente padrao</Label>
            <select value={form.defaultEnv} onChange={e => setForm(p => ({ ...p, defaultEnv: e.target.value }))} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
              {validDefaultEnv.includes('pf') && <option value="pf">PF</option>}
              {validDefaultEnv.includes('pj') && <option value="pj">PJ</option>}
            </select>
          </div>
          <div>
            <Label>Nova senha</Label>
            <Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Deixe vazio para manter" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plano e Seguranca</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Plano</Label>
            <select value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value }))} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
              {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <Label>Status</Label>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <label className="md:col-span-2 flex items-center gap-3 rounded-lg border border-input p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.resetMfa}
              onChange={e => setForm(p => ({ ...p, resetMfa: e.target.checked }))}
              disabled={!user.totpEnabled}
            />
            <ShieldOff className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              Resetar MFA/2FA deste usuario {user.totpEnabled ? '' : '(2FA nao esta ativo)'}
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Empresas vinculadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {user.companies?.length ? (
            <div className="space-y-2">
              {user.companies.map(uc => (
                <div key={uc.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                  <div>
                    <p className="font-medium">{uc.company.tradeName || uc.company.name}</p>
                    <p className="text-muted-foreground">{uc.company.cnpj}</p>
                  </div>
                  <span className="rounded bg-muted px-2 py-1 text-xs font-medium">{uc.role}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma empresa vinculada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
