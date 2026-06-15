// Run on VPS: npx tsx scripts/fix-tokens-correct.ts
// Atualiza TODAS as conexões focusnfe com os tokens corretos (com capitalização certa)
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encrypt, maskSecret } from '../lib/encrypt';

const prisma = new PrismaClient();

const TOKEN_HOMOLOGACAO = 'luV8HhnJNmr6RuvkPNA6CBEZSLWxyz42';
const TOKEN_PRODUCAO    = 'XPEpmrVSI5hSl3d6D8qGYC32qSolg12n';

async function main() {
  const conns = await prisma.companyConnection.findMany({
    where: { category: 'nfe', providerKey: 'focusnfe' },
  });

  console.log(`Conexões encontradas: ${conns.length}`);

  for (const conn of conns) {
    const cfg = (conn.config as Record<string, any>) ?? {};
    const env = cfg.environment || 'homologacao';
    const token = env === 'producao' ? TOKEN_PRODUCAO : TOKEN_HOMOLOGACAO;

    await prisma.companyConnection.update({
      where: { id: conn.id },
      data: {
        config: {
          ...cfg,
          apiKey: encrypt(token),
          apiKey_masked: maskSecret(token),
          environment: env,
        },
        isActive: true,
        status: 'ok',
        lastError: null,
      },
    });

    console.log(`✓ [${conn.id}] env=${env} token=${token.slice(0, 8)}...`);
  }

  console.log('Concluído.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
