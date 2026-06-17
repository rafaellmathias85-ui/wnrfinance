/**
 * Teste isolado de emissão NFS-e via FocusNFe (sem inscricao_municipal)
 */
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

async function main() {
  const conn = await prisma.companyConnection.findFirst({
    where: { companyId: COMPANY_ID, category: 'nfe', isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!conn) { console.log('Sem conexão NFS-e'); return; }

  const config = decryptConfig(conn.config as any);
  const apiKey = config.apiKey || config.token;
  const env = config.environment || 'homologacao';
  const cnpj = (config.cnpj || '').replace(/\D/g, '');
  const baseUrl = env === 'homologacao'
    ? 'https://homologacao.focusnfe.com.br'
    : 'https://api.focusnfe.com.br';

  const ref = `nfse_diag_${Date.now()}`;
  console.log(`\nConexão: ${conn.displayName} | env=${env} | cnpj=${cnpj}`);
  console.log(`apiKey (primeiros 8): ${apiKey?.slice(0, 8)}... | ref=${ref}`);
  console.log(`inscricaoMunicipal na config: ${config.inscricaoMunicipal || '(não definida)'}\n`);

  // Tenta COM inscricao_municipal vazia vs sem o campo
  const inscricaoMunicipal = config.inscricaoMunicipal || '';
  const body = {
    data_emissao: new Date().toISOString(),
    prestador: {
      cnpj,
      ...(inscricaoMunicipal ? { inscricao_municipal: inscricaoMunicipal } : {}),
      codigo_municipio: '3548708', // São Bernardo do Campo (IBGE correto)
    },
    tomador: {
      cpf: '05221282461',
      razao_social: 'Rafael Lombardi',
      email: 'rafaellmathias85@gmail.com',
      municipio: 'São Bernardo do Campo',
      uf: 'SP',
      codigo_municipio: '3548708',
    },
    servico: {
      aliquota: 2,
      base_calculo: 100,
      discriminacao: 'Serviços de tecnologia da informação — TESTE',
      iss_retido: '2',
      item_lista_servico: '1.07',
      valor_servicos: 100,
      valor_deducoes: 0,
      valor_iss: 2,
      codigo_municipio: '3548708', // São Bernardo do Campo
    },
  };

  console.log('Body enviado:', JSON.stringify(body, null, 2));
  console.log('\nEnviando para FocusNFe...\n');

  const res = await fetch(`${baseUrl}/v2/nfse?ref=${ref}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log(`Status HTTP: ${res.status}`);
  try { console.log('Resposta:', JSON.stringify(JSON.parse(text), null, 2)); }
  catch { console.log('Resposta raw:', text.slice(0, 500)); }
}

main().finally(() => prisma.$disconnect());
