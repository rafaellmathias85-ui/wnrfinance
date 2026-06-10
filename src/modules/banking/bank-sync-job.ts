import { prisma } from '@/lib/prisma';
import { bankingService } from './banking.service';

let bankSyncTimer: NodeJS.Timeout | null = null;

export async function runBankSyncJob() {
  if (process.env.BANK_SYNC_ENABLED === 'false') {
    return { enabled: false, processed: 0, imported: 0, errors: 0 };
  }

  const connections = await prisma.bankConnection.findMany({
    where: {
      status: { in: ['ACTIVE', 'active'] },
      connectionMode: { in: ['API', 'api'] },
    },
  });

  const retryAttempts = Number(process.env.BANK_RETRY_ATTEMPTS || 3);
  let imported = 0;
  let errors = 0;

  for (const connection of connections) {
    if (connection.personType === 'PF') continue;

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const result = await bankingService.syncConnection({
          userId: connection.userId,
          companyId: connection.companyId,
          connectionId: connection.id,
          automatic: true,
        });
        imported += result.imported;
        lastError = null;
        break;
      } catch (error: any) {
        lastError = error;
        if (attempt < retryAttempts) {
          await delay(500 * attempt);
        }
      }
    }

    if (lastError) {
      errors++;
      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: {
          status: 'ERROR',
          syncError: (lastError as any)?.message || 'Erro na sincronização automática',
        },
      });
    }
  }

  return {
    enabled: true,
    processed: connections.length,
    imported,
    errors,
  };
}

export function startBankSyncJob() {
  if (bankSyncTimer) return bankSyncTimer;
  if (process.env.BANK_SYNC_ENABLED === 'false') return null;

  const intervalMinutes = Number(process.env.BANK_SYNC_INTERVAL_MINUTES || 240);
  bankSyncTimer = setInterval(() => {
    runBankSyncJob().catch(() => {
      // Job failures are recorded per connection; the process must keep running.
    });
  }, intervalMinutes * 60_000);

  return bankSyncTimer;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
