'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import { DollarSign, FileBarChart, ShoppingCart, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/enterprise';


export default function Page() {
  const [orders, setOrders] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/pj/vendas/orders').then(r => r.json()),
      apiFetch('/api/pj/vendas/sellers').then(r => r.json()),
    ]).then(([o, s]) => {
      setOrders(Array.isArray(o) ? o : []);
      setSellers(Array.isArray(s) ? s : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalVendas = orders.length;
  const totalValor = orders.reduce((s: number, o: any) => s + (o.total || 0), 0);
  const aprovados = orders.filter((o: any) => o.status === 'aprovado' || o.status === 'concluido').length;
  const ticketMedio = totalVendas > 0 ? totalValor / totalVendas : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios de Vendas" subtitle="Análises e métricas comerciais" />
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Vendas', value: totalVendas, icon: ShoppingCart, color: 'text-blue-600' },
              { label: 'Valor Total', value: `R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-green-600' },
              { label: 'Aprovadas', value: aprovados, icon: TrendingUp, color: 'text-emerald-600' },
              { label: 'Ticket Médio', value: `R$ ${ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: FileBarChart, color: 'text-purple-600' },
            ].map(k => (
              <div key={k.label} className="bg-card border border-border/60 rounded-xl p-4 text-center">
                <k.icon className={`w-6 h-6 mx-auto mb-2 ${k.color}`} />
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border/60">
              <h3 className="font-semibold">Vendedores - Performance</h3>
            </div>
            <div className="p-4">
              {sellers.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">Nenhum vendedor cadastrado</p>
              ) : (
                <div className="space-y-3">
                  {sellers.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">Comissão: {s.commission || 0}%</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${s.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500'}`}>
                        {s.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
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
