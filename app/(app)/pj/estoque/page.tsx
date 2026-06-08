'use client';
import { apiFetch } from '@/lib/fetch';
import { ArrowRightLeft, PackageMinus, PackagePlus } from 'lucide-react';
import { usePJ } from '@/lib/pj-context';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BarChart3, DollarSign, Package, Search } from 'lucide-react';
import { KpiStrip, PageHeader, type KpiItem } from '@/components/enterprise';
import { Card, CardContent } from '@/components/ui/card';


const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

const MOV_TYPE: Record<string, { label: string; color: string; icon: any }> = {
  entrada: { label: 'Entrada', color: 'text-green-600 bg-green-50 dark:bg-green-900/20', icon: PackagePlus },
  saida: { label: 'Saída', color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: PackageMinus },
  ajuste: { label: 'Ajuste', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', icon: Package },
  transferencia: { label: 'Transferência', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', icon: ArrowRightLeft },
};

export default function EstoqueDashboard() {
  const { activeCompanyId } = usePJ();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const res = await apiFetch('/api/pj/estoque/stats');
      if (res.ok) setStats(await res.json());
    } catch {}
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const kpis: KpiItem[] = [
    { label: 'Total Produtos', value: loading ? '...' : String(stats?.totalProdutos ?? 0), icon: <Package className="w-5 h-5" /> },
    { label: 'Valor em Estoque', value: loading ? '...' : fmt(stats?.valorEstoque ?? 0), icon: <DollarSign className="w-5 h-5" /> },
    { label: 'Entradas (Mês)', value: loading ? '...' : String(stats?.entradasMes?.count ?? 0), icon: <PackagePlus className="w-5 h-5" /> },
    {
      label: 'Estoque Baixo',
      value: loading ? '...' : String(stats?.estoqueBaixo ?? 0),
      icon: <AlertTriangle className="w-5 h-5" />,
      color: (stats?.estoqueBaixo ?? 0) > 0 ? 'danger' : 'default',
    },
  ];

  const quickLinks = [
    { href: '/pj/estoque/entrada', label: 'Nova Entrada', icon: PackagePlus, color: 'text-green-500' },
    { href: '/pj/estoque/saida', label: 'Nova Saída', icon: PackageMinus, color: 'text-red-500' },
    { href: '/pj/estoque/transferencia', label: 'Transferência', icon: ArrowRightLeft, color: 'text-blue-500' },
    { href: '/pj/estoque/consulta', label: 'Consultar', icon: Search, color: 'text-amber-500' },
    { href: '/pj/estoque/produtos', label: 'Produtos', icon: Package, color: 'text-purple-500' },
    { href: '/pj/estoque/relatorios', label: 'Relatórios', icon: BarChart3, color: 'text-cyan-500' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Estoque" subtitle="Gestão completa de produtos e movimentações" />
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
        {/* Últimas movimentações */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Últimas Movimentações</h3>
              <Link href="/pj/estoque/consulta" className="text-xs text-primary hover:underline">Ver todas</Link>
            </div>
            {loading ? (
              <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : !stats?.recentMovements?.length ? (
              <p className="text-muted-foreground text-sm">Nenhuma movimentação registrada. Comece registrando uma entrada ou saída.</p>
            ) : (
              <div className="space-y-2">
                {stats.recentMovements.map((m: any) => {
                  const cfg = MOV_TYPE[m.type] || MOV_TYPE.ajuste;
                  const Icon = cfg.icon;
                  return (
                    <div key={m.id} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${cfg.color}`}>
                        <Icon className="w-3 h-3" /> {cfg.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{m.productName}</p>
                        <p className="text-xs text-muted-foreground">{m.productCode} · {fmtDate(m.createdAt)}</p>
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0">{m.quantity > 0 ? '+' : ''}{m.quantity}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Produtos com estoque baixo */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Estoque Crítico</h3>
              <Link href="/pj/estoque/produtos" className="text-xs text-primary hover:underline">Ver todos</Link>
            </div>
            {loading ? (
              <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : !stats?.estoqueBaixoItems?.length ? (
              <div className="flex items-center gap-2 text-green-600">
                <Package className="w-5 h-5" />
                <p className="text-sm">Todos os produtos estão com estoque adequado.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.estoqueBaixoItems.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.code}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-sm font-semibold text-red-600">{p.currentStock}</p>
                      <p className="text-xs text-muted-foreground">mín: {p.minStock}</p>
                    </div>
                  </div>
                ))}
                {stats.estoqueBaixo > 5 && (
                  <p className="text-xs text-muted-foreground pt-1">+{stats.estoqueBaixo - 5} outros produtos</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
