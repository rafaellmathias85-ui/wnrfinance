'use client';
import { apiFetch } from '@/lib/fetch';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, ClipboardList, DollarSign, FileText, ShoppingCart, TrendingUp } from 'lucide-react';
import { KpiStrip, PageHeader, type KpiItem } from '@/components/enterprise';
import { Card, CardContent } from '@/components/ui/card';


const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

const TYPE_LABEL: Record<string, string> = { venda: 'Venda', orcamento: 'Orçamento', ordem_servico: 'Ordem de Serviço' };
const TYPE_COLOR: Record<string, string> = { venda: 'text-green-600', orcamento: 'text-blue-600', ordem_servico: 'text-amber-600' };

export default function VendasDashboard() {
  const { activeCompanyId } = usePJ();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const res = await apiFetch('/api/pj/vendas/stats');
      if (res.ok) setStats(await res.json());
    } catch {}
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const variacao = stats?.variacaoMes;
  const kpis: KpiItem[] = [
    {
      label: 'Vendas (Mês)',
      value: loading ? '...' : fmt(stats?.vendasMes ?? 0),
      icon: <DollarSign className="w-5 h-5" />,
      change: variacao != null ? variacao : undefined,
    },
    { label: 'Orçamentos', value: loading ? '...' : String(stats?.orcamentos ?? 0), icon: <FileText className="w-5 h-5" /> },
    { label: 'Ordens de Serviço', value: loading ? '...' : String(stats?.ordensServico ?? 0), icon: <ClipboardList className="w-5 h-5" /> },
    { label: 'Ticket Médio', value: loading ? '...' : fmt(stats?.ticketMedio ?? 0), icon: <TrendingUp className="w-5 h-5" /> },
  ];

  const quickLinks = [
    { href: '/pj/vendas/orcamentos', label: 'Novo Orçamento', icon: FileText, color: 'text-blue-500' },
    { href: '/pj/vendas/ordens-servico', label: 'Nova OS', icon: ClipboardList, color: 'text-green-500' },
    { href: '/pj/vendas/comissoes', label: 'Comissões', icon: ShoppingCart, color: 'text-amber-500' },
    { href: '/pj/vendas/produtos', label: 'Produtos', icon: ShoppingCart, color: 'text-purple-500' },
    { href: '/pj/vendas/vendedores', label: 'Vendedores', icon: TrendingUp, color: 'text-cyan-500' },
    { href: '/pj/vendas/relatorios', label: 'Relatórios', icon: BarChart3, color: 'text-red-500' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Vendas" subtitle="Gestão comercial completa" />
      <KpiStrip items={kpis} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {quickLinks.map(link => (
          <Link key={link.href} href={link.href}
            className="bg-card border border-border/60 rounded-xl p-5 flex flex-col items-center gap-3 hover:shadow-lg hover:border-primary/30 transition-all group">
            <link.icon className={`w-8 h-8 ${link.color} group-hover:scale-110 transition-transform`} />
            <span className="text-sm font-medium text-foreground">{link.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Últimas vendas */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Últimos Pedidos</h3>
              <Link href="/pj/vendas/orcamentos" className="text-xs text-primary hover:underline">Ver todos</Link>
            </div>
            {loading ? (
              <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : !stats?.recentOrders?.length ? (
              <p className="text-muted-foreground text-sm">Nenhum pedido registrado ainda.</p>
            ) : (
              <div className="space-y-2">
                {stats.recentOrders.map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{o.customerName || '—'}</p>
                      <p className={`text-xs ${TYPE_COLOR[o.type] || 'text-muted-foreground'}`}>{TYPE_LABEL[o.type] || o.type} · {fmtDate(o.createdAt)}</p>
                    </div>
                    <span className="text-sm font-semibold ml-4 flex-shrink-0">{fmt(o.total ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top vendedores */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Top Vendedores (Mês)</h3>
              <Link href="/pj/vendas/vendedores" className="text-xs text-primary hover:underline">Ver todos</Link>
            </div>
            {loading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : !stats?.topSellers?.length ? (
              <p className="text-muted-foreground text-sm">Nenhuma venda registrada neste mês.</p>
            ) : (
              <div className="space-y-3">
                {stats.topSellers.map((s: any, i: number) => {
                  const maxTotal = stats.topSellers[0]?.total || 1;
                  const pct = Math.round((s.total / maxTotal) * 100);
                  return (
                    <div key={s.name || i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{s.name || 'Sem vendedor'}</span>
                        <span className="text-muted-foreground">{fmt(s.total)} ({s.count} venda{s.count !== 1 ? 's' : ''})</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
