'use client';
import { apiFetch } from '@/lib/fetch';
import { useCallback, useEffect, useState } from 'react';
import { Ban, Check, Eye, Loader2, Lock, Pencil, Save, Shield, Unlock, Users } from 'lucide-react';
import { PageHeader } from '@/components/enterprise';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';


interface UserInfo {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

interface MetaInfo {
  modules: { id: string; label: string; columns: { title: string; items: { id: string; label: string }[] }[] }[];
  actions: { id: string; label: string }[];
  roles: { id: string; label: string }[];
}

type PermMatrix = Record<string, Record<string, boolean>>;

// Quick-set modes
type AccessMode = 'custom' | 'total' | 'blocked';

export default function PermissoesPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [matrix, setMatrix] = useState<PermMatrix>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [activeModuleTab, setActiveModuleTab] = useState<string>('');
  const [accessMode, setAccessMode] = useState<Record<string, AccessMode>>({});

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/permissions').then(r => r.json()),
      apiFetch('/api/admin/permissions?meta=true').then(r => r.json()),
    ])
      .then(([usersData, metaData]) => {
        setUsers(usersData.users || []);
        // API returns permModules, map to modules for component
        const normalized = { ...metaData, modules: metaData.permModules || metaData.modules || [] };
        setMeta(normalized);
        if (normalized.modules?.[0]) setActiveModuleTab(normalized.modules[0].id);
      })
      .catch(() => toast({ title: 'Erro ao carregar dados', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  const loadUserPerms = useCallback(async (userId: string) => {
    setLoadingPerms(true);
    try {
      const res = await apiFetch(`/api/admin/permissions?userId=${userId}`);
      const data = await res.json();
      setMatrix(data.permissions || {});
      setSelectedRole(data.user?.role || 'user');
    } catch {
      toast({ title: 'Erro ao carregar permissões', variant: 'destructive' });
    }
    setLoadingPerms(false);
  }, []);

  const selectUser = (userId: string) => {
    setSelectedUser(userId);
    loadUserPerms(userId);
    setAccessMode({});
  };

  const togglePerm = (subItemId: string, action: string) => {
    setMatrix(prev => ({
      ...prev,
      [subItemId]: {
        ...prev[subItemId],
        [action]: !prev[subItemId]?.[action],
      },
    }));
  };

  // Quick-set: Total access or Blocked for a module
  const setModuleAccess = (moduleId: string, mode: AccessMode) => {
    if (!meta) return;
    const mod = meta.modules.find(m => m.id === moduleId);
    if (!mod) return;
    setAccessMode(prev => ({ ...prev, [moduleId]: mode }));
    if (mode === 'custom') return;
    const allowed = mode === 'total';
    setMatrix(prev => {
      const next = { ...prev };
      for (const col of mod.columns) {
        for (const item of col.items) {
          next[item.id] = {};
          for (const act of meta.actions) {
            next[item.id][act.id] = allowed;
          }
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedUser || !meta) return;
    setSaving(true);
    try {
      const perms: { module: string; action: string; allowed: boolean }[] = [];
      for (const mod of meta.modules) {
        for (const col of mod.columns) {
          for (const item of col.items) {
            for (const act of meta.actions) {
              if (matrix[item.id]?.[act.id] !== undefined) {
                perms.push({ module: item.id, action: act.id, allowed: matrix[item.id][act.id] });
              }
            }
          }
        }
      }
      const res = await apiFetch('/api/admin/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser, role: selectedRole, permissions: perms }),
      });
      if (!res.ok) throw new Error();
      toast({ title: 'Permissões salvas com sucesso!' });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const selectedUserInfo = users.find(u => u.id === selectedUser);
  const activeMod = meta?.modules.find(m => m.id === activeModuleTab);

  return (
    <div>
      <PageHeader
        title="Permissões"
        subtitle="Gerencie permissões granulares por usuário e módulo"
        breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Permissões' }]}
        badge={
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
            <Shield className="w-3 h-3" /> Admin
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* User List */}
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Usuários</span>
            <span className="text-xs text-muted-foreground ml-auto">{users.length}</span>
          </div>
          <div className="max-h-[700px] overflow-y-auto">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => selectUser(u.id)}
                className={`w-full text-left px-4 py-3 border-b border-border/30 transition-colors ${
                  selectedUser === u.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    selectedUser === u.id ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    {u.name?.[0]?.toUpperCase() || u.email[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${selectedUser === u.id ? 'text-blue-700 dark:text-blue-400' : 'text-foreground'}`}>
                      {u.name || u.email}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                    ['admin', 'master'].includes(u.role)
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      : 'bg-gray-100 dark:bg-card text-muted-foreground'
                  }`}>
                    {meta?.roles.find(r => r.id === u.role)?.label || u.role}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Permission Matrix */}
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          {!selectedUser ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Shield className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">Selecione um usuário para gerenciar permissões</p>
            </div>
          ) : loadingPerms ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* User header + role */}
              <div className="px-4 py-3 border-b border-border/60 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                    {selectedUserInfo?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{selectedUserInfo?.name || selectedUserInfo?.email}</p>
                    <p className="text-[11px] text-muted-foreground">{selectedUserInfo?.email}</p>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Papel:</label>
                  <select
                    value={selectedRole}
                    onChange={e => setSelectedRole(e.target.value)}
                    className="text-sm border border-border rounded-lg px-2 py-1 bg-background"
                  >
                    {meta?.roles.map(r => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Salvar
                  </Button>
                </div>
              </div>

              {/* Module tabs */}
              <div className="border-b border-border/60 overflow-x-auto">
                <div className="flex min-w-max">
                  {meta?.modules.map(mod => (
                    <button
                      key={mod.id}
                      onClick={() => setActiveModuleTab(mod.id)}
                      className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        activeModuleTab === mod.id
                          ? 'border-blue-600 text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {mod.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Access mode quick-set */}
              {activeMod && (
                <div className="px-4 py-3 border-b border-border/40 flex items-center gap-3 flex-wrap bg-muted/30">
                  {[
                    { mode: 'custom' as AccessMode, label: 'Acesso Personalizado', icon: Unlock, color: 'text-blue-600' },
                    { mode: 'total' as AccessMode, label: `Acesso Total ao Módulo ${activeMod.label}`, icon: Check, color: 'text-emerald-600' },
                    { mode: 'blocked' as AccessMode, label: `Acesso BLOQUEADO ao Módulo ${activeMod.label}`, icon: Ban, color: 'text-red-600' },
                  ].map(opt => (
                    <label key={opt.mode} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`access-${activeMod.id}`}
                        checked={(accessMode[activeMod.id] || 'custom') === opt.mode}
                        onChange={() => setModuleAccess(activeMod.id, opt.mode)}
                        className="accent-blue-600"
                      />
                      <opt.icon className={`w-3.5 h-3.5 ${opt.color}`} />
                      <span className="text-xs font-medium text-foreground">{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* 3-column matrix */}
              {activeMod && (
                <div className="p-4">
                  <div className={`grid gap-6 ${activeMod.columns.length === 1 ? 'grid-cols-1' : activeMod.columns.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
                    {activeMod.columns.map(col => (
                      <div key={col.title} className="border border-border/50 rounded-xl overflow-hidden">
                        {/* Column header */}
                        <div className="bg-muted/50 px-4 py-2.5 border-b border-border/50">
                          <div className="flex items-center gap-6">
                            <span className="text-sm font-bold text-foreground flex-1">{col.title}</span>
                            <span title="Visualizar"><Eye className="w-4 h-4 text-muted-foreground" /></span>
                            <span title="Editar"><Pencil className="w-4 h-4 text-muted-foreground" /></span>
                            <span title="Restrito"><Lock className="w-4 h-4 text-muted-foreground" /></span>
                          </div>
                        </div>
                        {/* Items */}
                        <div className="divide-y divide-border/30">
                          {col.items.map(item => {
                            const viewOn = matrix[item.id]?.view ?? false;
                            const editOn = matrix[item.id]?.edit ?? false;
                            const deleteOn = matrix[item.id]?.delete ?? false;
                            return (
                              <div key={item.id} className="flex items-center gap-4 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                                <span className="text-sm text-foreground flex-1">{item.label}</span>
                                {/* View toggle */}
                                <button
                                  onClick={() => togglePerm(item.id, 'view')}
                                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    viewOn
                                      ? 'border-emerald-500 bg-emerald-500 text-white'
                                      : 'border-gray-300 dark:border-border text-transparent hover:border-gray-400'
                                  }`}
                                  title="Visualizar"
                                >
                                  {viewOn && <Check className="w-3 h-3" />}
                                </button>
                                {/* Edit toggle */}
                                <button
                                  onClick={() => togglePerm(item.id, 'edit')}
                                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    editOn
                                      ? 'border-emerald-500 bg-emerald-500 text-white'
                                      : 'border-gray-300 dark:border-border text-transparent hover:border-gray-400'
                                  }`}
                                  title="Editar"
                                >
                                  {editOn && <Check className="w-3 h-3" />}
                                </button>
                                {/* Delete/Lock toggle */}
                                <button
                                  onClick={() => togglePerm(item.id, 'delete')}
                                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    deleteOn
                                      ? 'border-emerald-500 bg-emerald-500 text-white'
                                      : 'border-gray-300 dark:border-border text-transparent hover:border-gray-400'
                                  }`}
                                  title="Excluir"
                                >
                                  {deleteOn && <Check className="w-3 h-3" />}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
