'use client';

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { PageHeader } from '@/components/enterprise';
import { apiFetch } from '@/lib/fetch';
import { Plus, Search, Pencil, Trash2, X, Loader2, ChevronLeft, ChevronRight, FileX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export interface CrudColumn {
  key: string;
  label: string;
  render?: (value: any, row: any) => ReactNode;
  className?: string;
}

export interface CrudField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'textarea' | 'date' | 'email';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: any;
}

interface CrudPageProps {
  title: string;
  subtitle: string;
  apiUrl: string;
  columns: CrudColumn[];
  fields: CrudField[];
  searchKey?: string;
  newLabel?: string;
  entityName?: string;
  breadcrumbs?: { label: string; href?: string }[];
  icon?: ReactNode;
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-border/20">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className={`skeleton h-4 ${j === 0 ? 'w-32' : j === cols - 1 ? 'w-16' : 'w-24'}`} />
            </td>
          ))}
          <td className="px-4 py-3">
            <div className="flex justify-end gap-1">
              <div className="skeleton w-7 h-7 rounded-lg" />
              <div className="skeleton w-7 h-7 rounded-lg" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

export function CrudPage({
  title, subtitle, apiUrl, columns, fields,
  searchKey = 'name', newLabel = 'Novo', entityName = 'registro',
  breadcrumbs, icon,
}: CrudPageProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 15;

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(apiUrl);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro ao carregar');
      setItems(Array.isArray(d) ? d : d.items || []);
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao carregar', variant: 'destructive' });
    }
    setLoading(false);
  }, [apiUrl, toast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    const defaults: Record<string, any> = {};
    fields.forEach(f => { defaults[f.key] = f.defaultValue ?? ''; });
    setForm(defaults);
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    const vals: Record<string, any> = {};
    fields.forEach(f => {
      let v = item[f.key];
      if (f.type === 'date' && v) v = v.slice(0, 10);
      vals[f.key] = v ?? '';
    });
    setForm(vals);
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = { ...form };
      fields.forEach(f => {
        if (f.type === 'number' && payload[f.key] !== '' && payload[f.key] !== undefined) {
          payload[f.key] = Number(payload[f.key]);
        }
        if (f.type === 'date' && payload[f.key]) {
          payload[f.key] = new Date(payload[f.key]).toISOString();
        }
      });
      if (editing) payload.id = editing.id;

      const r = await apiFetch(apiUrl, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
      toast({ title: editing ? `${entityName} atualizado!` : `${entityName} criado!` });
      setShowForm(false);
      load();
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao salvar', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Excluir ${entityName}?`)) return;
    try {
      const r = await apiFetch(`${apiUrl}?id=${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'Erro');
      }
      toast({ title: `${entityName} excluído!` });
      load();
    } catch {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
  };

  const filtered = items.filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    return columns.some(c => {
      const v = item[c.key];
      return v && String(v).toLowerCase().includes(s);
    });
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} icon={icon} />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={`Buscar ${entityName}...`}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-10 h-9 bg-card"
          />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          {!loading && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {filtered.length} {entityName}(s)
            </span>
          )}
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="w-4 h-4" /> {newLabel}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <div className="overflow-x-auto">
          <table className="enterprise-table">
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c.key} className={c.className || ''}>
                    {c.label}
                  </th>
                ))}
                <th className="text-right w-24">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={columns.length} />
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1}>
                    <div className="empty-state py-14">
                      <FileX className="empty-state-icon" />
                      <p className="empty-state-title">Nenhum {entityName} encontrado</p>
                      {search && (
                        <p className="empty-state-desc">
                          Tente remover os filtros ou criar um novo {entityName}.
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paged.map(item => (
                  <tr key={item.id}>
                    {columns.map(c => (
                      <td key={c.key} className={c.className || ''}>
                        {c.render ? c.render(item[c.key], item) : (item[c.key] ?? '—')}
                      </td>
                    ))}
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-muted/20">
            <span className="text-xs text-muted-foreground">
              {filtered.length} {entityName}(s) • página {page + 1} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                const p = page < 3 ? i : page - 2 + i;
                if (p >= totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`h-8 w-8 text-xs rounded-lg transition-colors ${
                      p === page
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {p + 1}
                  </button>
                );
              })}
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          />
          <div className="relative bg-card border border-border/60 rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col animate-scale-in"
            style={{ boxShadow: 'var(--shadow-xl)' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 shrink-0">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {editing ? `Editar ${entityName}` : `Novo ${entityName}`}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {editing ? 'Atualize os campos abaixo.' : 'Preencha os campos para criar.'}
                </p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {fields.map(f => (
                <div key={f.key}>
                  <label className="form-label">
                    {f.label}
                    {f.required && <span className="text-destructive ml-0.5">*</span>}
                  </label>
                  {f.type === 'select' ? (
                    <select
                      value={form[f.key] || ''}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary/50 transition-colors"
                    >
                      <option value="">Selecionar...</option>
                      {f.options?.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea
                      value={form[f.key] || ''}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[90px] resize-none focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary/50 transition-colors"
                      placeholder={f.placeholder}
                    />
                  ) : (
                    <Input
                      type={f.type || 'text'}
                      value={form[f.key] || ''}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      step={f.type === 'number' ? 'any' : undefined}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border/60 shrink-0 bg-muted/20 rounded-b-2xl">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="min-w-[80px]">
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : editing ? 'Salvar' : 'Criar'
                }
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
