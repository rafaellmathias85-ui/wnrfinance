// Feature flags — lançamento incremental por empresa, sem big-bang.
//
// Configuração por env var:
//   FEATURE_CONCILIACAO_V2=true              → ativa para todos
//   FEATURE_CONCILIACAO_V2=cmp_abc,cmp_def   → ativa só para essas companyIds
//   (ausente ou "false")                     → desativada
//
// Uso: if (isFeatureEnabled('conciliacao_v2', companyId)) { ... }

export type FeatureKey =
  | 'conciliacao_v2'
  | 'faturamento_v2'
  | 'regua_v2'
  | 'taxas_automaticas';

function envName(key: FeatureKey): string {
  return `FEATURE_${key.toUpperCase()}`;
}

export function isFeatureEnabled(key: FeatureKey, companyId?: string | null): boolean {
  const raw = (process.env[envName(key)] || '').trim();
  if (!raw || raw.toLowerCase() === 'false') return false;
  if (raw.toLowerCase() === 'true') return true;
  if (!companyId) return false;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(companyId);
}

/** Lista o estado de todas as flags (para tela de admin/debug). */
export function listFeatureFlags(companyId?: string | null): Record<FeatureKey, boolean> {
  const keys: FeatureKey[] = ['conciliacao_v2', 'faturamento_v2', 'regua_v2', 'taxas_automaticas'];
  return Object.fromEntries(keys.map((k) => [k, isFeatureEnabled(k, companyId)])) as Record<
    FeatureKey,
    boolean
  >;
}
