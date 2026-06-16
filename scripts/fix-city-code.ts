/**
 * Corrige o providerCityCode das ServiceFiscalRules de São Paulo (3550308)
 * para São Bernardo do Campo (3548708) — conforme orientação FocusNFe.
 *
 * Também atualiza o codigoMunicipio na CompanyConnection NF-e ativa.
 *
 * Rodar: npx ts-node -e "require('./scripts/fix-city-code')"
 * ou:    npx tsx scripts/fix-city-code.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const OLD_CODE = '3550308';
const NEW_CODE = '3548708';
const COMPANY_ID = 'cmpljtfg30000ztogxxsyzmxv';

async function main() {
  // 1. Atualiza ServiceFiscalRules
  const rules = await prisma.serviceFiscalRule.updateMany({
    where: { companyId: COMPANY_ID, providerCityCode: OLD_CODE },
    data: { providerCityCode: NEW_CODE },
  });
  console.log(`ServiceFiscalRules atualizadas: ${rules.count}`);

  // 2. Atualiza customerCityCode também se estiver errado
  const rulesCustomer = await prisma.serviceFiscalRule.updateMany({
    where: { companyId: COMPANY_ID, customerCityCode: OLD_CODE },
    data: { customerCityCode: NEW_CODE },
  });
  console.log(`ServiceFiscalRules customerCityCode atualizadas: ${rulesCustomer.count}`);

  // 3. Atualiza config da CompanyConnection NF-e para guardar o código correto
  const conn = await prisma.companyConnection.findFirst({
    where: { companyId: COMPANY_ID, category: 'nfe', isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (conn) {
    const config = (conn.config as any) || {};
    if (!config.codigoMunicipio || config.codigoMunicipio === OLD_CODE) {
      await prisma.companyConnection.update({
        where: { id: conn.id },
        data: { config: { ...config, codigoMunicipio: NEW_CODE } },
      });
      console.log(`CompanyConnection ${conn.displayName}: codigoMunicipio → ${NEW_CODE}`);
    } else {
      console.log(`CompanyConnection ${conn.displayName}: codigoMunicipio já é ${config.codigoMunicipio}`);
    }
  } else {
    console.log('Nenhuma CompanyConnection NF-e ativa encontrada');
  }

  // 4. Mostra estado final das regras
  const allRules = await prisma.serviceFiscalRule.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, name: true, providerCityCode: true, customerCityCode: true },
  });
  console.log('\nEstado final das regras:');
  allRules.forEach(r => {
    console.log(`  [${r.id.slice(-6)}] ${r.name} — providerCity=${r.providerCityCode} customerCity=${r.customerCityCode || '—'}`);
  });
}

main().finally(() => prisma.$disconnect());
