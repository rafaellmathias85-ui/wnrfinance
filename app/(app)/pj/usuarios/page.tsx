'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  UserPlus, Crown, Shield, Eye, Calculator, BookOpen, Pencil,
  Lock, Unlock, BarChart2, ShoppingCart, Users, Headphones, GitBranch, Settings,
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

/** A user's module access map: moduleId → true (has access) | false (blocked) */
type ModuleAccess = Partial<Record<ModuleBadgeId, boolean>>;

/** Derive module access from flat permissions list */
function deriveModuleAccess(
  perms: Array<{ module: string; action: string; allowed: boolean }>,
): ModuleAccess {
  const access: ModuleAccess = {};
  for (const badge of MODULE_BADGES) {
    // A module is "accessible" if ANY feature within it has view or edit allowed
    const relevant = perms.filter(
      (p) => p.module.startsWith(`${badge.id}.`) && (p.action === 'view' || p.action === 'edit') && p.allowed,
    );
    access[badge.id] = relevant.length > 0;
  }
  return access;
}

// ─── Module badge chip ───────────────────────────────────────────────────────

function ModuleBadge({ id, label, Icon, hasAccess }: {
  id: ModuleBadgeId;
  label: string;
  Icon: React.ElementType;
  hasAccess: boolean | undefined;
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
      {unknown ? (
        <Lock className="w-2.5 h-2.5 opacity-30" />
      ) : hasAccess ? (
        <Unlock className="w-2.5 h-2.5" />
      ) : (
        <Lock className="w-2.5 h-2.5" />
      )}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const { activeCompanyId, activeCompanyRole } = usePJ();
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<{ id: string; name: string } | null>(null);
  /** Map of userId → their derived ModuleAccess */
  const [moduleAccessMap, setModuleAccessMap] = useState<Record<string, ModuleAccess>>({});

  const canManage = ['OWNER', 'ADMIN'].includes(activeCompanyRole || '');

  const fetchUsers = useCallback(async () => {
    if (!activeCompanyId) { setLoading(false); return; }
    setLoading(true);
    const res = await apiFetch(`/api/pj/companies/${activeCompanyId}/users`);
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
      fetchAllModuleAccess(data);
    }
    setLoading(false);
  }, [activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleInvite = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await apiFetch(`/api/pj/companies/${activeCompanyId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fd.get('email'), role: fd.get('role') }),
    });
    if (res.ok) {
      toast({ title: 'Usuário adicionado com sucesso' });
      setShowInvite(false);
      fetchUsers();
    } else {
      const err = await res.json();
      toast({ title: 'Erro', description: err.error, variant: 'destructive' });
    }
  };

  const openPermissions = (u: any) => {
    setPermissionsUser({ id: u.id, name: u.name || u.email });
  };

  const handleModalClose = () => {
    setPermissionsUser(null);
    // Re-fetch module access for the updated user
    if (permissionsUser) {
      apiFetch(`/api/pj/permissions?userId=${permissionsUser.id}`)
        .then((r) => r.ok ? r.json() : { permissions: [] })
        .then((d) => {
          setModuleAccessMap((prev) => ({
            ...prev,
            [permissionsUser.id]: deriveModuleAccess(d.permissions || []),
          }));
        })
        .catch(() => {});
    }
  };

  if (!activeCompanyId) {
    return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Usuários da Empresa</h1>
          <p className="text-muted-foreground">Gerencie acesso e permissões</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowInvite(!showInvite)}>
            <UserPlus className="w-4 h-4 mr-2" />Convidar Usuário
          </Button>
        )}
      </div>

      {showInvite && (
        <Card className="border-primary">
          <CardHeader><CardTitle className="text-base">Convidar Usuário</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label>Email do usuário *</Label>
                <Input name="email" type="email" required placeholder="usuario@email.com" />
              </div>
              <div>
                <Label>Cargo</Label>
                <select name="role" className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                  <option value="VIEWER">Visualizador</option>
                  <option value="FINANCE">Financeiro</option>
                  <option value="ACCOUNTANT">Contador</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>
              <Button type="submit">Convidar</Button>
            </form>
            <p className="text-xs text-muted-foreground mt-2">O usuário precisa ter uma conta no WNR Finance.</p>
          </CardContent>
        </Card>
      )}

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
            return (
              <Card key={u.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4">
                  {/* User identity row */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
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

                  {/* Module access badges */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {MODULE_BADGES.map(({ id, label, Icon }) => (
                      <ModuleBadge
                        key={id}
                        id={id}
                        label={label}
                        Icon={Icon}
                        hasAccess={modAccess?.[id]}
                      />
                    ))}
                  </div>

                  {/* Actions row */}
                  {canManage && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-end">
                      <button
                        onClick={() => openPermissions(u)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/50 rounded-md px-2.5 py-1.5 transition-colors"
                        title="Editar permissões"
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

      {permissionsUser && (
        <UserPermissionsModal
          userId={permissionsUser.id}
          userName={permissionsUser.name}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
