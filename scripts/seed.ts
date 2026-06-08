import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('admin123', 10);

  // Admin user — PF + PJ
  const user = await prisma.user.upsert({
    where: { email: 'admin@wnrfinance.local' },
    update: {},
    create: {
      email: 'admin@wnrfinance.local',
      name: 'Admin WNR',
      password: passwordHash,
      role: 'admin',
      hasPF: true,
      hasPJ: true,
      allowedEnvs: 'both',
      defaultEnv: 'pj',
    },
  });
  console.log('User:', user.email);

  // Demo company
  const company = await prisma.company.upsert({
    where: { cnpj: '12345678000195' },
    update: {},
    create: {
      name: 'WNR Finance Demo Ltda',
      tradeName: 'WNR Finance Demo',
      cnpj: '12345678000195',
      email: 'contato@wnrdemo.com.br',
      phone: '(11) 99999-0000',
      segment: 'Tecnologia',
    },
  });
  console.log('Company:', company.name);

  // Link user ↔ company
  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: user.id, companyId: company.id } },
    update: {},
    create: { userId: user.id, companyId: company.id, role: 'OWNER', isActive: true },
  });

  // Set active company on user
  await prisma.user.update({
    where: { id: user.id },
    data: { activeCompanyId: company.id },
  });

  // Subscription pro
  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, plan: 'pro', status: 'active' },
  });

  console.log('Done! Login: admin@wnrfinance.local / admin123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
