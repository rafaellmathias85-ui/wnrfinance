# WNR Finance — Hardening de Segurança (11/06/2026)

Registro das melhorias de segurança aplicadas ao código, do que é exigido de configuração
antes do próximo deploy, e do checklist de blindagem da VPS Azure.

Referencial normativo: Res. CMN nº 4.893/2021 (política de segurança cibernética para
instituições autorizadas pelo BACEN — adotada aqui como boas práticas), LGPD (Lei 13.709/2018)
e OWASP ASVS.

---

## 1. Backup realizado (antes de qualquer mudança)

| Item | Localização |
|---|---|
| Tag git do estado anterior | `backup/20260611-pre-hardening` (commit `3de51fc`) |
| Alterações não commitadas | `_backups/uncommitted-20260611-pre-hardening.patch` |
| Snapshot completo do código (inclui `.env`) | `_backups/wnrfinance-fullcode-20260611-pre-hardening.tgz` |

**Rollback do código:** `git checkout backup/20260611-pre-hardening` + aplicar o patch.

**Backup do banco (rodar NA VPS — não acessível daqui):**
```bash
# PM2/host: ajuste usuário/banco conforme .env de produção
pg_dump -U wnr_user -d wnr_finance -F c -f /var/backups/wnrfinance-$(date +%Y%m%d-%H%M).dump
# Docker:
docker compose exec postgres pg_dump -U wnr_user -d wnr_finance -F c > wnrfinance-$(date +%Y%m%d-%H%M).dump
```
> Recomendado: agendar via cron diário + cópia para Azure Blob Storage (lifecycle de 30 dias).

⚠️ A pasta `_backups/` contém o `.env` com segredos. Já está no `.gitignore` — **não** suba para o git.

---

## 2. O que foi alterado no código

### 2.1 Webhooks — autenticação fail-closed + idempotência (CRÍTICO)
Novo módulo `lib/webhook-security.ts`:
- **Fail-closed em produção:** webhook sem segredo configurado é **rejeitado (503)**, em vez de aceito silenciosamente.
- Comparação de tokens em tempo constante (`crypto.timingSafeEqual`).
- **Idempotência:** todo evento é registrado na nova tabela `WebhookEvent`
  (`unique(provider, eventId)`); reentregas do provedor são reconhecidas e ignoradas.
- Escape hatch temporário: `WEBHOOK_ALLOW_UNAUTHENTICATED=true` (gera log crítico a cada uso).

Rotas blindadas:
| Rota | Antes | Depois |
|---|---|---|
| `POST /api/pj/cobrancas/webhook` | **SEM autenticação** (qualquer um podia "quitar" cobranças) | Token Asaas + idempotência |
| `POST /api/webhooks/asaas` | Token só se env existisse | Fail-closed + idempotência + transação |
| `POST /api/webhooks/focusnfe` | HMAC só se env existisse | Fail-closed + idempotência |
| `POST /api/webhooks/pluggy` e `/api/pluggy/webhook` | Fail-open / sem auth | HMAC-SHA256 fail-closed |
| `POST /api/webhooks/whatsapp` | Sem autenticação | Token/HMAC opt-in + alerta crítico em produção |

### 2.2 Baixa de pagamento transacional (conciliação)
`lib/boleto.ts → processAsaasWebhook`:
- Baixa do `BoletoCharge` + `AccountsReceivable` agora é **atômica** (`$transaction`) — sem furo de conciliação.
- Eventos fora de ordem não rebaixam cobrança já paga (`PAYMENT_OVERDUE` após `PAYMENT_RECEIVED`).
- Localiza cobrança por `providerChargeId` **ou** `externalReference` (lógica unificada das duas rotas).

### 2.3 Idempotência na criação de cobranças (anti dupla cobrança)
`POST /api/pj/cobrancas`:
- Suporte ao header **`Idempotency-Key`** (coluna única `BoletoCharge.idempotencyKey`):
  retry de rede ou duplo clique retorna a cobrança já criada (HTTP 200, `idempotent: true`).
- **Guard por recebível:** segunda cobrança ativa (`pendente`/`pago`) para o mesmo `receivableId` → HTTP 409.
- Timeouts (`AbortSignal.timeout`) em TODAS as chamadas Asaas (30s) e Focus NFe (60s) —
  elimina requisição pendurada e janela de cobrança órfã no provedor.

> Frontend (opcional, recomendado): enviar `Idempotency-Key: crypto.randomUUID()` ao criar cobrança.
> Sem o header, o guard por recebível continua protegendo.

### 2.4 Segredos e superfície de ataque
- `lib/encrypt.ts`: fallback de `ENCRYPTION_KEY` agora **loga CRÍTICO em produção** e valida o tamanho da chave (32 bytes).
- `POST /api/admin/seed-alessandra` (rota one-off já usada): desativada — retorna **410**.
  Reativável apenas com `ALLOW_ONE_OFF_SEED=true`.
- `src/lib/config-validator.ts` + `instrumentation.ts`: no boot, valida a configuração de
  segurança e loga toda pendência crítica (visível em `pm2 logs wnrfinance`).

