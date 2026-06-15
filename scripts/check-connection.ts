// Run: npx tsx scripts/check-connection.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const conn = await prisma.companyConnection.findFirst({
    where: { category: 'nfe', providerKey: 'focusnfe' },
    include: { company: { select: { name: true, cnpj: true } } },
  });

  if (!conn) {
    console.log('Nenhuma conexão Focus NFe encontrada.');
    return;
  }

  const cfg = conn.config as Record<string, any>;
  console.log('Empresa:', conn.company.name, '|', conn.company.cnpj);
  console.log('CNPJ no config:', cfg.cnpj);
  console.log('Ambiente:', cfg.environment);
  console.log('apiKey_masked:', cfg.apiKey_masked);
  console.log('status:', conn.status);
  console.log('lastError:', conn.lastError);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
