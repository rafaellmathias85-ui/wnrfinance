'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  UserPlus, Crown, Shield, Eye, EyeOff, Calculator, BookOpen, Pencil,
  Lock, Unlock, BarChart2, ShoppingCart, Users, Headphones, GitBranch, Settings,
  UserCog, Loader2, KeyRound, UserX, UserCheck, ShieldAlert, ShieldCheck,
  ShieldOff, ChevronDown,
} from 'lucide-react';
import { usePJ } from '@/lib/pj-context';
import { apiFetch } from '@/lib/fetch';
import { useToast } from '@/hooks/use-toast';
import { UserPermissionsModal } from '@/components/pj/UserPermissionsModal';

// ─── Role meta ───────────────────────────────────────────────────────────────

const roleLabels: Record<string, string> = {
  OWNER: 'Proprietário', ADMIN: 'Administrador', FINANCE: 'Financeiro',
  ACCOUNTANT: 'Contador', VIEWER: 'Visualizador',
};
const roleIcons: Record<string, React.ElementType> = {
  OWNER: Crown, ADMIN: Shield, FINANCE: Calculator, ACCOUNTANT: BookOpen, VIEWER: Eye,
};
const roleColors: Record<string, string> = {
  OWNER: 'text-amber-500', ADMIN: 'text-blue-500', FINANCE: 'text-green-500',
  ACCOUNTANT: 'text-purple-500', VIEWER: 'text-gray-500',
};

// ─── Module badge definitions ────────────────────────────────────────────────

const MODULE_BADGES = [
  { id: 'financeiro',    label: 'Financeiro',    Icon: BarChart2 },
  { id: 'estoque',       label: 'Estoque',        Icon: ShoppingCart },
  { id: 'vendas',        label: 'Vendas',         Icon: Users },
  { id: 'crm',           label: 'CRM',            Icon: Users },
  { id: 'servicedesk',   label: 'ServiceDesk',    Icon: Headphones },
  { id: 'bpm',           label: 'BPM',            Icon: GitBranch },
  { id: 'configuracoes', label: 'Configurações',  Icon: Settings },
] as const;

type ModuleBadgeId = (typeof MODULE_BADGES)[number]['id'];
type ModuleAccess = Partial<Record<ModuleBadgeId, boolean>>;

function deriveModuleAccess(
  perms: Array<{ module: string; action: string; allowed: boolean }>,
): ModuleAccess {
  const access: ModuleAccess = {};
  for (const badge of MODULE_BADGES) {
    const relevant = perms.filter(
      (p) => p.module.startsWith(`${badge.id}.`) && (p.action === 'view' || p.action === 'edit') && p.allowed,
    );
    access[badge.id] = relevant.length > 0;
  }
  return access;
}

function ModuleBadge({ label, Icon, hasAccess }: {
  id: ModuleBadgeId; label: string; Icon: React.ElementType; hasAccess: boolean | undefined;
}) {
  const unknown = hasAccess === undefined;
  return (
    <span
      title={`${label}: ${unknown ? 'carregando' : hasAccess ? 'com acesso' : 'bloqueado'}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
        unknown
          ? 'border-border text-muted-foreground/50'
          : hasAccess
          ? 'border-green-600/40 bg-green-600/10 text-green-600'
          : 'border-red-500/30 bg-red-500/10 text-red-500'
      }`}
    >
      <Icon className="w-3 h-3" />
      {unknown ? <Lock className="w-2.5 h-2.5 opacity-30" /> : hasAccess ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
    </span>
  );
}

// ─── Action confirmation config ───────────────────────────────────────────────

type ActionType = 'reset-password' | 'block' | 'unblock' | 'force-mfa' | 'reset-mfa';

const ACTION_META: Record<ActionType, {
  title: string;
  description: (name: string) => string;
  confirmLabel: string;
  variant: 'default' | 'destructive';
}> = {
  'reset-password': {
    title: 'Redefinir Senha',
    description: (name) => `Será enviado um e-mail de redefinição de senha para ${name}. O link expira em 1 hora.`,
    confirmLabel: 'Enviar E-mail',
    variant: 'default',
  },
  'block': {
    title: 'Bloquear Usuário',
    description: (name) => `${name} não conseguirá mais fazer login enquanto estiver bloqueado.`,
    confirmLabel: 'Bloquear',
    variant: 'destructive',
  },
  'unblock': {
    title: 'Desbloquear Usuário',
    description: (name) => `${name} voltará a conseguir fazer login normalmente.`,
    confirmLabel: 'Desbloquear',
    variant: 'default',
  },
  'force-mfa': {
    title: 'Obrigar Autenticação de 2 Fatores',
    description: (name) => `${name} será obrigado a configurar MFA no próximo acesso.`,
    confirmLabel: 'Obrigar MFA',
    variant: 'default',
  },
  'reset-mfa': {
    title: 'Revogar MFA',
    description: (name) => `O MFA de ${name} será desativado e o segredo removido. O usuário precisará reconfigurar.`,
    confirmLabel: 'Revogar MFA',
    variant: 'destructive',
  },
};

// ─── Create User Dialog ───────────────────────────────────────────────────────

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onCreated: () => void;
}