### 2.5 Concorrência e CI/CD
- `src/lib/distributed-lock.ts`: lock distribuído (Redis `SET NX` + release atômico via Lua).
  Aplicado ao sync bancário agendado (08/12/17h) — evita execução duplicada em PM2 cluster
  ou múltiplos containers. Sem Redis, degrada para o comportamento atual.
- `.github/workflows/deploy.yml`: **removido `--accept-data-loss`** do `prisma db push`.
  Mudança destrutiva de schema agora **bloqueia o deploy** em vez de apagar dados em silêncio.

### 2.6 Banco de dados (mudanças aditivas — não quebram nada)
- Nova tabela `WebhookEvent` (idempotência + trilha de auditoria de webhooks).
- Nova coluna `BoletoCharge.idempotencyKey` (nullable, unique).
- Migração SQL em `prisma/migrations/20260611230000_webhook_events_idempotency/`
  (o `db push` do deploy aplica automaticamente; a migração documenta para adoção futura do `migrate deploy`).

---

## 3. AÇÕES OBRIGATÓRIAS ANTES DO PRÓXIMO DEPLOY

1. **Local (Windows):** regenerar o Prisma Client e aplicar o schema no banco local:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
2. **Asaas:** no painel (Integrações → Webhooks), defina um *Token de autenticação*
   (`openssl rand -hex 32`) e cadastre o MESMO valor na VPS:
   ```
   ASAAS_WEBHOOK_TOKEN=<valor>
   ```
3. **Focus NFe** (se webhooks ativos): configure `FOCUSNFE_WEBHOOK_SECRET=<valor>` (mesmo segredo cadastrado no painel Focus).
4. **VPS:** adicionar as variáveis acima ao `.env` de produção (`/var/www/wnrfinance/.env`) e `pm2 reload`.
5. **Git (na sua máquina, o sandbox não conseguiu pelo lock):**
   ```bash
   del .git\index.lock   # lock órfão de 0 bytes
   git rm --cached tmp_wnrfinance_fix2.tgz tmp_deploy_wnrfinance_fix2.sh "C:Tempts_errors.txt"
   ```
6. Verificar no log de boot (`pm2 logs wnrfinance`) a saída do `[ConfigValidator]` — zero pendências críticas.

> Sem o passo 2, webhooks de pagamento serão REJEITADOS em produção (fail-closed, decisão aprovada).
> Em emergência: `WEBHOOK_ALLOW_UNAUTHENTICATED=true` restaura o comportamento antigo com log crítico.

---

## 4. Checklist de blindagem da VPS Azure (executar na infra)

### Rede (Azure NSG — portal ou CLI)
- [ ] NSG da VM: liberar **somente** 443/tcp (e 80/tcp para redirect/ACME). Negar todo o resto inbound.
- [ ] SSH (22): restringir a IP fixo do escritório ou usar **Azure Bastion**; desabilitar login por senha (`PasswordAuthentication no`), somente chave.
- [ ] PostgreSQL: nunca exposto publicamente (já está em `127.0.0.1` no compose — manter).
- [ ] Habilitar **Microsoft Defender for Cloud** (free tier já dá recomendações de postura).

### Sistema operacional
- [ ] `sudo apt update && sudo apt install -y fail2ban unattended-upgrades`
- [ ] fail2ban: jail para `sshd` e para o nginx (rate de 401/403 em `/api/auth`).
- [ ] `unattended-upgrades` ativo (patches de segurança automáticos).
- [ ] Usuário de deploy sem sudo irrestrito; runner do GitHub Actions com permissões mínimas.

### TLS / nginx
- [ ] TLS 1.2+ apenas; certificado Let's Encrypt com renovação automática (verificar timer do certbot).
- [ ] Rate limiting já existe no `nginx.conf` do repo — confirmar que o nginx DA VPS (que serve `wnrtecnologia.com.br`) aplica os mesmos `limit_req` em `/wnrfinance/app/api/`.

### Dados e continuidade (Res. 4.893 — cenários de incidente)
- [ ] `pg_dump` diário via cron + upload para **Azure Blob Storage** (conta separada, acesso restrito).
- [ ] Teste de restauração trimestral (backup que nunca foi restaurado não é backup).
- [ ] Azure Backup/snapshot semanal do disco da VM.
- [ ] Retenção de logs ≥ 90 dias (PM2 logrotate + AuditLog já existente no app).

### Monitoramento
- [ ] `pm2 install pm2-logrotate` (logs sem rotação enchem disco).
- [ ] Alerta de disponibilidade (UptimeRobot/Azure Monitor) em `https://wnrtecnologia.com.br/wnrfinance/app/login`.
- [ ] Revisar mensalmente `WebhookEvent` e `AuditLog` para anomalias.

---

## 5. Pendências recomendadas (não aplicadas — exigem janela planejada)

1. **Float → Decimal** nos 88 campos monetários (migração de dados; maior impacto em conciliação por valor).
2. **Adoção de `prisma migrate deploy`** com baseline do banco de produção (runbook sob demanda).
3. `allowDangerousEmailAccountLinking: true` no Google OAuth — avaliar desativar (pode afetar logins existentes).
4. Logger estruturado (pino) substituindo os ~131 `console.*` das APIs.
5. Corrigir `og:image` com basePath duplicado (`/wnrfinance/app/wnrfinance/app/og-image.png`).
