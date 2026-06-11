import cron from 'node-cron';
import { prisma } from '@/lib/prisma';
import { bankingController } from '@/src/modules/banking/banking.controller';

let initialized = false;

/**
 * Agenda sincronização automática de extratos bancários:
 * 08:00, 12:00 e 17:00 no horário de Brasília (America/Sao_Paulo).
 * Só sincroniza conexões com autoExtrato=true em extraConfig.
 */
export function scheduleBankSync(): void {
  if (initialized) return;
  initialized = true;

  const schedules = [
    { time: '0 8 * * *', label: '08:00' },
    { time: '0 12 * * *', label: '12:00' },
    { time: '0 17 * * *', label: '17:00' },
  ];

  for (const { time, label } of schedules) {
    cron.schedule(time, () => void runBankSync(), {
      timezone: 'America/Sao_Paulo',
    });
  }

  console.log(
    '[BankSync] Sincronização automática agendada: 08:00, 12:00, 17:00 (Horário de Brasília)',
  );
}

async function runBankSync(): Promise<void> {
  // Lock distribuído: evita sync duplicado quando há mais de uma instância
  // (PM2 cluster / múltiplos containers). TTL 30min cobre a janela do job.
  const { acquireLock } = await import('@/src/lib/distributed-lock');
  const release = await acquireLock('bank-sync', 30 * 60 * 1000);
  if (!release) {
    console.log('[BankSync] Outra instância já está executando o sync — pulando.');
    return;
  }

  try {
    await runBankSyncInner();
  } finally {
    await release();
  }
}

async function runBankSyncInner(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log(`[BankSync] Iniciando sincronização automática — ${startedAt}`);

  let candidates: Array<{
    id: string;
    userId: string;
    companyId: string | null;
    bankName: string;
    extraConfig: unknown;
  }>;

  try {
    candidates = await prisma.bankConnection.findMany({
      where: {
        connectionMode: 'API',
        personType: 'PJ',
        status: { notIn: ['DISABLED', 'ERROR'] },
      },
      select: { id: true, userId: true, companyId: true, bankName: true, extraConfig: true },
    });
  } catch (err: any) {
    console.error('[BankSync] Erro ao buscar conexões:', err?.message);
    return;
  }

  // Sync all active API connections. autoExtrato em extraConfig é um opt-out futuro;
  // por padrão todas as conexões API ativas são sincronizadas.
  const toSync = candidates.filter(c => (c.extraConfig as any)?.autoExtrato !== false);

  if (toSync.length === 0) {
    console.log('[BankSync] Nenhuma conta com autoExtrato habilitado.');
    return;
  }

  console.log(`[BankSync] ${toSync.length} conta(s) para sincronizar.`);

  for (const conn of toSync) {
    try {
      const result = await bankingController.syncConnection({
        userId: conn.userId,
        companyId: conn.companyId,
        connectionId: conn.id,
        automatic: true,
      });
      console.log(
        `[BankSync] ✓ ${conn.bankName}: importadas=${result.imported}, puladas=${result.skipped}`,
      );
    } catch (err: any) {
      console.error(`[BankSync] ✗ ${conn.bankName}: ${err?.message}`);
    }
  }

  console.log(`[BankSync] Sincronização concluída — ${new Date().toISOString()}`);
}
