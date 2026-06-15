// Run on VPS: npx tsx scripts/fix-focusnfe-connection.ts
// Corrige: CNPJ (wrong digits), environment (producao→homologacao), token (producao→homologacao)
// O script anterior não carregou .env, então FOCUSNFE_SANDBOX era undefined → gravou producao errado

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encrypt, maskSecret } from '../lib/encrypt';

const prisma = new PrismaClient();

// CNPJ correto da Winner Soluções em Tecnologia conforme cadastro no Focus NFe
const CNPJ_EMITENTE = '21147041000185';

// Token homologação (FOCUSNFE_SANDBOX=true no .env do VPS)
const TOKEN_HOMOLOGACAO = 'luV8HhnjNmr6RuvkPNA6CBEZSLWxyz42';

async function main() {
  const conn = await prisma.companyConnection.findFirst({
    where: { category: 'nfe', providerKey: 'focusnfe' },
    include: { company: { select: { id: true, name: true, cnpj: true } } },
  });

  if (!conn) {
    console.log('Nenhuma conexão Focus NFe encontrada.');
    return;
  }

  console.log('Empresa no DB:', conn.company.name, '|', conn.company.cnpj);
  console.log('Conexão ID:', conn.id);

  const existingConfig = (conn.config as Record<string, any>) ?? {};
  console.log('\nConfig atual:');
  console.log('  cnpj:', existingConfig.cnpj);
  console.log('  environment:', existingConfig.environment);
  console.log('  apiKey_masked:', existingConfig.apiKey_masked);

  const encryptedToken = encrypt(TOKEN_HOMOLOGACAO);

  await prisma.companyConnection.update({
    where: { id: conn.id },
    data: {
      config: {
        ...existingConfig,
        cnpj: CNPJ_EMITENTE,
        environment: 'homologacao',
        apiKey: encryptedToken,
        apiKey_masked: maskSecret(TOKEN_HOMOLOGACAO),
      },
      status: 'ok',
      lastError: null,
    },
  });

  console.log('\nConfig atualizada:');
  console.log('  cnpj:', CNPJ_EMITENTE);
  console.log('  environment: homologacao');
  console.log('  token:', TOKEN_HOMOLOGACAO.slice(0, 8) + '...');
  console.log('\n✓ Conexão corrigida com sucesso.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
