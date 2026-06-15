// Run on VPS: npx tsx scripts/fix-all-nfe-connections.ts
// Corrige TODAS as conexões focusnfe: cnpj, environment, apiKey (com dotenv carregado)

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encrypt, maskSecret } from '../lib/encrypt';

const prisma = new PrismaClient();

const CNPJ_EMITENTE = '21147041000185';
const TOKEN_HOMOLOGACAO = 'luV8HhnjNmr6RuvkPNA6CBEZSLWxyz42';

async function main() {
  const conns = await prisma.companyConnection.findMany({
    where: { category: 'nfe', providerKey: 'focusnfe' },
    include: { company: { select: { name: true, cnpj: true } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Total conexões focusnfe: ${conns.length}`);

  const encryptedToken = encrypt(TOKEN_HOMOLOGACAO);
  const maskedToken = maskSecret(TOKEN_HOMOLOGACAO);

  for (const conn of conns) {
    const cfg = conn.config as Record<string, any>;
    console.log(`\n[${conn.id}] ${conn.company.name} (${conn.company.cnpj})`);
    console.log(`  isActive: ${conn.isActive} | status: ${conn.status}`);
    console.log(`  cnpj config: ${cfg.cnpj} | env: ${cfg.environment}`);

    await prisma.companyConnection.update({
      where: { id: conn.id },
      data: {
        isActive: true,
        config: {
          ...cfg,
          cnpj: CNPJ_EMITENTE,
          environment: 'homologacao',
          apiKey: encryptedToken,
          apiKey_masked: maskedToken,
        },
        status: 'ok',
        lastError: null,
      },
    });

    console.log(`  ✓ Corrigido: cnpj=${CNPJ_EMITENTE}, env=homologacao, isActive=true`);
  }

  console.log('\nTodas as conexões corrigidas.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
