// Run on VPS: npx tsx scripts/test-decrypt-token.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { safeDecrypt, maskSecret } from '../lib/encrypt';

const prisma = new PrismaClient();

async function main() {
  const conns = await prisma.companyConnection.findMany({
    where: { category: 'nfe', providerKey: 'focusnfe', isActive: true },
    include: { company: { select: { name: true, cnpj: true } } },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`ENCRYPTION_KEY presente: ${!!process.env.ENCRYPTION_KEY}`);
  console.log(`NEXTAUTH_SECRET presente: ${!!process.env.NEXTAUTH_SECRET}`);
  console.log('');

  for (const conn of conns) {
    const cfg = conn.config as Record<string, any>;
    console.log(`[${conn.id}] ${conn.company.name}`);
    console.log(`  cnpj: ${cfg.cnpj}`);
    console.log(`  environment: ${cfg.environment}`);
    console.log(`  apiKey length: ${cfg.apiKey?.length}`);

    const decrypted = safeDecrypt(cfg.apiKey);
    if (decrypted) {
      console.log(`  decrypt OK: ${maskSecret(decrypted)}`);
    } else {
      console.log(`  decrypt FALHOU — apiKey raw: ${String(cfg.apiKey).slice(0, 20)}...`);
    }
    console.log('');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
