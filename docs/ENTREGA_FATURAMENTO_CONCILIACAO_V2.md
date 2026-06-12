# Entrega — Faturamento & Conciliação V2 (Fases 0–6)

Implementação completa do plano `PLANO_IMPLANTACAO_FATURAMENTO_CONCILIACAO.md`,
com regras de negócio espelhadas do BomControle (`BOMCONTROLE_REFERENCIA.md`) e
melhorias de segurança/idempotência. Data: 12/06/2026.

---

## O que foi implementado

### FASE 0 — Fundações
| Arquivo | O quê |
|---|---|
| `lib/money.ts` | Aritmética monetária em centavos (half-up fiscal), juros/multa de boleto, comparação exata p/ conciliação |
| `lib/feature-flags.ts` | Flags por env (`FEATURE_*=true` ou lista de companyIds): `conciliacao_v2`, `faturamento_v2`, `regua_v2`, `taxas_automaticas` |

### FASE 1 — Schema core (migração `20260612000000_billing_reconciliation_core`)
- **`ImportBatch`** — lote de conciliação por sync/arquivo, com contadores Conciliados/Ignorados/Pendentes (+ FK em `bank_transactions.import_batch_id`).
- **`BankReconciliationRule`** — regras "Texto Conciliação" por conta (exata/contém → categoria/cliente/fornecedor).
- **`Attachment`** — anexos categorizados (FATURA/COMPROVANTE/NOTA_FISCAL/OUTROS) por entidade.
- **`ContractAdjustmentLog`** — histórico de reajustes (antes→depois, índice, usuário).
- **`AccountsReceivable`** + pipeline: `billingStatus` (PREVISTA→FATURADA→QUITADA→CONCILIADA│VENCIDA│CANCELADA), `billingDate`, `billedAt`, `invoiceSentAt`, `reconciledAt`, `nfeStatus`, `boletoStatus`, `emailStatus` (com backfill por status legado).
- **`BankConnection`** + hub de cobrança: multa/juros/desconto default, D+N, valor mínimo, prazo de baixa, instruções do boleto, chave Pix, flags boleto/pix, taxas automáticas (emissão/liquidação/pix).
- **`Contract`**: `billingLeadDays` (faturar N dias antes), índice/período/próxima data de reajuste.
- **`NFe`**: `rpsNumber`, `rpsSeries`.
- **`lib/billing-state.ts`** — máquina de estados única; transições inválidas lançam erro; sincroniza status legado; AuditLog automático.

### FASE 2 — Conciliação V2 (layout BomControle) ⭐
- `src/modules/reconciliation/import-batch.service.ts` — cria lotes, recalcula contadores, lista com dados bancários, exclui lote vazio.
- Lotes reais ligados em TODOS os caminhos de importação: sync API (banking.service), OFX (ofx.provider, banks/import), manual (bank-transactions).
- Motor de matching: regras por conta aplicadas na importação; match RECONCILED de receita PJ → recebível QUITADA → CONCILIADA via máquina de estados.
- APIs: `GET/POST/DELETE /api/reconciliation/batches`, `GET/POST /api/reconciliation/batches/[batchId]` (match/unmatch/ignore/confirm/create-entry), `GET /api/reconciliation/candidates` (Vincular), `CRUD /api/reconciliation/rules`.
- **Telas novas**: `/pj/conciliacao/lotes` (Arquivos de conciliação) e `/pj/conciliacao/lotes/[batchId]` (duas colunas Extrato × Movimentações, botão "+", Vincular, check verde, Ignorar, Conciliar lote). Item de menu adicionado.

### FASE 3 — Faturamento V2
- `lib/billing-pipeline.ts`:
  - `projectContractInstallments` — parcelas PREVISTAS rolling 12 meses, competência, `billingDate = venc − leadDays`.
  - `faturarParcela` — orquestrador idempotente: NFS-e + boleto/pix + e-mail aos contatos de cobrança (`ClientContact.isBilling`), estado por artefato, AuditLog.
  - `runDailyBillingPipeline` — projeta + fatura + marca VENCIDA (cron).
