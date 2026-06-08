'use client';
import { apiFetch } from '@/lib/fetch';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import {
  Users, UserPlus, Shield, Crown, Settings, Search,
  ChevronRight, UserCheck, Ban, Pencil,
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  master: 'Master', admin: 'Administrador', gestor: 'Gestor',
  operador: 'Operador', cliente: 'Cliente', user: 'Usuário',
};
const ALLOWED_ENVS_LABELS: Record<string, string> = {
  pf: 'Somente PF', pj: 'Somente PJ', both: 'PF + PJ',
};

export default function UsuariosPage() {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const isAdmin = ['admin', 'master'].includes((session?.user as any)?.role ?? '');

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'user', allowedEnvs: 'pf',
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch('/api/admin/users');
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'user', allowedEnvs: 'pf' });
      fetchUsers();
    } else {
      const data = await res.json();
      setCreateError(data.error || 'Erro ao criar usuário');
    }
    setCreating(false);
  };

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gerenciar Usuários</h1>
          <p className="text-muted-foreground mt-0.5">Cadastro, acesso e permissões</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-blue-500 hover:bg-blue-600 text-white self-start sm:self-auto">
          <UserPlus className="w-4 h-4 mr-2" /> Novo Usuário
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou e-mail…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* User list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum usuário encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => (
            <Card key={u.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/configuracoes/usuarios/${u.id}`)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 ${
                    u.role === 'master' ? 'bg-amber-500' : u.role === 'admin' ? 'bg-blue-500' : 'bg-gray-400'
                  }`}>
                    {u.name?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase() || 'U'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground truncate">{u.name || 'Sem nome'}</p>
                      <RoleBadge role={u.role} />
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                  </div>

                  {/* Env badges */}
                  <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                    {u.hasPF && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">PF</span>
                    )}
                    {u.hasPJ && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">PJ</span>
                    )}
                  </div>

                  {/* MFA */}
                  {u.totpEnabled && (
                    <span title="MFA ativo" className="hidden sm:block">
                      <Shield className="w-4 h-4 text-green-500 flex-shrink-0" />
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-blue-600"
                      onClick={e => { e.stopPropagation(); router.push(`/configuracoes/usuarios/${u.id}`); }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create user dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Novo Usuário
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {createError && (
              <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{createError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div className="col-span-2">
                <Label>E-mail *</Label>
                <Input type="email" required value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="usuario@email.com" />
              </div>
              <div className="col-span-2">
                <Label>Senha *</Label>
                <Input type="password" required value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Senha inicial" />
              </div>
              <div>
                <Label>Perfil</Label>
                <select
                  value={form.role}
                  onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background"
                >
                  {Object.entries(ROLE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Ambientes</Label>
                <select
                  value={form.allowedEnvs}
                  onChange={e => setForm(p => ({ ...p, allowedEnvs: e.target.value }))}
                  className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background"
                >
                  {Object.entries(ALLOWED_ENVS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="flex-1">Cancelar</Button>
              <Button type="submit" disabled={creating} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white">
                {creating ? 'Criando…' : 'Criar Usuário'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    master: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    gestor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    operador: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    cliente: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    user: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  };
  const label = ROLE_LABELS[role] || role;
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[role] || colors.user}`}>
      {label}
    </span>
  );
}
