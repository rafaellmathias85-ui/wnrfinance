'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { PageHeader } from '@/components/enterprise';
import { Input } from '@/components/ui/input';


export default function Page() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch('/api/pj/estoque/products').then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = products.filter((p: any) =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Inventário" subtitle="Contagem e conferência de estoque" />
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>
      ) : (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="py-3 px-4 text-left text-muted-foreground font-medium">SKU</th>
                <th className="py-3 px-4 text-left text-muted-foreground font-medium">Produto</th>
                <th className="py-3 px-4 text-right text-muted-foreground font-medium">Estoque Sistema</th>
                <th className="py-3 px-4 text-right text-muted-foreground font-medium">Estoque Mínimo</th>
                <th className="py-3 px-4 text-center text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum produto encontrado</td></tr>
              ) : filtered.map((p: any) => {
                const low = (p.currentStock || 0) <= (p.minStock || 0) && p.minStock > 0;
                return (
                  <tr key={p.id} className="border-b hover:bg-muted/20">
                    <td className="py-3 px-4 font-mono text-xs">{p.sku || '—'}</td>
                    <td className="py-3 px-4 font-medium">{p.name}</td>
                    <td className="py-3 px-4 text-right font-bold">{p.currentStock || 0}</td>
                    <td className="py-3 px-4 text-right">{p.minStock || 0}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${low ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                        {low ? 'Baixo' : 'OK'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