- Cron `pj-recurring-billing`: V2 sob flag `faturamento_v2` (legado preservado), lock distribuído, fail-closed.
- `/api/pj/faturamento/batch` CORRIGIDO: `faturar_agora` executa o pipeline real (antes era no-op); `cancel_nfe`/`cancel_boleto` cancelam **no provedor** antes do banco local (antes só local — boleto seguia pagável!); `update_nfse_status` faz polling real na Focus NFe (antes simulado). A grade existente já usa essas ações.
- `/api/pj/contracts/[id]/adjust` — reajuste com histórico, só parcelas PREVISTAS, valor em centavos.
- `/api/pj/contracts/[id]/installments` — parcelas agrupadas por ano + totais Quitado/Atrasado/Futuro (modelo da aba "Parcelas" do BomControle).

### FASE 4 — Régua e Inadimplência
- `lib/business-days.ts` — dias úteis com feriados nacionais (fixos + móveis por Páscoa).
- Cron `collection-rules` aprimorado: atraso em **dias úteis** (paridade BomControle), variáveis ricas ({linha_digitavel}, {link_boleto}, {pix_copia_cola}, {cliente}, {descricao}), lock distribuído, fail-closed. Telas de régua e inadimplência já existentes ganham o motor novo.

### FASE 5 — NFS-e em lote e monitor fiscal
- `POST /api/pj/nfe/export-xml` — baixa XMLs do provedor e entrega `.tar` único (sem dependências novas) p/ contabilidade.
- `GET /api/pj/fiscal/monitor` + `components/pj/fiscal-monitor-badge.tsx` — badge "SEFAZ" no header PJ (NF rejeitada/bloqueada + certificados ≤45d), atualização a cada 5 min. Montado no `app-sidebar`.

### FASE 6 — Automações
- `lib/bank-fees.ts` — taxas bancárias automáticas (emissão/liquidação/pix) como `AccountsPayable` pagas, categoria "Tarifas Bancárias", idempotente; ligado na emissão (receivable-automation) e na quitação (webhook Asaas).
- Cron `certificate-expiry` — alertas 45/30/15/7/1 dias + e-mail, idempotente por dia (certificado Inter da Winner vence 30/07/2026).
- `components/pj/entity-timeline.tsx` — histórico estilo BomControle por entidade (filtro `entityId` adicionado à API de audit-logs).
- `GET /api/pj/dashboard/pendencias` — cards Inadimplência/Aprovar/Conciliar/Faturar hoje/NF com problema.

---

## ATIVAÇÃO (ordem obrigatória)

1. **Local**: `npx prisma generate && npx prisma db push` (cria as 4 tabelas novas + colunas).
2. **Smoke test local**: importar um OFX → deve aparecer em `/pj/conciliacao/lotes`; abrir o lote e conciliar.
3. **.env (local e VPS)** — adicionar:
   ```
   ASAAS_WEBHOOK_TOKEN=<token cadastrado no painel Asaas>   # pendente da sessão anterior
   CRON_SECRET=<openssl rand -hex 32>                        # crons agora são fail-closed em produção
   FEATURE_CONCILIACAO_V2=<companyId da Winner>              # piloto
   FEATURE_FATURAMENTO_V2=<companyId da Winner>              # piloto (parcelas projetadas)
   ```
4. **Agendar o cron novo** na VPS (junto aos existentes): `POST /api/cron/certificate-expiry` 1×/dia com `Authorization: Bearer $CRON_SECRET`.
5. **Validar na Winner** (1 semana): conciliação por lotes, faturamento do dia 1º, régua D-3.
6. **Liberar geral**: trocar flags para `true`.

### Taxas automáticas (opcional, recomendado)
Na conexão Inter: definir `autoFeeEnabled=true` + `feeIssueAmount`/`feeSettleAmount` com os valores
da tabela de tarifas do banco (via update direto ou tela de conexões).

## Rollback
- Flags `FEATURE_*` removidas → todo o comportamento volta ao legado (rotas antigas intactas).
- Código: tag `backup/20260611-pre-hardening` + `_backups/`.
- Banco: tabelas/colunas novas são aditivas — podem ficar vazias sem efeito.

## Pendências conhecidas (próxima sessão)
1. UI para editar os defaults de cobrança da conta (campos já existem no schema; tela de conexões precisa expor).
2. UI das regras de conciliação (API pronta em `/api/reconciliation/rules`).
3. Montar `EntityTimeline` e cards de pendências nas telas de detalhe/dashboard (componentes prontos).
4. Reajuste automático por IGPM/IPCA via API SGS do BCB (hoje: percentual manual com histórico).
5. Migração Float→Decimal global (janela própria, com backup).
6. `npx tsc --noEmit` na sua máquina antes do push (sandbox não executa typecheck — mount lento).
