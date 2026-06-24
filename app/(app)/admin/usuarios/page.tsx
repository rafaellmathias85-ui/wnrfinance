'use client';
import { apiFetch } from '@/lib/fetch';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Plus, RefreshCw, Search, Shield, Trash2, UserCog, X } from 'lucide-react';
import { PageHeader } from '@/components/enterprise';
import { Button } from '@/components/ui/button';


interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  allowedEnvs: string;
  hasPF: boolean;
  hasPJ: boolean;
  createdAt: string;
  totpEnabled: boolean;
  subscription?: { plan: string; status: string } | null;
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700 dark:bg-card dark:text-muted-foreground',
  pro: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  premium: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

const ROLE_LABELS: Record<string, string> = {
  user: 'Usuário',
  admin: 'Admin',
  master: 'Master',
};

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/users');
      if (res.ok) setUsers(await res.json());
      else toast.error('Erro ao carregar usuários');
    } catch { toast.error('Erro de rede'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpdate = async (userId: string, data: Partial<{ role: string; allowedEnvs: string; plan: string }>) => {
    const body: any = { id: userId };
    if (data.role) body.role = data.role;
    if (data.allowedEnvs) body.allowedEnvs = data.allowedEnvs;

    const res = await apiFetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success('Usuário atualizado');
      load();
    } else {
      toast.error('Erro ao atualizar');
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Excluir este usuário? Esta ação é irreversível.')) return;
    setDeleting(userId);
    const res = await apiFetch(`/api/admin/users?id=${userId}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Usuário excluído'); setUsers(prev => prev.filter(u => u.id !== userId)); }
    else { const d = await res.json(); toast.error(d.error || 'Erro ao excluir'); }
    setDeleting(null);
  };

  const filtered = users.filter(u =>
    !search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Usuários"
        subtitle={`${users.length} usuários cadastrados`}
        breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Usuários' }]}
        badge={
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
            <Shield className="w-3 h-3" /> Admin
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> Novo Usuário
            </Button>
          </div>
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border/60">
                <tr>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Usuário</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Papel</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Ambientes</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Plano</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">2FA</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Cadastro</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {(u.name || u.email)[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate max-w-[180px]">{u.name || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={e => handleUpdate(u.id, { role: e.target.value })}
                        className="text-xs border border-border rounded px-2 py-1 bg-background"
                      >
                        {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.allowedEnvs}
                        onChange={e => handleUpdate(u.id, { allowedEnvs: e.target.value })}
                        className="text-xs border border-border rounded px-2 py-1 bg-background"
                      >
                        <option value="pf">PF</option>
                        <option value="pj">PJ</option>
                        <option value="both">PF + PJ</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[u.subscription?.plan || 'free']}`}>
                        {u.subscription?.plan || 'free'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.totpEnabled
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="w-3 h-3" /> Ativo</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><X className="w-3 h-3" /> Off</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setEditUser(u)}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                          title="Editar plano"
                        >
                          <UserCog className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.id)}
                          disabled={deleting === u.id || u.role === 'admin'}
                          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title={u.role === 'admin' ? 'Admin não pode ser excluído aqui' : 'Excluir usuário'}
                        >
                          {deleting === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">Nenhum usuário encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Plan Dialog */}
      {editUser && <EditPlanDialog user={editUser} onClose={() => setEditUser(null)} onSaved={load} />}

      {/* Create User Dialog */}
      {showCreate && <CreateUserDialog onClose={() => setShowCreate(false)} onSaved={load} />}
    </div>
  );
}

function EditPlanDialog({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState(user.subscription?.plan || 'free');
  const [status, setStatus] = useState(user.subscription?.status || 'active');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await apiFetch('/api/admin/users/subscription', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, plan, status }),
    });
    if (res.ok) { toast.success('Plano atualizado'); onSaved(); onClose(); }
    else toast.error('Erro ao atualizar plano');
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
        <h3 className="font-bold text-foreground">Alterar Plano</h3>
        <p className="text-sm text-muted-foreground">{user.name || user.email}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Plano</label>
            <select value={plan} onChange={e => setPlan(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="premium">Premium</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="active">Ativo</option>
              <option value="canceled">Cancelado</option>
              <option value="trialing">Trial</option>
              <option value="past_due">Em atraso</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateUserDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', allowedEnvs: 'both' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.email || !form.password) { toast.error('E-mail e senha são obrigatórios'); return; }
    setSaving(true);
    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) { toast.success('Usuário criado'); onSaved(); onClose(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro ao criar'); }
    setSaving(false);
  };

  const fields: { key: keyof typeof form; label: string; type?: string }[] = [
    { key: 'name', label: 'Nome' },
    { key: 'email', label: 'E-mail', type: 'email' },
    { key: 'password', label: 'Senha', type: 'password' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
        <h3 className="font-bold text-foreground">Novo Usuário</h3>
        <div className="space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{f.label}</label>
              <input
                type={f.type || 'text'}
                value={form[f.key]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Papel</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="user">Usuário</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Ambientes</label>
            <select value={form.allowedEnvs} onChange={e => setForm(p => ({ ...p, allowedEnvs: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="pf">Apenas PF</option>
              <option value="pj">Apenas PJ</option>
              <option value="both">PF + PJ</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Criar
          </Button>
        </div>
      </div>
    </div>
  );
}