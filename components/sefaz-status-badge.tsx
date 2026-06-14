'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, XCircle, Wifi, WifiOff, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/fetch';
import { cn } from '@/lib/utils';

interface NFeConnection {
  id: string;
  providerKey: string;
  displayName: string | null;
  status: string | null;
  lastHealthAt: string | null;
  lastError: string | null;
  isActive: boolean;
}

interface StatusResponse {
  overall: 'ok' | 'atencao' | 'erro' | 'sem_conexao';
  connections: NFeConnection[];
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 min

function fmtRelative(iso: string | null): string {
  if (!iso) return 'nunca verificado';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export function SefazStatusBadge({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/pj/sefaz/status');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const handleVerifyNow = async () => {
    if (!data?.connections?.length) return;
    setChecking(true);
    try {
      await Promise.all(
        data.connections.map(c =>
          apiFetch(`/api/pj/connections/${c.id}`, { method: 'POST' }),
        ),
      );
      await fetchStatus();
    } finally {
      setChecking(false);
    }
  };

  if (loading && !data) return null;

  const overall = data?.overall ?? 'sem_conexao';

  if (overall === 'sem_conexao') {
    if (compact) return null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2 text-sm text-muted-foreground">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>Nenhuma conexão NFS-e configurada.</span>
        <Link href="/pj/conexoes" className="ml-1 underline underline-offset-2 hover:text-foreground flex items-center gap-0.5">
          Configurar <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  const config: Record<string, { icon: React.ReactNode; text: string; cls: string }> = {
    ok: {
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />,
      text: 'Sefaz online',
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    atencao: {
      icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />,
      text: 'Sefaz com atenção',
      cls: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    },
    erro: {
      icon: <XCircle className="h-4 w-4 text-red-500 shrink-0" />,
      text: 'Sefaz offline',
      cls: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
    },
  };

  const cfg = config[overall] ?? config.atencao;
  const lastCheck = data?.connections?.[0]?.lastHealthAt ?? null;
  const errorMsg = data?.connections?.find(c => c.lastError)?.lastError ?? null;

  if (compact) {
    return (
      <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', cfg.cls)}>
        {cfg.icon}
        {cfg.text}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3 text-sm', cfg.cls)}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {cfg.icon}
        <div className="min-w-0">
          <span className="font-medium">{cfg.text}</span>
          <span className="ml-2 opacity-70 text-xs">
            Última verificação: {fmtRelative(lastCheck)}
          </span>
          {errorMsg && overall !== 'ok' && (
            <p className="mt-0.5 truncate text-xs opacity-80" title={errorMsg}>{errorMsg}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 bg-white/50 hover:bg-white/80 dark:bg-black/20 border-current/30"
          onClick={handleVerifyNow}
          disabled={checking}
        >
          <RefreshCw className={cn('h-3 w-3', checking && 'animate-spin')} />
          {checking ? 'Verificando…' : 'Verificar agora'}
        </Button>
        <Link
          href="/pj/conexoes"
          className="inline-flex items-center gap-0.5 text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
        >
          Conexões <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