function CreateUserDialog({ open, onOpenChange, companyId, onCreated }: CreateUserDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    role: 'VIEWER', hasPF: false, hasPJ: true,
  });

  useEffect(() => {
    if (!open) {
      setForm({ name: '', email: '', password: '', confirmPassword: '', role: 'VIEWER', hasPF: false, hasPJ: true });
      setShowPwd(false);
      setLoading(false);
    }
  }, [open]);

  const set = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const password = form.password;

    if (!name || !email || !password) {
      const msg = 'Preencha nome, e-mail e senha.';
      toast({ title: msg, variant: 'destructive' });
      window.alert(msg);
      return;
    }
    if (password !== form.confirmPassword) {
      const msg = 'As senhas não conferem.';
      toast({ title: msg, variant: 'destructive' });
      window.alert(msg);
      return;
    }
    if (password.length < 6) {
      const msg = 'A senha deve ter pelo menos 6 caracteres.';
      toast({ title: msg, variant: 'destructive' });
      window.alert(msg);
      return;
    }
    if (!form.hasPF && !form.hasPJ) {
      const msg = 'Selecione ao menos um tipo de acesso (PF ou PJ).';
      toast({ title: msg, variant: 'destructive' });
      window.alert(msg);
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(`/api/pj/companies/${companyId}/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role: form.role, hasPF: form.hasPF, hasPJ: form.hasPJ }),
      });

      let data: any = {};
      try { data = await res.json(); } catch { /* noop */ }

      if (res.ok) {
        toast({ title: `Usuário ${data.name || name} criado com sucesso!` });
        onOpenChange(false);
        onCreated();
      } else {
        const msg = data.error || `Erro HTTP ${res.status}`;
        toast({ title: 'Erro ao criar usuário', description: msg, variant: 'destructive' });
        window.alert(`Erro ao criar usuário: ${msg}`);
      }
    } catch (err: any) {
      const msg = err?.message || 'Erro de rede';
      toast({ title: 'Erro ao criar usuário', description: msg, variant: 'destructive' });
      window.alert(`Erro de rede: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5" /> Criar Novo Usuário
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="cu-name">Nome completo *</Label>
              <Input
                id="cu-name"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="João da Silva"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cu-email">E-mail *</Label>
              <Input
                id="cu-email"
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="joao@empresa.com.br"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="cu-password">Senha * (mín. 6 caracteres)</Label>
              <div className="relative">
                <Input
                  id="cu-password"
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cu-confirm">Confirmar Senha *</Label>
              <div className="relative">
                <Input
                  id="cu-confirm"
                  type={showPwd ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={e => set('confirmPassword', e.target.value)}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="cu-role">Cargo na empresa (PJ)</Label>
              <select
                id="cu-role"
                value={form.role}
                onChange={e => set('role', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="VIEWER">Visualizador</option>
                <option value="FINANCE">Financeiro</option>
                <option value="ACCOUNTANT">Contador</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="mb-2 block">Tipo de acesso *</Label>
              <div className="flex gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.hasPF}
                    onChange={e => set('hasPF', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm font-medium">PF</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.hasPJ}
                    onChange={e => set('hasPJ', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm font-medium">PJ</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Módulos que o usuário poderá acessar após login.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={loading} className="gap-2 min-w-[140px]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
            {loading ? 'Criando...' : 'Criar Usuário'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MFA Dropdown ─────────────────────────────────────────────────────────────

function MfaDropdown({
  user,
  onAction,
}: {
  user: any;
  onAction: (action: ActionType, user: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hasMfa = user.totpEnabled;
  const mfaRequired = user.mfaRequired;

  return (
    <div ref={ref} className="relative">
      <button
        title="Opções de MFA"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-0.5 p-1.5 rounded-md border transition-colors ${
          mfaRequired && !hasMfa
            ? 'border-orange-500/40 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20'
            : hasMfa
            ? 'border-green-600/40 bg-green-600/10 text-green-600 hover:bg-green-600/20'
            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        {mfaRequired && !hasMfa ? (
          <ShieldAlert className="w-3.5 h-3.5" />
        ) : hasMfa ? (
          <ShieldCheck className="w-3.5 h-3.5" />
        ) : (
          <ShieldOff className="w-3.5 h-3.5" />
        )}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 z-50 min-w-[160px] bg-popover border border-border rounded-lg shadow-lg py-1 text-sm">
          <button
            onClick={() => { setOpen(false); onAction('force-mfa', user); }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-foreground transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-orange-500" />
            Obrigar MFA
          </button>
          <button
            onClick={() => { setOpen(false); onAction('reset-mfa', user); }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-red-500 dark:text-red-400 transition-colors"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            Revogar MFA
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const { activeCompanyId, activeCompanyRole, session: pjSession } = usePJ() as any;
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<{ id: string; name: string } | null>(null);
  const [moduleAccessMap, setModuleAccessMap] = useState<Record<string, ModuleAccess>>({});

  // Action confirmation
  const [confirmAction, setConfirmAction] = useState<{ type: ActionType; user: any } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('VIEWER');
  const [inviteLoading, setInviteLoading] = useState(false);

  const canManage = ['OWNER', 'ADMIN'].includes(activeCompanyRole || '');
  const currentUserId = (pjSession as any)?.user?.id ?? null;

  const fetchAllModuleAccess = useCallback(async (userList: any[]) => {
    const results: Record<string, ModuleAccess> = {};
    await Promise.all(
      userList.map(async (u: any) => {
        try {
          const r = await apiFetch(`/api/pj/permissions?userId=${u.id}`);
          if (r.ok) {
            const d = await r.json();
            results[u.id] = deriveModuleAccess(d.permissions || []);
          } else {
            results[u.id] = {};
          }
        } catch {
          results[u.id] = {};
        }
      }),
    );
    setModuleAccessMap(results);
  }, []);

  const fetchUsers = useCallback(async () => {
    if (!activeCompanyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/pj/companies/${activeCompanyId}/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        fetchAllModuleAccess(data);
      }
    } catch { /* noop */ }
    setLoading(false);
  }, [activeCompanyId, fetchAllModuleAccess]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteRole) {
      toast({ title: 'Preencha o e-mail', variant: 'destructive' }); return;
    }
    setInviteLoading(true);
    try {
      const res = await apiFetch(`/api/pj/companies/${activeCompanyId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (res.ok) {
        toast({ title: 'Usuário adicionado com sucesso' });
        setShowInvite(false);
        setInviteEmail('');
        fetchUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Erro', description: err.error || 'Verifique o e-mail', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro de rede', description: err?.message, variant: 'destructive' });
    } finally {
      setInviteLoading(false);
    }
  };

  const openPermissions = (u: any) => {
    setPermissionsUser({ id: u.id, name: u.name || u.email });
  };

  const handleModalClose = () => {
    const uid = permissionsUser?.id;
    setPermissionsUser(null);
    if (uid) {
      apiFetch(`/api/pj/permissions?userId=${uid}`)
        .then((r) => r.ok ? r.json() : { permissions: [] })
        .then((d) => {
          setModuleAccessMap((prev) => ({
            ...prev,
            [uid]: deriveModuleAccess(d.permissions || []),
          }));
        })
        .catch(() => {});
    }
  };

  const executeAction = async () => {
    if (!confirmAction || !activeCompanyId) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(
        `/api/pj/companies/${activeCompanyId}/users/${confirmAction.user.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: confirmAction.type }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const meta = ACTION_META[confirmAction.type];
        toast({ title: data.message || meta.confirmLabel + ' realizado com sucesso' });
        setConfirmAction(null);
        fetchUsers();
      } else {
        toast({ title: 'Erro', description: data.error || `HTTP ${res.status}`, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro de rede', description: err?.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const requestAction = (type: ActionType, user: any) => {
    setConfirmAction({ type, user });
  };

  if (!activeCompanyId) {
    return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Usuários da Empresa</h1>
          <p className="text-muted-foreground">Gerencie acesso e permissões</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
              <UserCog className="w-4 h-4 mr-2" /> Criar Usuário
            </Button>
            <Button onClick={() => setShowInvite(v => !v)}>
              <UserPlus className="w-4 h-4 mr-2" /> Convidar Usuário
            </Button>
          </div>
        )}
      </div>

      {/* Create user dialog */}
      {activeCompanyId && (
        <CreateUserDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          companyId={activeCompanyId}
          onCreated={fetchUsers}
        />
      )}

      {/* Invite form */}
      {showInvite && (
        <Card className="border-primary">
          <CardContent className="pt-4">
            <p className="text-sm font-medium mb-3">Convidar usuário existente</p>
            <form onSubmit={handleInvite} className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px] space-y-1">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="usuario@email.com"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Cargo</Label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                >
                  <option value="VIEWER">Visualizador</option>
                  <option value="FINANCE">Financeiro</option>
                  <option value="ACCOUNTANT">Contador</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>
              <Button type="submit" disabled={inviteLoading} className="gap-2">
                {inviteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Convidar
              </Button>
            </form>
            <p className="text-xs text-muted-foreground mt-2">O usuário precisa ter uma conta no WNR Finance.</p>
          </CardContent>
        </Card>
      )}

      {/* User list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum usuário encontrado nesta empresa.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u: any) => {
            const RoleIcon = roleIcons[u.role] || Eye;
            const modAccess = moduleAccessMap[u.id];
            const isSelf = u.id === currentUserId;
            const canActOnUser = canManage && !isSelf;

            return (
              <Card
                key={u.id}
                className={`hover:shadow-md transition-shadow ${u.isBlocked ? 'border-red-500/40 opacity-80' : ''}`}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${
                      u.isBlocked ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'
                    }`}>
                      {u.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{u.name || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <div className={`flex items-center gap-1 ${roleColors[u.role] || ''} shrink-0`}>
                      <RoleIcon className="w-4 h-4" />
                      <span className="text-xs font-medium">{roleLabels[u.role] || u.role}</span>
                    </div>
                  </div>

                  {/* Status badges */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {u.isBlocked && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-red-500/40 bg-red-500/10 text-red-500">
                        <Lock className="w-3 h-3" /> Bloqueado
                      </span>
                    )}
                    {u.mfaRequired && !u.totpEnabled && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-orange-500/40 bg-orange-500/10 text-orange-500">
                        <ShieldAlert className="w-3 h-3" /> MFA Pendente
                      </span>
                    )}
                    {u.totpEnabled && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-green-600/40 bg-green-600/10 text-green-600">
                        <ShieldCheck className="w-3 h-3" /> MFA Ativo
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {MODULE_BADGES.map(({ id, label, Icon }) => (
                      <ModuleBadge key={id} id={id} label={label} Icon={Icon} hasAccess={modAccess?.[id]} />
                    ))}
                  </div>

                  {canManage && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                      {/* Admin actions — not shown for self */}
                      {canActOnUser ? (
                        <div className="flex items-center gap-1">
                          {/* Reset senha */}
                          <button
                            title="Redefinir Senha"
                            onClick={() => requestAction('reset-password', u)}
                            className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Bloquear / Desbloquear */}
                          <button
                            title={u.isBlocked ? 'Desbloquear Usuário' : 'Bloquear Usuário'}
                            onClick={() => requestAction(u.isBlocked ? 'unblock' : 'block', u)}
                            className={`p-1.5 rounded-md border transition-colors ${
                              u.isBlocked
                                ? 'border-green-600/40 bg-green-600/10 text-green-600 hover:bg-green-600/20'
                                : 'border-border text-muted-foreground hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/40'
                            }`}
                          >
                            {u.isBlocked ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                          </button>

                          {/* MFA dropdown */}
                          <MfaDropdown user={u} onAction={requestAction} />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 italic">Você</span>
                      )}

                      {/* Permissões */}
                      <button
                        onClick={() => openPermissions(u)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/50 rounded-md px-2.5 py-1.5 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Permissões
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Permissions modal */}
      {permissionsUser && (
        <UserPermissionsModal
          userId={permissionsUser.id}
          userName={permissionsUser.name}
          onClose={handleModalClose}
        />
      )}

      {/* Confirmation dialog */}
      {confirmAction && (() => {
        const meta = ACTION_META[confirmAction.type];
        const userName = confirmAction.user.name || confirmAction.user.email;
        return (
          <Dialog open onOpenChange={() => !actionLoading && setConfirmAction(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{meta.title}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{meta.description(userName)}</p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={actionLoading}>
                  Cancelar
                </Button>
                <Button
                  variant={meta.variant}
                  onClick={executeAction}
                  disabled={actionLoading}
                  className="gap-2 min-w-[120px]"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {actionLoading ? 'Aguarde...' : meta.confirmLabel}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
