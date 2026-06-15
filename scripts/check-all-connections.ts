// Run: npx tsx scripts/check-all-connections.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const conns = await prisma.companyConnection.findMany({
    where: { category: 'nfe' },
    include: { company: { select: { name: true, cnpj: true } } },
  });

  if (!conns.length) {
    console.log('Nenhuma conexão NF-e encontrada.');
    return;
  }

  for (const c of conns) {
    const cfg = c.config as Record<string, any>;
    console.log('---');
    console.log('id:', c.id);
    console.log('company:', c.company.name, '|', c.company.cnpj);
    console.log('providerKey:', c.providerKey);
    console.log('status:', c.status);
    console.log('cnpj config:', cfg.cnpj);
    console.log('environment:', cfg.environment);
    console.log('apiKey_masked:', cfg.apiKey_masked);
    console.log('createdAt:', c.createdAt);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
