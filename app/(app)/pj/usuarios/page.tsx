'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Crown, Shield, Eye, Calculator, BookOpen, KeyRound } from 'lucide-react';
import { usePJ } from '@/lib/pj-context';
import { apiFetch } from '@/lib/fetch';
import { useToast } from '@/hooks/use-toast';
import { UserPermissionsModal } from '@/components/pj/UserPermissionsModal';

const roleLabels: Record<string, string> = {
  OWNER: 'Proprietário', ADMIN: 'Administrador', FINANCE: 'Financeiro', ACCOUNTANT: 'Contador', VIEWER: 'Visualizador',
};
const roleIcons: Record<string, any> = {
  OWNER: Crown, ADMIN: Shield, FINANCE: Calculator, ACCOUNTANT: BookOpen, VIEWER: Eye,
};
const roleColors: Record<string, string> = {
  OWNER: 'text-amber-500', ADMIN: 'text-blue-500', FINANCE: 'text-green-500', ACCOUNTANT: 'text-purple-500', VIEWER: 'text-gray-500',
};

export default function UsuariosPage() {
  const { activeCompanyId, activeCompanyRole } = usePJ();
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<{ id: string; name: string } | null>(null);

  const canManage = ['OWNER', 'ADMIN'].includes(activeCompanyRole || '');

  const fetchUsers = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    const res = await apiFetch(`/api/pj/companies/${activeCompanyId}/users`);
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, [activeCompanyId]);

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

  if (!activeCompanyId) return <div className="text-center py-12 text-muted-foreground">Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Usuários da Empresa</h1>
          <p className="text-muted-foreground">Gerencie acesso e permissões</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowInvite(!showInvite)}><UserPlus className="w-4 h-4 mr-2" />Convidar Usuário</Button>
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
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u: any) => {
            const RoleIcon = roleIcons[u.role] || Eye;
            return (
              <Card key={u.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {u.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{u.name || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <div className={`flex items-center gap-1 ${roleColors[u.role] || ''}`}>
                      <RoleIcon className="w-4 h-4" />
                      <span className="text-xs font-medium">{roleLabels[u.role] || u.role}</span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <button
                        onClick={() => setPermissionsUser({ id: u.id, name: u.name || u.email })}
                        className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Gerenciar Permissões
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
          onClose={() => setPermissionsUser(null)}
        />
      )}
    </div>
  );
}
