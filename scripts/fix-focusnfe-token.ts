// Run on VPS: npx tsx scripts/fix-focusnfe-token.ts
// Atualiza o token Focus NFe na CompanyConnection com os tokens da aba TOKENS do portal

import { PrismaClient } from '@prisma/client';
import { encrypt, maskSecret } from '../lib/encrypt';

const prisma = new PrismaClient();

const TOKENS = {
  homologacao: 'luV8HhnjNmr6RuvkPNA6CBEZSLWxyz42',
  producao: 'XPEpmrVSI5hSl3d6D8qGYC32qSoIg12n',
};

// Use o ambiente correto conforme FOCUSNFE_SANDBOX no .env
const ENV = process.env.FOCUSNFE_SANDBOX === 'true' ? 'homologacao' : 'producao';
const TOKEN = TOKENS[ENV];

async function main() {
  const conn = await prisma.companyConnection.findFirst({
    where: { category: 'nfe', providerKey: 'focusnfe' },
    include: { company: { select: { id: true, name: true, cnpj: true } } },
  });

  if (!conn) {
    console.log('Nenhuma conexão Focus NFe encontrada no banco.');
    return;
  }

  console.log(`Empresa: ${conn.company.name} (${conn.company.cnpj})`);
  console.log(`Conexão ID: ${conn.id}`);
  console.log(`Ambiente detectado: ${ENV}`);
  console.log(`Token a usar: ${TOKEN.slice(0, 8)}...`);

  const existingConfig = (conn.config as Record<string, any>) ?? {};

  await prisma.companyConnection.update({
    where: { id: conn.id },
    data: {
      config: {
        ...existingConfig,
        apiKey: encrypt(TOKEN),
        apiKey_masked: maskSecret(TOKEN),
        cnpj: conn.company.cnpj.replace(/\D/g, ''), // garante dígitos apenas
        environment: ENV,
      },
      status: 'ok',
      lastError: null,
    },
  });

  console.log('✓ Conexão atualizada com sucesso.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
