/**
 * Diagnóstico: consulta Itaú boletoscash e exibe resposta completa.
 * Rodar no servidor: npx tsx scripts/test-itau-consult.ts
 */
import https from 'https';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { safeDecrypt } from '../lib/encrypt';

const prisma = new PrismaClient();
const COMPANY_ID = 'cmpljtfg30000ztogxxsyzmxv';

function decryptConfig(config: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.endsWith('_masked')) continue;
    result[key] = typeof value === 'string' && value.length > 30
      ? (safeDecrypt(value) ?? value)
      : value;
  }
  return result;
}

function httpsRequest(urlStr: string, options: any): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(urlStr);
    const req = https.request({
      method: options.method,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      headers: options.headers,
      agent: options.agent,
      timeout: 30_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(Buffer.from(c)));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  // Pega as últimas cobranças Itaú da empresa
  const charges = await prisma.boletoCharge.findMany({
    where: { companyId: COMPANY_ID, providerKey: 'itau' },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, nossoNumero: true, itauBoletoId: true, boletoUrl: true, status: true },
  });
  console.log('\nÚltimas cobranças Itaú:', JSON.stringify(charges, null, 2));

  // Pega credenciais
  let clientId: string, clientSecret: string, certPath: string, keyPath: string, idBeneficiario: string;

  const conn = await prisma.companyConnection.findFirst({
    where: { companyId: COMPANY_ID, category: 'boleto', isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (conn && conn.providerKey === 'itau') {
    const cfg = decryptConfig(conn.config as any);
    clientId      = cfg.clientId;
    clientSecret  = cfg.clientSecret;
    certPath      = cfg.certPath;
    keyPath       = cfg.keyPath;
    idBeneficiario = cfg.idBeneficiario;
    console.log('\nCredenciais: via CompanyConnection');
  } else {
    clientId      = process.env.ITAU_CLIENT_ID ?? '';
    clientSecret  = process.env.ITAU_CLIENT_SECRET ?? '';
    certPath      = process.env.ITAU_CERT_PATH ?? '';
    keyPath       = process.env.ITAU_KEY_PATH ?? '';
    idBeneficiario = process.env.ITAU_ID_BENEFICIARIO ?? '';
    console.log('\nCredenciais: via env vars (sem CompanyConnection Itaú)');
  }

  console.log(`clientId: ${clientId?.slice(0, 8)}... certPath: ${certPath} keyPath: ${keyPath} idBeneficiario: ${idBeneficiario}`);

  if (!clientId || !certPath) {
    console.error('Credenciais incompletas! Verifique CompanyConnection ou env vars.');
    return;
  }

  const cert = fs.readFileSync(certPath);
  const key  = fs.readFileSync(keyPath);
  const agent = new https.Agent({ cert, key, rejectUnauthorized: true });

  // OAuth token
  const tokenRes = await httpsRequest('https://sts.itau.com.br/api/oauth/token', {
    method: 'POST', agent,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-itau-correlationID': randomUUID(), 'x-itau-flowID': randomUUID() },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
  });
  console.log(`\nToken HTTP ${tokenRes.status}`);
  const tokenData = JSON.parse(tokenRes.body);
  const token = tokenData.access_token;
  if (!token) { console.error('Sem access_token:', tokenRes.body.slice(0, 300)); return; }
  console.log('Token obtido:', token.slice(0, 20) + '...');

  // Consulta por nosso_numero
  const charge = charges[0];
  if (!charge?.nossoNumero) { console.log('Sem nossoNumero'); return; }

  const nossoStr = charge.nossoNumero.toString().padStart(8, '0');

  // 1. Consulta padrão
  const qs1 = new URLSearchParams({ id_beneficiario: idBeneficiario, codigo_carteira: '109', nosso_numero: nossoStr }).toString();
  const r1 = await httpsRequest(`https://secure.api.cloud.itau.com.br/boletoscash/v2/boletos?${qs1}`, {
    method: 'GET', agent,
    headers: { Authorization: `Bearer ${token}`, 'x-itau-apikey': clientId, 'Content-Type': 'application/json', 'x-itau-correlationID': randomUUID(), 'x-itau-flowID': randomUUID() },
  });
  console.log(`\n[consulta boletoscash] HTTP ${r1.status}`);
  console.log('Resposta:', r1.body.slice(0, 2000));

  // 2. Se tem itauBoletoId, tenta por GUID
  if (charge.itauBoletoId) {
    const r2 = await httpsRequest(`https://secure.api.cloud.itau.com.br/boletoscash/v2/boletos/${charge.itauBoletoId}`, {
      method: 'GET', agent,
      headers: { Authorization: `Bearer ${token}`, 'x-itau-apikey': clientId, 'Content-Type': 'application/json', 'x-itau-correlationID': randomUUID(), 'x-itau-flowID': randomUUID() },
    });
    console.log(`\n[consulta por id_boleto] HTTP ${r2.status}`);
    console.log('Resposta:', r2.body.slice(0, 2000));
  }

  // 3. Tenta emission endpoint para ver se retorna URL
  const r3 = await httpsRequest(`https://api.itau.com.br/cash_management/v2/boletos/${charge.itauBoletoId || nossoStr}`, {
    method: 'GET', agent,
    headers: { Authorization: `Bearer ${token}`, 'x-itau-apikey': clientId, 'Content-Type': 'application/json', 'x-itau-correlationID': randomUUID(), 'x-itau-flowID': randomUUID() },
  });
  console.log(`\n[consulta cash_management] HTTP ${r3.status}`);
  console.log('Resposta:', r3.body.slice(0, 2000));
}

main().finally(() => prisma.$disconnect());
