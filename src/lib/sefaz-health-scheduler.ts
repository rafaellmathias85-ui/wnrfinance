import cron from 'node-cron';
import { prisma } from '@/lib/prisma';
import { safeDecrypt } from '@/lib/encrypt';
import { acquireLock } from '@/src/lib/distributed-lock';

let initialized = false;

/**
 * Agenda verificação automática de conectividade Sefaz/Focus NFe.
 * Roda a cada 30 minutos e atualiza status + lastHealthAt + lastError
 * em cada CompanyConnection de categoria "nfe".
 */
export function scheduleSefazHealth(): void {
  if (initialized) return;
  initialized = true;

  cron.schedule('*/30 * * * *', () => void runSefazHealth(), {
    timezone: 'America/Sao_Paulo',
  });

  console.log('[SefazHealth] Health check agendado: a cada 30 minutos');
}

async function runSefazHealth(): Promise<void> {
  const release = await acquireLock('sefaz-health', 10 * 60 * 1000);
  if (!release) {
    console.log('[SefazHealth] Outra instância já executando — pulando.');
    return;
  }

  try {
    await runSefazHealthInner();
  } finally {
    await release();
  }
}

async function runSefazHealthInner(): Promise<void> {
  const connections = await prisma.companyConnection.findMany({
    where: { isActive: true, category: 'nfe' },
    select: { id: true, providerKey: true, config: true, companyId: true },
  });

  if (connections.length === 0) return;

  console.log(`[SefazHealth] Verificando ${connections.length} conexão(ões) NFS-e`);

  for (const conn of connections) {
    try {
      const result = await checkNFeConnection(conn.providerKey, conn.config as Record<string, any>);
      await prisma.companyConnection.update({
        where: { id: conn.id },
        data: {
          status: result.status,
          lastHealthAt: new Date(),
          lastError: result.error ?? null,
        },
      });
      console.log(`[SefazHealth] ${conn.providerKey} (${conn.id}): ${result.status}`);
    } catch (err: any) {
      await prisma.companyConnection.update({
        where: { id: conn.id },
        data: { status: 'erro', lastHealthAt: new Date(), lastError: err?.message ?? 'Erro desconhecido' },
      });
      console.error(`[SefazHealth] ✗ ${conn.providerKey}: ${err?.message}`);
    }
  }
}

async function checkNFeConnection(
  providerKey: string,
  rawConfig: Record<string, any>,
): Promise<{ status: 'ok' | 'atencao' | 'erro'; error?: string }> {
  const config = decryptConfig(rawConfig);

  if (providerKey === 'focusnfe') {
    const token = config.token || config.apiKey || '';
    if (!token) return { status: 'atencao', error: 'Token não configurado' };

    const baseUrl =
      config.environment === 'producao'
        ? 'https://api.focusnfe.com.br'
        : 'https://homologacao.focusnfe.com.br';

    const encoded = Buffer.from(`${token}:`).toString('base64');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(`${baseUrl}/v2/nfse?ref=wnrfinance-healthcheck`, {
        headers: { Authorization: `Basic ${encoded}` },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);

      if (res.status === 401 || res.status === 403) {
        return { status: 'erro', error: `Credenciais inválidas (HTTP ${res.status})` };
      }
      // 2xx ou 4xx (exceto 401/403) = API alcançável e token válido
      if (res.status >= 500) {
        return { status: 'atencao', error: `Focus NFe com instabilidade (HTTP ${res.status})` };
      }
      return { status: 'ok' };
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        return { status: 'erro', error: 'Tempo limite excedido ao conectar ao Focus NFe' };
      }
      return { status: 'erro', error: e?.message };
    }
  }

  // Provedores sem health check implementado
  return { status: 'atencao', error: 'Verificação automática não disponível para este provedor' };
}

function decryptConfig(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.endsWith('_masked')) continue;
    out[k] = typeof v === 'string' && v.length > 30 ? (safeDecrypt(v) ?? v) : v;
  }
  return out;
}
