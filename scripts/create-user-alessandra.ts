import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log('Empresas encontradas:', companies);

  if (companies.length === 0) {
    console.log('Nenhuma empresa encontrada.');
    return;
  }

  const company = companies[0];
  console.log(`Usando empresa: ${company.name} (${company.id})`);

  const existing = await prisma.user.findFirst({
    where: { email: { equals: 'alessandra@wticorp.com.br', mode: 'insensitive' } },
  });

  if (existing) {
    console.log(`Usuário já existe (id: ${existing.id}). Verificando vínculo...`);
    const uc = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: existing.id, companyId: company.id } },
    });
    if (!uc) {
      await prisma.userCompany.create({
        data: { userId: existing.id, companyId: company.id, role: 'FINANCE' },
      });
      console.log('Vínculo criado com a empresa.');
    } else {
      console.log(`Já vinculado como ${uc.role}.`);
    }
    return;
  }

  const hashedPassword = await bcrypt.hash('WTI@Aless@123', 12);

  const newUser = await prisma.user.create({
    data: {
      name: 'Alessandra',
      email: 'alessandra@wticorp.com.br',
      password: hashedPassword,
      hasPJ: true,
      hasPF: false,
      allowedEnvs: 'pj',
      defaultEnv: 'pj',
      activeCompanyId: company.id,
    },
  });

  await prisma.userCompany.create({
    data: { userId: newUser.id, companyId: company.id, role: 'FINANCE' },
  });

  console.log(`✅ Usuário criado: ${newUser.name} <${newUser.email}> (id: ${newUser.id})`);
}

main()
  .catch(e => { console.error('ERRO:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
