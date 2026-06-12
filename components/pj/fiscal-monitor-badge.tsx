'use client';

// Badge "SEFAZ" (paridade BomControle): contador de pendências fiscais no header PJ.
// NF rejeitadas/bloqueadas + certificados digitais a vencer (≤45 dias).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/fetch';

export function FiscalMonitorBadge() {
  const router = useRouter();
  const [data, setData] = useState<{ totalIssues: number; certificates: any[] } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await apiFetch('/api/pj/fiscal/monitor');
        if (res.ok && active) setData(await res.json());
      } catch {
        /* silencioso */
      }
    };
    load();
    const interval = setInterval(load, 5 * 60 * 1000); // a cada 5 min
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (!data) return null;

  const ok = data.totalIssues === 0;
  const certWarning = data.certificates?.[0];

  return (
    <button
      type="button"
      onClick={() => router.push('/pj/fiscal')}
      title={
        ok
          ? 'Situação fiscal em dia'
          : `${data.totalIssues} pendência(s) fiscal(is)` +
            (certWarning ? ` · Certificado ${certWarning.expired ? 'VENCIDO' : `vence em ${certWarning.daysToExpire}d`}` : '')
      }
      className="relative flex items-center justify-center rounded-md p-2 hover:bg-muted"
    >
      {ok ? (
        <ShieldCheck className="h-5 w-5 text-green-600" />
      ) : (
        <ShieldAlert className="h-5 w-5 text-amber-500" />
      )}
      {!ok && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {data.totalIssues}
        </span>
      )}
    </button>
  );
}
