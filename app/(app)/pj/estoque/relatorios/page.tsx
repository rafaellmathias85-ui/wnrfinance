'use client';
import { apiFetch } from '@/lib/fetch';
import { ArrowDownCircle, ArrowUpCircle, Warehouse } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BarChart3, Package } from 'lucide-react';
import { PageHeader } from '@/components/enterprise';


export default function Page() {
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/pj/estoque/products').then(r => r.json()),
      apiFetch('/api/pj/estoque/movements').then(r => r.json()),
    ]).then(([p, m]) => {
      setProducts(Array.isArray(p) ? p : []);
      setMovements(Array.isArray(m) ? m : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalProducts = products.length;
  const totalStock = products.reduce((s: number, p: any) => s + (p.currentStock || 0), 0);
  const entradas = movements.filter((m: any) => m.type === 'entrada').length;
  const saidas = movements.filter((m: any) => m.type === 'saida').length;
  const lowStock = products.filter((p: any) => (p.currentStock || 0) <= (p.minStock || 0) && p.minStock > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios de Estoque" subtitle="Análises e visão geral do estoque" />
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Total Produtos', value: totalProducts, icon: Package, color: 'text-blue-600' },
              { label: 'Itens em Estoque', value: totalStock, icon: Warehouse, color: 'text-green-600' },
              { label: 'Entradas', value: entradas, icon: ArrowDownCircle, color: 'text-emerald-600' },
              { label: 'Saídas', value: saidas, icon: ArrowUpCircle, color: 'text-red-600' },
              { label: 'Estoque Baixo', value: lowStock, icon: BarChart3, color: 'text-amber-600' },
            ].map(k => (
              <div key={k.label} className="bg-card border border-border/60 rounded-xl p-4 text-center">
                <k.icon className={`w-6 h-6 mx-auto mb-2 ${k.color}`} />
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border/60">
              <h3 className="font-semibold">Produtos com Estoque Baixo</h3>
            </div>
            <div className="p-4">
              {lowStock === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">Nenhum produto com estoque baixo</p>
              ) : (
                <div className="space-y-2">
                  {products.filter((p: any) => (p.currentStock || 0) <= (p.minStock || 0) && p.minStock > 0).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-amber-600 font-bold">{p.currentStock}/{p.minStock} un.</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
