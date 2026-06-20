/**
 * ensure-fiscal-config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * BLINDAGEM FISCAL — Winner Soluções em Tecnologia (CNPJ 21.147.041/0001-85)
 *
 * Script idempotente que VERIFICA e opcionalmente RESTAURA:
 *   1. CompanyConnection Focus NFe (category=nfe, providerKey=focusnfe, environment=producao)
 *   2. ServiceFiscalRule para serviços de TI via GINFES SBC (LC 116 item 1.07)
 *
 * USO:
 *   npx tsx scripts/ensure-fiscal-config.ts
 *
 *   Apenas verifica (leitura):
 *     MODE=check npx tsx scripts/ensure-fiscal-config.ts
 *
 *   Restaura a conexão Focus NFe (requer token em env):
 *     FOCUSNFE_RESTORE_TOKEN=XPEpmrVSI... MODE=restore npx tsx scripts/ensure-fiscal-config.ts
 *
 * CONTEXTO:
 *   - Token Focus NFe produção: armazenado CRIPTOGRAFADO no DB (AES-256-GCM via ENCRYPTION_KEY)
 *   - Este script NUNCA loga o token em texto plano; usa FOCUSNFE_RESTORE_TOKEN apenas para
 *     re-criptografar caso o DB seja resetado.
 *   - Município: São Bernardo do Campo (IBGE 3548708), sistema GINFES
 *   - codigoTributarioMunicipio: "1.07/102320/1234" (Decreto ISS SBC, serviço TI LC116 1.07)
 *   - regimeEspecialTributacao: 6 (ME/EPP Simples Nacional) — Focus NFe XSD rejeita valor 0
 *   - numero_rps offset: +10000 (evita colisão com Bom Controle que usa 1-1721 na série '1')
 *   - Último NFS-e emitido: 2637 (20/06/2026)
 *
 * HISTÓRICO DE ERROS GINFES resolvidos:
 *   E10  → numero_rps colide com Bom Controle → usar offset +10000
 *   E160 → environment=homologacao (Focus NFe SBC sandbox não tem cert) → usar producao
 *   E183 → campo codigo_tributario_municipio ausente → sempre enviar
 *   E166 → regime_especial_tributacao ausente → enviar 6 para Simples Nacional
 *   E35  → codigo_tributario_municipio errado → usar "1.07/102320/1234"
 *   E16  → data com "Z" UTC → usar offset "-0300"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from '@prisma/client';
import { encrypt } from '../lib/encrypt';

const prisma = new PrismaClient();

// ─── Configurações canônicas da Winner Soluções ───────────────────────────────
const WINNER_CNPJ = '21147041000185';
const WINNER_IM = '298481';
const WINNER_MUNICIPIO_IBGE = '3548708'; // São Bernardo do Campo
const WINNER_MUNICIPIO_NOME = 'São Bernardo do Campo';
const WINNER_UF = 'SP';

const FOCUSNFE_PROVIDER_KEY = 'focusnfe';
const FOCUSNFE_ENVIRONMENT = 'producao';
const FOCUSNFE_CONNECTION_NAME = 'Focus NFe — Winner Soluções (Produção)';

const FISCAL_RULE_NAME = 'TI — LC 116 item 1.07 — GINFES SBC';
const SERVICE_CODE_LC116 = '1.07';
const CODIGO_TRIBUTARIO_MUNICIPIO = '1.07/102320/1234';
const REGIME_ESPECIAL_TRIBUTACAO = 6; // ME/EPP Simples Nacional (Focus NFe XSD: 1-6 only)
const ISS_RATE = 2; // 2% ISS — verificar com contador
const NATUREZA_OPERACAO = '1'; // 1 = tributação no município
const TAX_REGIME = 'simples_nacional';
const CUSTOMER_CITY_CODE = '3548708'; // tomador padrão SBC (ajustar por cliente)

type CheckResult = {
  name: string;
  ok: boolean;
  action: 'none' | 'restored' | 'needs_manual';
  detail: string;
};

async function findCompany(): Promise<{ id: string; name: string } | null> {
  return prisma.company.findFirst({
    where: { cnpj: { contains: WINNER_CNPJ } },
    select: { id: true, name: true },
  });
}

// ─── Check 1: Focus NFe connection ───────────────────────────────────────────
async function checkNFeConnection(
  companyId: string,
  mode: string,
): Promise<CheckResult> {
  const conn = await prisma.companyConnection.findFirst({
    where: { companyId, category: 'nfe', providerKey: FOCUSNFE_PROVIDER_KEY, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!conn) {
    if (mode === 'restore') {
      const token = process.env.FOCUSNFE_RESTORE_TOKEN;
      if (!token) {
        return {
          name: 'Focus NFe Connection',
          ok: false,
          action: 'needs_manual',
          detail: 'Conexão ausente. Para restaurar, defina FOCUSNFE_RESTORE_TOKEN e re-execute com MODE=restore.',
        };
      }
      const encryptedToken = encrypt(token);
      await prisma.companyConnection.create({
        data: {
          companyId,
          name: FOCUSNFE_CONNECTION_NAME,
          category: 'nfe',
          providerKey: FOCUSNFE_PROVIDER_KEY,
          isActive: true,
          status: 'ativo',
          config: {
            apiKey: encryptedToken,
            apiKey_masked: `${token.slice(0, 4)}••••${token.slice(-4)}`,
            environment: FOCUSNFE_ENVIRONMENT,
            inscricaoMunicipal: WINNER_IM,
            codigoMunicipio: WINNER_MUNICIPIO_IBGE,
            regimeEspecialTributacao: REGIME_ESPECIAL_TRIBUTACAO,
          },
        },
      });
      return {
        name: 'Focus NFe Connection',
        ok: true,
        action: 'restored',
        detail: `Conexão criada: providerKey=${FOCUSNFE_PROVIDER_KEY}, environment=${FOCUSNFE_ENVIRONMENT}`,
      };
    }
    return {
      name: 'Focus NFe Connection',
      ok: false,
      action: 'needs_manual',
      detail: 'CONEXÃO AUSENTE — Acesse Conexões → NF-e/NFS-e e reconfigure o Focus NFe (producao).',
    };
  }

  const cfg = conn.config as Record<string, any>;
  const env = cfg.environment || 'desconhecido';
  const im = cfg.inscricaoMunicipal || cfg.inscricao_municipal || '';
  const codMun = cfg.codigoMunicipio || cfg.codigo_municipio || '';

  const issues: string[] = [];
  if (env !== FOCUSNFE_ENVIRONMENT) issues.push(`environment=${env} (esperado: producao)`);
  if (im !== WINNER_IM) issues.push(`inscricaoMunicipal="${im}" (esperado: ${WINNER_IM})`);
  if (codMun !== WINNER_MUNICIPIO_IBGE) issues.push(`codigoMunicipio="${codMun}" (esperado: ${WINNER_MUNICIPIO_IBGE})`);

  if (issues.length > 0) {
    if (mode === 'restore') {
      await prisma.companyConnection.update({
        where: { id: conn.id },
        data: {
          config: {
            ...cfg,
            environment: FOCUSNFE_ENVIRONMENT,
            inscricaoMunicipal: WINNER_IM,
            codigoMunicipio: WINNER_MUNICIPIO_IBGE,
            regimeEspecialTributacao: REGIME_ESPECIAL_TRIBUTACAO,
          },
        },
      });
      return {
        name: 'Focus NFe Connection',
        ok: true,
        action: 'restored',
        detail: `Campos corrigidos: ${issues.join(', ')}`,
      };
    }
    return {
      name: 'Focus NFe Connection',
      ok: false,
      action: 'needs_manual',
      detail: `Campos incorretos: ${issues.join(', ')}. Execute com MODE=restore para corrigir.`,
    };
  }

  return {
    name: 'Focus NFe Connection',
    ok: true,
    action: 'none',
    detail: `OK — id=${conn.id}, env=${env}, IM=${im}, IBGE=${codMun}`,
  };
}

// ─── Check 2: ServiceFiscalRule ───────────────────────────────────────────────
async function checkFiscalRule(companyId: string, mode: string): Promise<CheckResult> {
  const rule = await prisma.serviceFiscalRule.findFirst({
    where: { companyId, isActive: true },
    orderBy: { isDefault: 'desc' },
  });

  if (!rule) {
    if (mode === 'restore') {
      await prisma.serviceFiscalRule.create({
        data: {
          companyId,
          name: FISCAL_RULE_NAME,
          isActive: true,
          isDefault: true,
          serviceCodeLc116: SERVICE_CODE_LC116,
          cnae: '6201500',
          codigoTributarioMunicipio: CODIGO_TRIBUTARIO_MUNICIPIO,
          providerCityCode: WINNER_MUNICIPIO_IBGE,
          providerMunicipalRegistration: WINNER_IM,
          customerCityCode: CUSTOMER_CITY_CODE,
          operationNature: NATUREZA_OPERACAO,
          taxRegime: TAX_REGIME,
          isSimplesNacional: true,
          issRate: ISS_RATE,
          issWithheld: false,
          inssRate: 0,
          irrfRate: 0,
          csllRate: 0,
          pisRate: 0,
          cofinsRate: 0,
          cbsRate: 0,
          ibsRate: 0,
          regimeEspecialTributacao: REGIME_ESPECIAL_TRIBUTACAO,
        },
      });
      return {
        name: 'ServiceFiscalRule',
        ok: true,
        action: 'restored',
        detail: `Regra criada: "${FISCAL_RULE_NAME}", serviceCode=${SERVICE_CODE_LC116}, codigoTributario=${CODIGO_TRIBUTARIO_MUNICIPIO}`,
      };
    }
    return {
      name: 'ServiceFiscalRule',
      ok: false,
      action: 'needs_manual',
      detail: 'REGRA FISCAL AUSENTE — Acesse Configurações → Fiscal → Regras de Serviço e recrie a regra TI 1.07.',
    };
  }

  const issues: string[] = [];
  if (rule.serviceCodeLc116 !== SERVICE_CODE_LC116) issues.push(`serviceCodeLc116="${rule.serviceCodeLc116}" (esperado: ${SERVICE_CODE_LC116})`);
  if ((rule as any).codigoTributarioMunicipio !== CODIGO_TRIBUTARIO_MUNICIPIO) {
    issues.push(`codigoTributarioMunicipio="${(rule as any).codigoTributarioMunicipio}" (esperado: ${CODIGO_TRIBUTARIO_MUNICIPIO})`);
  }
  if ((rule as any).regimeEspecialTributacao !== REGIME_ESPECIAL_TRIBUTACAO) {
    issues.push(`regimeEspecialTributacao=${(rule as any).regimeEspecialTributacao} (esperado: ${REGIME_ESPECIAL_TRIBUTACAO})`);
  }
  if (!rule.providerMunicipalRegistration || rule.providerMunicipalRegistration !== WINNER_IM) {
    issues.push(`providerMunicipalRegistration="${rule.providerMunicipalRegistration}" (esperado: ${WINNER_IM})`);
  }
  if (!rule.providerCityCode || rule.providerCityCode !== WINNER_MUNICIPIO_IBGE) {
    issues.push(`providerCityCode="${rule.providerCityCode}" (esperado: ${WINNER_MUNICIPIO_IBGE})`);
  }

  if (issues.length > 0 && mode === 'restore') {
    await prisma.serviceFiscalRule.update({
      where: { id: rule.id },
      data: {
        serviceCodeLc116: SERVICE_CODE_LC116,
        codigoTributarioMunicipio: CODIGO_TRIBUTARIO_MUNICIPIO,
        providerCityCode: WINNER_MUNICIPIO_IBGE,
        providerMunicipalRegistration: WINNER_IM,
        regimeEspecialTributacao: REGIME_ESPECIAL_TRIBUTACAO,
        isSimplesNacional: true,
        isActive: true,
        isDefault: true,
      } as any,
    });
    return {
      name: 'ServiceFiscalRule',
      ok: true,
      action: 'restored',
      detail: `Campos corrigidos na regra "${rule.name}": ${issues.join(', ')}`,
    };
  }

  if (issues.length > 0) {
    return {
      name: 'ServiceFiscalRule',
      ok: false,
      action: 'needs_manual',
      detail: `Divergências em "${rule.name}": ${issues.join(', ')}`,
    };
  }

  return {
    name: 'ServiceFiscalRule',
    ok: true,
    action: 'none',
    detail: `OK — id=${rule.id}, name="${rule.name}", serviceCode=${rule.serviceCodeLc116}`,
  };
}

// ─── Check 3: FOCUSNFE_WEBHOOK_SECRET env var ─────────────────────────────────
function checkWebhookSecret(): CheckResult {
  const secret = process.env.FOCUSNFE_WEBHOOK_SECRET;
  const EXPECTED_SECRET = '697fbc2dd22cb5648d9ad71f548bb15caae38f29b153e11aa66cb41b8bd278ef';
  if (!secret) {
    return {
      name: 'FOCUSNFE_WEBHOOK_SECRET',
      ok: false,
      action: 'needs_manual',
      detail: 'AUSENTE — Adicione ao ecosystem.config.js: FOCUSNFE_WEBHOOK_SECRET=697fbc2dd22cb5648d9ad71f548bb15caae38f29b153e11aa66cb41b8bd278ef',
    };
  }
  if (secret !== EXPECTED_SECRET) {
    return {
      name: 'FOCUSNFE_WEBHOOK_SECRET',
      ok: false,
      action: 'needs_manual',
      detail: 'VALOR INCORRETO — Valor diverge do esperado. Verifique ecosystem.config.js no VPS.',
    };
  }
  return {
    name: 'FOCUSNFE_WEBHOOK_SECRET',
    ok: true,
    action: 'none',
    detail: 'OK — secret configurado corretamente',
  };
}

// ─── Check 4: ENCRYPTION_KEY env var ─────────────────────────────────────────
function checkEncryptionKey(): CheckResult {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    return {
      name: 'ENCRYPTION_KEY',
      ok: false,
      action: 'needs_manual',
      detail: 'AUSENTE — Sem esta chave, tokens Focus NFe e boleto não podem ser descriptografados.',
    };
  }
  const buf = Buffer.from(key, 'base64');
  if (buf.length !== 32) {
    return {
      name: 'ENCRYPTION_KEY',
      ok: false,
      action: 'needs_manual',
      detail: `INVÁLIDA — Esperado 32 bytes em base64, encontrado ${buf.length} bytes.`,
    };
  }
  return {
    name: 'ENCRYPTION_KEY',
    ok: true,
    action: 'none',
    detail: 'OK — chave AES-256 válida',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const mode = process.env.MODE || 'check';
  console.log(`\n${'═'.repeat(60)}`);
  console.log(` WNR Finance — Blindagem Fiscal (MODE=${mode.toUpperCase()})`);
  console.log(`${'═'.repeat(60)}`);
  console.log(` Empresa: Winner Soluções (CNPJ ${WINNER_CNPJ})`);
  console.log(` Município: ${WINNER_MUNICIPIO_NOME} (IBGE ${WINNER_MUNICIPIO_IBGE})`);
  console.log(`${'═'.repeat(60)}\n`);

  const company = await findCompany();
  if (!company) {
    console.error(`❌ CRÍTICO: Empresa com CNPJ ${WINNER_CNPJ} não encontrada no banco.`);
    console.error('   Verifique se o DB está correto e a empresa foi criada.');
    process.exit(1);
  }
  console.log(`✓ Empresa encontrada: "${company.name}" (id=${company.id})\n`);

  const results: CheckResult[] = [
    checkEncryptionKey(),
    checkWebhookSecret(),
    await checkNFeConnection(company.id, mode),
    await checkFiscalRule(company.id, mode),
  ];

  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    const actionTag = r.action === 'restored' ? ' [RESTAURADO]' : r.action === 'needs_manual' ? ' [AÇÃO MANUAL]' : '';
    console.log(`${icon} ${r.name}${actionTag}`);
    console.log(`   ${r.detail}\n`);
    if (!r.ok) allOk = false;
  }

  console.log('═'.repeat(60));
  if (allOk) {
    console.log(' ✅ Configuração fiscal OK — sistema pronto para emissão NFS-e');
  } else {
    console.log(' ❌ Há configurações pendentes — veja os itens [AÇÃO MANUAL] acima');
    if (mode === 'check') {
      console.log('\n💡 Para restaurar automaticamente o que for possível:');
      console.log('   FOCUSNFE_RESTORE_TOKEN=<token> MODE=restore npx ts-node ... scripts/ensure-fiscal-config.ts');
    }
  }
  console.log('═'.repeat(60) + '\n');

  process.exit(allOk ? 0 : 1);
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
