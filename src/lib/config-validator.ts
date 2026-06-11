// Validação de configuração de segurança no boot do servidor.
// Não derruba o app (evita indisponibilidade), mas loga com severidade
// CRÍTICA tudo que viola a política de segurança em produção.
// Alinhado à Res. CMN nº 4.893/2021 (política de segurança cibernética).

interface ConfigCheck {
  name: string;
  ok: boolean;
  severity: 'critical' | 'warning';
  message: string;
}

export function validateSecurityConfig(): ConfigCheck[] {
  const isProd = process.env.NODE_ENV === 'production';
  const checks: ConfigCheck[] = [];

  const add = (name: string, ok: boolean, severity: 'critical' | 'warning', message: string) =>
    checks.push({ name, ok, severity, message });

  add(
    'NEXTAUTH_SECRET',
    !!process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_SECRET.length >= 32,
    'critical',
    'NEXTAUTH_SECRET ausente ou curto demais (mínimo 32 chars — openssl rand -base64 32)',
  );

  add(
    'ENCRYPTION_KEY',
    !!process.env.ENCRYPTION_KEY,
    'critical',
    'ENCRYPTION_KEY ausente — criptografia de credenciais usando fallback derivado de NEXTAUTH_SECRET',
  );

  add(
    'ASAAS_WEBHOOK_TOKEN',
    !!process.env.ASAAS_WEBHOOK_TOKEN || !process.env.ASAAS_API_KEY,
    'critical',
    'ASAAS_WEBHOOK_TOKEN ausente com Asaas ativo — webhooks de pagamento serão REJEITADOS em produção (fail-closed)',
  );

  add(
    'FOCUSNFE_WEBHOOK_SECRET',
    !!process.env.FOCUSNFE_WEBHOOK_SECRET || !process.env.FOCUSNFE_TOKEN,
    'critical',
    'FOCUSNFE_WEBHOOK_SECRET ausente com Focus NFe ativo — webhooks fiscais serão REJEITADOS em produção (fail-closed)',
  );

  add(
    'INTERNAL_API_SECRET',
    !!process.env.INTERNAL_API_SECRET,
    'warning',
    'INTERNAL_API_SECRET ausente — rotas internas (cron/sync) sem autenticação dedicada',
  );

  add(
    'WEBHOOK_ALLOW_UNAUTHENTICATED',
    process.env.WEBHOOK_ALLOW_UNAUTHENTICATED !== 'true' || !isProd,
    'critical',
    'WEBHOOK_ALLOW_UNAUTHENTICATED=true em produção — webhooks aceitos sem autenticação. Remova esta exceção.',
  );

  add(
    'REDIS_URL',
    !!process.env.REDIS_URL || !!process.env.UPSTASH_REDIS_REST_URL,
    'warning',
    'Redis não configurado — rate limiting degradado para memória local (não compartilhado entre instâncias)',
  );

  // Relatório no log
  const failures = checks.filter((c) => !c.ok);
  if (failures.length === 0) {
    console.log('[ConfigValidator] ✓ Configuração de segurança OK');
  } else {
    for (const f of failures) {
      const prefix = f.severity === 'critical' ? 'CRÍTICO' : 'ALERTA';
      const log = f.severity === 'critical' && isProd ? console.error : console.warn;
      log(`[ConfigValidator] ${prefix}: ${f.name} — ${f.message}`);
    }
  }

  return checks;
}
