'use client';

import { apiFetch } from '@/lib/fetch';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search, ClipboardCheck, AlertTriangle, Check, RefreshCw } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  code: string | null;
  currentStock: number;
  minStock: number;
  unit: string | null;
  category?: { name: string } | null;
}

interface CountRow {
  productId: string;
  currentStock: number;
  countedQty: string; // string for controlled input
}

export default function InventarioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [countMode, setCountMode] = useState(false);
  const [counts, setCounts] = useState<Record<string, CountRow>>({});
  const [saving, setSaving] = useState(false);
  const [filterLow, setFilterLow] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch('/api/pj/estoque/products');
    const data = await r.json();
    const list: Product[] = Array.isArray(data) ? data : [];
    setProducts(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startCount = () => {
    const initial: Record<string, CountRow> = {};
    products.forEach(p => {
      initial[p.id] = { productId: p.id, currentStock: p.currentStock ?? 0, countedQty: String(p.currentStock ?? 0) };
    });
    setCounts(initial);
    setCountMode(true);
  };

  const cancelCount = () => {
    setCountMode(false);
    setCounts({});
  };

  const applyCount = async () => {
    const items = Object.values(counts)
      .map(c => ({ productId: c.productId, countedQty: parseFloat(c.countedQty) || 0 }))
      .filter(c => !isNaN(c.countedQty) && c.countedQty !== products.find(p => p.id === c.productId)?.currentStock);

    if (items.length === 0) {
      toast.info('Nenhuma diferença encontrada');
      setCountMode(false);
      return;
    }

    setSaving(true);
    const res = await apiFetch('/api/pj/estoque/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    setSaving(false);

    if (res.ok) {
      const d = await res.json();
      toast.success(`Inventário aplicado — ${d.adjusted} produto(s) ajustado(s)`);
      setCountMode(false);
      setCounts({});
      load();
    } else {
      toast.error('Erro ao aplicar inventário');
    }
  };

  const filtered = products.filter(p => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.code ?? '').toLowerCase().includes(search.toLowerCase());
    const matchLow = filterLow ? (p.currentStock ?? 0) <= (p.minStock ?? 0) && (p.minStock ?? 0) > 0 : true;
    return matchSearch && matchLow;
  });

  const lowCount = products.filter(p => (p.currentStock ?? 0) <= (p.minStock ?? 0) && (p.minStock ?? 0) > 0).length;

  const pendingChanges = countMode
    ? Object.values(counts).filter(c => {
        const orig = products.find(p => p.id === c.productId)?.currentStock ?? 0;
        return (parseFloat(c.countedQty) || 0) !== orig;
      }).length
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Inventário de Estoque</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Contagem física e ajuste de estoque</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {countMode ? (
            <>
              <button onClick={cancelCount}
                className="px-4 py-2 bg-muted hover:bg-muted text-foreground rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={applyCount} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                <Check className="w-4 h-4" />
                {saving ? 'Aplicando...' : `Aplicar inventário${pendingChanges > 0 ? ` (${pendingChanges})` : ''}`}
              </button>
            </>
          ) : (
            <>
              <button onClick={load} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={startCount}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium">
                <ClipboardCheck className="w-4 h-4" /> Iniciar Contagem
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold">{products.length}</p>
          <p className="text-muted-foreground text-xs mt-0.5">Produtos cadastrados</p>
        </div>
        <div className={`border rounded-xl p-4 ${lowCount > 0 ? 'bg-red-900/20 border-red-700' : 'bg-card border-border'}`}>
          <p className={`text-2xl font-bold ${lowCount > 0 ? 'text-red-400' : 'text-white'}`}>{lowCount}</p>
          <p className="text-muted-foreground text-xs mt-0.5">Estoque abaixo do mínimo</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-blue-400">{countMode ? pendingChanges : '—'}</p>
          <p className="text-muted-foreground text-xs mt-0.5">Diferenças encontradas</p>
        </div>
      </div>

      {countMode && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-xl px-4 py-3 text-sm text-blue-300">
          Modo de contagem ativo — insira a quantidade contada para cada produto. Apenas produtos com diferença serão ajustados.
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Buscar produto, SKU ou código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-border text-foreground rounded-lg pl-10 pr-4 py-2 text-sm"
          />
        </div>
        <button
          onClick={() => setFilterLow(!filterLow)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${filterLow ? 'bg-red-900/30 border-red-700 text-red-400' : 'bg-card border-border text-muted-foreground'}`}
        >
          <AlertTriangle className="w-4 h-4" /> Estoque baixo
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Nenhum produto encontrado</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-muted-foreground font-medium">SKU / Código</th>
                <th className="px-4 py-3 text-muted-foreground font-medium">Produto</th>
                <th className="px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">Categoria</th>
                <th className="px-4 py-3 text-right text-muted-foreground font-medium">Estoque Sistema</th>
                <th className="px-4 py-3 text-right text-muted-foreground font-medium hidden lg:table-cell">Mínimo</th>
                {countMode && <th className="px-4 py-3 text-right text-muted-foreground font-medium">Contagem Física</th>}
                {countMode && <th className="px-4 py-3 text-right text-muted-foreground font-medium">Diferença</th>}
                {!countMode && <th className="px-4 py-3 text-center text-muted-foreground font-medium">Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(p => {
                const low = (p.currentStock ?? 0) <= (p.minStock ?? 0) && (p.minStock ?? 0) > 0;
                const row = counts[p.id];
                const counted = row ? parseFloat(row.countedQty) || 0 : 0;
                const diff = countMode ? counted - (p.currentStock ?? 0) : 0;

                return (
                  <tr key={p.id} className={`hover:bg-muted/40 transition-colors ${low && !countMode ? 'bg-red-900/10' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.sku || p.code || '—'}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">{p.category?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {p.currentStock ?? 0} {p.unit && <span className="text-muted-foreground text-xs ml-1">{p.unit}</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">{p.minStock ?? 0}</td>

                    {countMode && (
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          value={row?.countedQty ?? ''}
                          onChange={e => setCounts(prev => ({
                            ...prev,
                            [p.id]: { productId: p.id, currentStock: p.currentStock ?? 0, countedQty: e.target.value },
                          }))}
                          className="w-24 bg-muted border border-border text-foreground rounded px-2 py-1 text-sm text-right"
                        />
                      </td>
                    )}
                    {countMode && (
                      <td className={`px-4 py-3 text-right font-medium ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {diff !== 0 ? (diff > 0 ? `+${diff}` : String(diff)) : '='}
                      </td>
                    )}
                    {!countMode && (
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          low ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                        }`}>
                          {low ? 'Baixo' : 'OK'}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
