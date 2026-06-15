// Run: npx tsx scripts/check-fiscal-rules.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rules = await prisma.serviceFiscalRule.findMany({
    where: { isActive: true },
  });

  if (!rules.length) {
    console.log('Nenhuma ServiceFiscalRule ativa encontrada.');
    return;
  }

  for (const r of rules) {
    console.log('---');
    console.log('id:', r.id);
    console.log('name:', r.name);
    console.log('serviceCodeLc116:', r.serviceCodeLc116);
    console.log('providerCityCode:', r.providerCityCode);
    console.log('providerMunicipalRegistration:', r.providerMunicipalRegistration);
    console.log('issRate:', r.issRate);
    console.log('issWithheld:', r.issWithheld);
    console.log('isDefault:', r.isDefault);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
