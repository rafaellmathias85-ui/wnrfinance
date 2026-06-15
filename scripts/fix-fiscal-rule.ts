// Run: npx tsx scripts/fix-fiscal-rule.ts
// Corrige serviceCodeLc116 e providerCityCode na ServiceFiscalRule

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.serviceFiscalRule.findMany({
    where: { isActive: true },
    select: { id: true, name: true, serviceCodeLc116: true, providerCityCode: true },
  });

  console.log('Antes:');
  before.forEach((r) => console.log(`  ${r.name} | code=${r.serviceCodeLc116} | city=${r.providerCityCode}`));

  // 1.07 → 01.07  (Focus NFe exige 2 dígitos antes do ponto)
  // 3548708 → 3548807 (dígitos estavam invertidos; IBGE de São Bernardo do Campo = 3548807)
  const result = await prisma.serviceFiscalRule.updateMany({
    where: { isActive: true, serviceCodeLc116: '1.07' },
    data: { serviceCodeLc116: '01.07', providerCityCode: '3548807' },
  });

  console.log(`\nLinhas atualizadas: ${result.count}`);

  const after = await prisma.serviceFiscalRule.findMany({
    where: { isActive: true },
    select: { id: true, name: true, serviceCodeLc116: true, providerCityCode: true },
  });

  console.log('\nDepois:');
  after.forEach((r) => console.log(`  ${r.name} | code=${r.serviceCodeLc116} | city=${r.providerCityCode}`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
