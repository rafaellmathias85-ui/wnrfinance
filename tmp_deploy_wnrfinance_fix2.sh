#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/wnrfinance"
PACKAGE="/tmp/tmp_wnrfinance_fix2.tgz"
BACKUP_DIR="/tmp/wnrfinance-backups"
TS="$(date +%Y%m%d-%H%M%S)"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

echo "== Backup pre-deploy =="
tar --exclude='./node_modules' --exclude='./.next' -czf "$BACKUP_DIR/source-$TS.tgz" \
  app components hooks lib prisma package.json package-lock.json next.config.js middleware.ts Dockerfile deploy.sh 2>/dev/null || true
echo "Backup: $BACKUP_DIR/source-$TS.tgz"

echo "== Extraindo pacote =="
tar -xzf "$PACKAGE" -C "$APP_DIR"

echo "== Dependencias =="
npm install --legacy-peer-deps

echo "== Prisma generate =="
npx prisma generate

echo "== Build Next =="
export NEXT_BASE_PATH="/wnrfinance/app"
export NEXT_PUBLIC_BASE_PATH="/wnrfinance/app"
export NEXT_OUTPUT_MODE="standalone"
npm run build

echo "== Sincronizando standalone assets =="
rm -rf .next/standalone/.next/static .next/standalone/public
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/static
if [ -d public ]; then
  cp -R public .next/standalone/public
fi

echo "== Banco de dados =="
npx prisma db push

echo "== Seed minimo IA =="
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const users = await prisma.user.findMany({ select: { id: true } });
  let created = 0;
  for (const user of users) {
    const exists = await prisma.aIProvider.findFirst({
      where: {
        userId: user.id,
        name: 'AbacusAI',
        endpoint: 'https://apps.abacus.ai/v1/chat/completions',
      },
      select: { id: true },
    });
    if (exists) continue;
    const total = await prisma.aIProvider.count({ where: { userId: user.id } });
    await prisma.aIProvider.create({
      data: {
        userId: user.id,
        name: 'AbacusAI',
        model: process.env.ABACUSAI_MODEL || 'gpt-5.4-mini',
        endpoint: 'https://apps.abacus.ai/v1/chat/completions',
        apiKey: '',
        priority: 1,
        weight: 100,
        capabilities: ['general', 'fast', 'complex'],
        isBuiltIn: true,
        isActive: true,
        sortOrder: total,
      },
    });
    created++;
  }
  const providers = await prisma.aIProvider.count();
  console.log(JSON.stringify({ users: users.length, providers, created }));
})()
  .catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE

echo "== Restart PM2 =="
pm2 restart wnrfinance --update-env
pm2 status wnrfinance

echo "Deploy concluido"
