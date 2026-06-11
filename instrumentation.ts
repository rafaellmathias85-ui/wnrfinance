/**
 * Next.js instrumentation hook — executado uma vez na inicialização do servidor.
 * Usado para registrar o agendador de sincronização bancária automática.
 */
export async function register() {
  // Só roda no runtime Node.js (não no Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { scheduleBankSync } = await import('./src/lib/bank-sync-scheduler');
    scheduleBankSync();
  }
}
