'use client';
import { apiFetch } from '@/lib/fetch';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import {
  Plus, Pencil, Trash2, Shield, Zap, Brain, Sparkles,
  ChevronLeft, Eye, EyeOff, Server, ArrowUp, ArrowDown,
  Activity, Key, Loader2, Settings2, Heart, RefreshCw,
} from 'lucide-react';

interface AIProvider {
  id: string;
  name: string;
  model: string;
  endpoint: string;
  apiKey: string;
  apiKeySet: boolean;
  priority: number;
  weight: number;
  capabilities: string[];
  isBuiltIn: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface TestResult {
  id?: string;
  name: string;
  model: string;
  status: string;
  statusCode: number;
  latency: number;
  error?: string;
  category: string;
}

interface ProviderStats {
  providerId: string;
  providerName: string;
  model: string;
  requests: number;
  successes: number;
  failures: number;
  failovers: number;
  avgLatency: number;
  availability: number | null;
}

const CAPABILITY_OPTIONS = [
  { value: 'general', label: 'Geral', icon: Brain, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'fast', label: 'Rapido', icon: Zap, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'complex', label: 'Complexo', icon: Shield, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'creative', label: 'Criativo', icon: Sparkles, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
];

const STRATEGIES = [
  { value: 'failover', label: 'Failover (P1 > P2 > P3)', desc: 'Tenta o provedor de maior prioridade primeiro, avanca em caso de falha' },
  { value: 'round-robin', label: 'Round Robin (alternar)', desc: 'Distribui as requisicoes uniformemente entre os provedores' },
  { value: 'weighted', label: 'Weighted (por peso)', desc: 'Distribui proporcionalmente ao peso de cada provedor' },
  { value: 'least-latency', label: 'Least Latency (mais rapido)', desc: 'Prioriza o provedor com menor latencia' },
];

const PRESET_PROVIDERS = [
  { name: 'OpenAI', model: 'gpt-4o-mini', endpoint: 'https://api.openai.com/v1', priority: 1 },
  { name: 'DeepSeek', model: 'deepseek-chat', endpoint: 'https://api.deepseek.com/v1', priority: 2 },
  { name: 'Groq', model: 'llama-3.3-70b-versatile', endpoint: 'https://api.groq.com/openai/v1', priority: 1 },
  { name: 'SambaNova', model: 'Meta-Llama-3.3-70B-Instruct', endpoint: 'https://api.sambanova.ai/v1', priority: 2 },
  { name: 'Together.ai', model: 'deepseek-ai/DeepSeek-V4-Pro', endpoint: 'https://api.together.xyz/v1', priority: 3 },
  { name: 'Anthropic', model: 'claude-sonnet-4-20250514', endpoint: 'https://api.anthropic.com/v1', priority: 1 },
];

const emptyForm = {
  name: '', model: '', endpoint: '', apiKey: '', priority: 1, weight: 100,
  capabilities: ['general'] as string[], isActive: true,
};

export default function ChavesAPIPage() {
  const { data: session } = useSession() || {};
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [strategy, setStrategy] = useState('failover');
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [stats, setStats] = useState<ProviderStats[]>([]);
  const [resettingProvider, setResettingProvider] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [provRes, statsRes] = await Promise.all([
        apiFetch('/api/ai/providers'),
        apiFetch('/api/ai/providers/stats'),
      ]);
      if (provRes.ok) {
        const data = await provRes.json();
        setProviders(data.providers || []);
        if (data.strategy) setStrategy(data.strategy);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats || []);
      }
    } catch (err) {
      console.error('Erro ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name || !form.model) return;
    setSaving(true);
    try {
      const method = editId ? 'PUT' : 'POST';
      // When editing, omit apiKey if the user left it blank (keep existing key in DB)
      const payload: any = { ...form };
      if (editId) {
        payload.id = editId;
        if (!form.apiKey) delete payload.apiKey;
      }
      const res = await apiFetch('/api/ai/providers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowForm(false);
        setEditId(null);
        setForm({ ...emptyForm });
        setShowKey(false);
        await load();
      } else {
        let msg = `HTTP ${res.status}`;
        try { const d = await res.json(); msg = d.error || msg; } catch { /* noop */ }
        alert(`Erro ao salvar: ${msg}`);
      }
    } catch (err: any) {
      alert(`Erro ao salvar: ${err?.message || 'Erro de rede'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await apiFetch('/api/ai/providers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) await load();
    } catch (err) {
      console.error('Erro ao excluir:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await apiFetch('/api/ai/providers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive }),
    });
    await load();
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const idx = providers.findIndex(p => p.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= providers.length) return;
    const a = providers[idx];
    const b = providers[swapIdx];
    // Swap both sortOrder (visual) and priority (load balancer)
    await Promise.all([
      apiFetch('/api/ai/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, sortOrder: b.sortOrder, priority: b.priority }),
      }),
      apiFetch('/api/ai/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, sortOrder: a.sortOrder, priority: a.priority }),
      }),
    ]);
    await load();
  };

  const handleEdit = (p: AIProvider) => {
    setEditId(p.id);
    setForm({
      name: p.name, model: p.model, endpoint: p.endpoint, apiKey: '',
      priority: p.priority, weight: p.weight,
      capabilities: p.capabilities || ['general'], isActive: p.isActive,
    });
    setShowKey(false);
    setShowForm(true);
  };

  const handlePreset = (preset: typeof PRESET_PROVIDERS[0]) => {
    setForm(prev => ({ ...prev, name: preset.name, model: preset.model, endpoint: preset.endpoint, priority: preset.priority }));
  };

  const handleTestAll = async () => {
    setTesting(true);
    setTestResults([]);
    try {
      const res = await apiFetch('/api/ai/providers/test', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setTestResults(data);
      }
    } catch (err) {
      console.error('Erro no teste:', err);
    } finally {
      setTesting(false);
    }
  };

  const handleStrategyChange = async (newStrategy: string) => {
    setStrategy(newStrategy);
    try {
      await apiFetch('/api/ai/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: newStrategy }),
      });
    } catch {}
  };

  const toggleCapability = (cap: string) => {
    setForm(prev => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter(c => c !== cap)
        : [...prev.capabilities, cap],
    }));
  };

  const getStatsForProvider = (providerId: string): ProviderStats | undefined => {
    return stats.find(s => s.providerId === providerId);
  };

  const getTestForProvider = (name: string): TestResult | undefined => {
    return testResults.find(r => r.name === name);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/configuracoes">
            <Button variant="ghost" size="icon"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-bold">Provedores de IA</h1>
            <span className="text-sm text-muted-foreground">({providers.length} configurados)</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Estrategia:</span>
            <select
              value={strategy}
              onChange={e => handleStrategyChange(e.target.value)}
              className="text-sm border rounded-md px-2 py-1 bg-background text-foreground border-input"
            >
              {STRATEGIES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button onClick={handleTestAll} disabled={testing} variant="outline" size="sm">
          {testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Activity className="w-4 h-4 mr-1" />}
          {testing ? 'Testando...' : 'Testar Todos'}
        </Button>
        <Button onClick={() => { setEditId(null); setForm({ ...emptyForm }); setShowKey(false); setShowForm(true); }} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Adicionar Provedor
        </Button>
      </div>

      {/* Provider Cards - matching reference image */}
      <div className="space-y-3">
        {providers.map((p, idx) => {
          const pStats = getStatsForProvider(p.id);
          const pTest = getTestForProvider(p.name);
          const isOnline = pTest?.status === 'online';
          const hasError = pTest && pTest.status !== 'online';
          const errorCategory = pTest?.category;

          return (
            <Card key={p.id} className={`relative overflow-hidden ${
              !p.isActive ? 'opacity-60' : ''
            } ${hasError ? 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20' : ''}`}>
              <CardContent className="p-4">
                {/* Row 1: Provider name, model, priority badge, status */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold text-lg">{p.name}</span>
                    <span className="text-sm text-muted-foreground">({p.model})</span>
                    <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">
                      P{p.priority}
                    </Badge>
                    {p.isBuiltIn && (
                      <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-0">
                        Built-in
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {hasError && errorCategory && (
                      <Badge variant="destructive" className="text-xs">
                        {errorCategory === 'CREDITO_AUTH' ? 'Credito/Auth (5min)' :
                         errorCategory === 'OFFLINE' ? 'Offline' :
                         errorCategory === 'CONFIG' ? 'Config' : errorCategory}
                      </Badge>
                    )}
                    {hasError && (
                      <Button variant="outline" size="sm" className="h-6 text-xs"
                        onClick={handleTestAll} disabled={testing}>
                        Resetar
                      </Button>
                    )}
                    {pTest && isOnline && (
                      <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                        <Heart className="w-4 h-4" /> Online
                      </span>
                    )}
                    <Switch
                      checked={p.isActive}
                      onCheckedChange={v => handleToggle(p.id, v)}
                    />
                  </div>
                </div>

                {/* Error message */}
                {hasError && pTest?.error && (
                  <div className="mb-3 p-2 bg-red-100 dark:bg-red-950/40 rounded text-xs text-red-800 dark:text-red-300 font-mono break-all">
                    <span className="mr-1">&#x1F527;</span>
                    [{pTest.statusCode}] {pTest.error}
                  </div>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-6 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Requisicoes</div>
                    <div className="font-semibold">{pStats?.requests || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Sucesso</div>
                    <div className="font-semibold text-green-600">{pStats?.successes || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Falhas</div>
                    <div className={`font-semibold ${(pStats?.failures || 0) > 0 ? 'text-red-600' : ''}`}>{pStats?.failures || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Failovers</div>
                    <div className={`font-semibold ${(pStats?.failovers || 0) > 0 ? 'text-amber-600' : ''}`}>{pStats?.failovers || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Latencia Media</div>
                    <div className="font-semibold">{pStats?.avgLatency || 0}ms</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Disponibilidade</div>
                    <div className="font-semibold">
                      {pStats?.availability != null ? `${pStats.availability}%` : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => handleReorder(p.id, 'up')} disabled={idx === 0}>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => handleReorder(p.id, 'down')} disabled={idx === providers.length - 1}>
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    {p.capabilities?.map(cap => {
                      const opt = CAPABILITY_OPTIONS.find(c => c.value === cap);
                      if (!opt) return null;
                      const Icon = opt.icon;
                      return (
                        <Badge key={cap} variant="outline" className={`text-xs ${opt.color} border-0 ml-1`}>
                          <Icon className="w-3 h-3 mr-0.5" /> {opt.label}
                        </Badge>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => handleEdit(p)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                    </Button>
                    {!p.isBuiltIn && (
                      <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(p.id)}
                        disabled={deleting === p.id}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {providers.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Key className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum provedor configurado</p>
              <p className="text-xs text-muted-foreground mt-1">O sistema usara o AbacusAI como provedor padrao</p>
              <Button className="mt-4" onClick={() => { setEditId(null); setForm({ ...emptyForm }); setShowForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar Provedor
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Provedor' : 'Novo Provedor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editId && (
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Presets rapidos</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_PROVIDERS.map(preset => (
                    <Button key={preset.name} variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => handlePreset(preset)}>
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: OpenAI" />
              </div>
              <div>
                <Label>Modelo</Label>
                <Input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} placeholder="Ex: gpt-4o-mini" />
              </div>
            </div>

            <div>
              <Label>Endpoint</Label>
              <Input value={form.endpoint} onChange={e => setForm(p => ({ ...p, endpoint: e.target.value }))} placeholder="https://api.openai.com/v1" />
            </div>

            <div>
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={form.apiKey}
                  onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))}
                  placeholder={editId ? 'Deixe vazio para manter a atual' : 'sk-...'}
                />
                <Button variant="ghost" size="icon" className="absolute right-1 top-0.5 h-8 w-8"
                  onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prioridade (P1-P5)</Label>
                <Input type="number" min={1} max={5} value={form.priority}
                  onChange={e => setForm(p => ({ ...p, priority: parseInt(e.target.value) || 1 }))} />
              </div>
              <div>
                <Label>Peso (1-100)</Label>
                <Input type="number" min={1} max={100} value={form.weight}
                  onChange={e => setForm(p => ({ ...p, weight: parseInt(e.target.value) || 100 }))} />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Capacidades</Label>
              <div className="flex flex-wrap gap-2">
                {CAPABILITY_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const selected = form.capabilities.includes(opt.value);
                  return (
                    <button key={opt.value}
                      onClick={() => toggleCapability(opt.value)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                        selected ? opt.color + ' border-transparent' : 'bg-muted/50 text-muted-foreground border-border'
                      }`}>
                      <Icon className="w-3.5 h-3.5" /> {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !form.name || !form.model}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                {editId ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
