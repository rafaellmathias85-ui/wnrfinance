# WnrFinance — Plano de Implantação: Faturamento, NFS-e, Boletos e Conciliação

Processo passo a passo para implantar TODOS os procedimentos e configurações mapeados do
BomControle (`docs/BOMCONTROLE_REFERENCIA.md`), com as interligações entre módulos.
Cada passo traz: objetivo, mudanças de schema, backend, frontend, interligações e critérios de aceite.

**Decisão de produto (Rafael):** o método e o layout de conciliação do BomControle (lotes +
duas colunas) substituem o modelo atual do WnrFinance.

**Convenções:** todas as migrações são ADITIVAS (não quebram produção). Todo passo termina com
typecheck + teste manual + deploy. Valores monetários novos nascem como `Decimal @db.Decimal(15,2)`.

---

## FASE 0 — Fundações (pré-requisitos de tudo)

### Passo 0.1 — Ativar o hardening já aplicado
- [ ] Rodar local: `npx prisma generate && npx prisma db push` (cria `WebhookEvent` + `idempotencyKey`).
- [ ] Painel Asaas → Webhooks: criar token; setar `ASAAS_WEBHOOK_TOKEN` no `.env` da VPS.
- [ ] Conferir `[ConfigValidator]` no `pm2 logs wnrfinance` (zero críticos).
- **Aceite:** webhook de teste do Asaas responde 200 com token e 401 sem token.

### Passo 0.2 — Padronizar dinheiro como Decimal (módulos novos) e centavos no domínio
- [ ] Criar helper `lib/money.ts` (parse/format/compare em centavos; tolerância 0 para igualdade).
- [ ] Campos novos das fases seguintes: sempre `Decimal @db.Decimal(15,2)`.
- [ ] (Planejado, não bloqueante) Migração Float→Decimal dos campos existentes envolvidos em
      conciliação: `BankTransaction.amount`, `AccountsReceivable.amount/amountReceived`,
      `BoletoCharge.amount/paidAmount` — em janela própria, com backup.
- **Aceite:** `lib/money.ts` com testes unitários de arredondamento (banker's rounding não; usar half-up fiscal).

### Passo 0.3 — Feature flags
- [ ] Tabela `FeatureFlag` (companyId, key, enabled) ou env vars `FEATURE_*` simples.
- [ ] Flags: `conciliacao_v2`, `faturamento_v2`, `regua_v2`, `taxas_automaticas`.
- **Interligação:** permite lançar módulo a módulo em produção sem big-bang.
- **Aceite:** rota antiga e nova convivem; flag liga/desliga por empresa.

---

## FASE 1 — Modelo de dados (espinha dorsal das interligações)

### Passo 1.1 — Lote de conciliação (`ImportBatch`)
O conceito central do BomControle que falta no WnrFinance.
```prisma
model ImportBatch {
  id               String    @id @default(cuid())
  companyId        String?
  userId           String
  bankConnectionId String?
  source           String    // API_INTER, API_ITAU, OFX, CSV, MANUAL
  type             String    @default("AUTOMATICO") // AUTOMATICO, MANUAL
  status           String    @default("PENDENTE")   // PENDENTE, PARCIAL, CONCILIADO
  periodStart      DateTime
  periodEnd        DateTime
  totalCount       Int       @default(0)
  reconciledCount  Int       @default(0)
  ignoredCount     Int       @default(0)
  pendingCount     Int       @default(0)
  fileName         String?   // OFX/CSV manual
  createdAt        DateTime  @default(now())
  finishedAt       DateTime?
  @@index([companyId, createdAt])
  @@index([bankConnectionId])
}
```
- [ ] `BankTransaction.importBatchId` (já existe!) passa a ser preenchido SEMPRE pelo sync e pela importação OFX/CSV.
- [ ] Backfill: agrupar transações históricas em lotes sintéticos por (conexão, dia de importação).
- [ ] Contadores recalculados por trigger de aplicação (service) a cada mudança de status da transação.
- **Interligações:** banking.service (sync 08/12/17h) cria 1 lote por execução/conta; tela de
  conciliação v2 lê lotes; dashboard mostra "Conciliar: N pendentes".
- **Aceite:** todo sync gera lote com contadores corretos; OFX manual idem.

### Passo 1.2 — Regras de conciliação por conta (`ReconciliationRule` v2)
- [ ] Migrar/estender o service atual para tabela:
```prisma
model BankReconciliationRule {
  id               String  @id @default(cuid())
  bankConnectionId String? // null = regra global da empresa
  companyId        String?
  userId           String
  type             String  // RECEITA, DESPESA
  matchText        String
  exactMatch       Boolean @default(false)
  categoryId       String?
  clientId         String?
  supplierId       String?
  departmentId     String? // costCenter
  paymentMethod    String?
  priority         Int     @default(0)
  isActive         Boolean @default(true)
}
```
- **Interligações:** aplicada no momento da IMPORTAÇÃO (normalizador de transações) e re-aplicável
  em lote pendente; alimenta o auto-match do Passo 2.2.
- **Aceite:** transação com texto casado entra já categorizada/sugerida.

### Passo 1.3 — Estados e carimbos da parcela/fatura
- [ ] `AccountsReceivable`: adicionar `billedAt DateTime?`, `billingStatus String @default("PREVISTA")`
      (PREVISTA, FATURADA, QUITADA, CONCILIADA, VENCIDA, CANCELADA), `reconciledAt DateTime?`,
      `competence String?` (MM/AAAA), `invoiceSentAt DateTime?`, `contractId String?` + relation.
- [ ] Máquina de estados única em `lib/billing-state.ts` (transições válidas + quem pode acioná-las):
```
PREVISTA → FATURADA → QUITADA → CONCILIADA
FATURADA → VENCIDA → QUITADA
*qualquer* → CANCELADA (com cancelamento de NF e boleto em cascata controlada)
```
- **Interligações:** webhook Asaas/Inter marca QUITADA; conciliação marca CONCILIADA (e grava
  `reconciledAt`); cron de vencimento marca VENCIDA; cancelamento valida artefatos.
- **Aceite:** transição inválida lança erro; histórico registrado no AuditLog.

### Passo 1.4 — Contatos de cobrança e anexos categorizados
- [ ] `ClientContact` (já existe) ganha flag `isBillingContact Boolean @default(false)`.
- [ ] `Attachment` model genérico: entityType/entityId, category (FATURA, COMPROVANTE, NOTA_FISCAL, OUTROS),
      `applyToAllInstallments Boolean`, url, uploadedBy.
- **Interligações:** envio de fatura usa os contatos de cobrança; anexos aparecem no detalhe do recebível.
- **Aceite:** e-mail de fatura vai para todos os contatos marcados.

### Passo 1.5 — Defaults de cobrança na conta bancária
- [ ] `BankConnection` (ou nova `BankAccountBillingConfig` 1:1): `finePercent Decimal`,
      `monthlyInterestPercent Decimal`, `discountValue Decimal?`, `discountDaysBefore Int?`,
      `settlementBusinessDays Int?` (D+N), `minPaymentValue Decimal?`, `writeOffDays Int?`
      (prazo p/ baixa), `boletoInstructions String?`, `pixKey String?`, `boletoEnabled Boolean`,
      `pixEnabled Boolean`, `autoFeeEnabled Boolean`.
- **Interligações:** emissão de boleto (lib/boleto.ts) lê os defaults da CONTA quando a cobrança
  não especifica; taxas automáticas (Passo 6.1) leem `autoFeeEnabled`.
- **Aceite:** boleto emitido sem multa explícita herda a multa da conta.

> Migração única da Fase 1: `prisma/migrations/<ts>_billing_reconciliation_core/`.

---

## FASE 2 — CONCILIAÇÃO V2 (prioridade nº 1 — layout BomControle)

### Passo 2.1 — Tela "Arquivos de conciliação" (lista de lotes)
- [ ] Rota `app/(app)/pj/conciliacao/page.tsx` (e PF equivalente) listando `ImportBatch`:
      colunas Empresa | Tipo (AUTOMÁTICO/MANUAL) | Status | Data/hora | Banco+agência+conta |
      Período | Conciliados | Ignorados | Pendentes | Total | ações (abrir, baixar OFX original, excluir lote vazio).
- [ ] Filtros: empresa, status, conta, período. Botão **Importar** (OFX/CSV) já existente plugado aqui.
- **Aceite:** lote do sync de hoje 08:00 aparece com contadores; clicar abre o detalhe.

### Passo 2.2 — Motor de matching (aproveita e centraliza o existente)
- [ ] `src/modules/reconciliation/matching.service.ts`:
      score = valor exato (peso 50) + janela de data ±3d (20) + similaridade descrição/cliente (20)
      + regra de conta casada (10). ≥90 auto-match (SUGGESTED→RECONCILED se config permitir),
      60–89 SUGERIDO, <60 pendente.
  - Fontes de candidatos: `AccountsReceivable` FATURADA/VENCIDA, `AccountsPayable` pendente,
    `BoletoCharge` paga (via webhook) ainda não conciliada, Expense/Income (PF).
- [ ] Idempotente por lote (re-rodar não duplica `Reconciliation`).
- **Interligações:** roda automaticamente ao fim de cada sync (banking.service) e ao importar OFX;
  marca recebível CONCILIADA via máquina de estados (Passo 1.3).
- **Aceite:** pagamento de boleto Inter de ontem aparece auto-conciliado no lote de hoje.

### Passo 2.3 — Tela "Conciliação Extrato" (duas colunas, estilo BomControle)
- [ ] Rota `app/(app)/pj/conciliacao/[batchId]/page.tsx`:
  - Coluna esquerda **Extrato**: descrição do banco, data | valor, borda verde (crédito) /
    vermelha (débito), botão **“+”** = criar lançamento novo pré-preenchido a partir da linha
    (abre modal de Receita/Despesa com data/valor/descrição/conta travados).
  - Coluna direita **Movimentações não conciliadas**: card do candidato com descrição completa
    ("Recebimento DO(A) <cliente> NO VALOR R$X (PARCELA FIXA TODO DIA N)"), desconto/acréscimo,
    data | valor; conector visual tracejado; **check verde** = aceitar sugestão;
    campo **Vincular** = busca manual (autocomplete por cliente/valor/nº doc);
    ações: ver documento, editar, ignorar (status IGNORED), quitar+conciliar ($).
  - Filtros topo: Tipo (crédito/débito), Status (pendente/sugerido/conciliado/ignorado), busca.
  - Rodapé: **Conciliar** (confirma todas as sugestões aceitas do lote, em transação) | Voltar.
- [ ] API: `GET /api/pj/reconciliation/batches/[id]` (pares extrato×candidatos),
      `POST .../match` (vincular), `POST .../ignore`, `POST .../confirm` (lote), `POST .../create-entry`.
- [ ] Todas as confirmações em `$transaction` + AuditLog; contadores do lote atualizados.
- **Interligações:** confirmar conciliação de receita → recebível CONCILIADA → reflete no
  detalhe da fatura ("Conciliado em DD/MM") e no dashboard.
- **Aceite (paridade BomControle):** usuário concilia um lote inteiro só com ENTER/cliques nos
  checks; criar lançamento pelo “+” concilia na hora; ignorar remove dos pendentes.

### Passo 2.4 — Aposentar a tela antiga
- [ ] Redirect da rota antiga para a v2 quando flag `conciliacao_v2` ativa; remover após 2 semanas.
- **Aceite:** nenhum fluxo restante aponta para a tela antiga.

---

## FASE 3 — FATURAMENTO V2 (grade operacional unificada)

### Passo 3.1 — Geração de parcelas projetadas do contrato
- [ ] Service `lib/contract-installments.ts`: a partir de `Contract` (billingDay, billingCycle,
      startDate/endDate), materializar `AccountsReceivable` PREVISTA com `competence`,
      `dueDate` (dia de vencimento) e **`billingDate` = dueDate − `billingLeadDays`**.
- [ ] `Contract`: adicionar `billingLeadDays Int @default(4)`, `installmentsGenerated Int`,
      `adjustmentIndex String?` (NENHUM, IGPM, IPCA, MANUAL), `adjustmentPeriod String?`,
      `nextAdjustmentDate DateTime?`.
- [ ] Cron mensal estende a projeção (rolling 12 meses para contratos sem término).
- [ ] Detalhe do contrato: aba **Parcelas** agrupada por ano (como BomControle) com status por parcela.
- **Interligações:** billing-automation deixa de criar recebível na hora e passa a FATURAR parcelas
  PREVISTAS cuja `billingDate <= hoje` (dedupe já existente preservado).
- **Aceite:** contrato mensal dia 5 com lead 4 gera parcela 07/2026 com faturamento 01/07 e venc. 05/07.

### Passo 3.2 — Pipeline "Faturar" (orquestrador único e idempotente)
- [ ] `lib/billing-pipeline.ts` — função `faturarParcela(receivableId)`:
      1. valida estado PREVISTA/elegível; 2. emite NFS-e se `contract.requiresNFe`
      (usa `fiscalRuleId` herdada — receivable-automation existente); 3. emite boleto/pix se
      `requiresBoleto` (Idempotency-Key = receivableId, defaults da conta — Passo 1.5);
      4. monta fatura PDF; 5. envia e-mail/WhatsApp aos contatos de cobrança; 6. marca FATURADA
      (+ `billedAt`, `invoiceSentAt`); 7. AuditLog por etapa.
  - Cada etapa com retry/registro independente (falha na NF não bloqueia boleto: status parcial
    por artefato, como no BomControle).
- [ ] Estados POR ARTEFATO no recebível (JSON ou colunas): `nfeStatus`, `boletoStatus`, `emailStatus`.
- [ ] Cron diário `pj-recurring-billing` passa a chamar o pipeline (com lock distribuído já criado).
- **Aceite:** "faturar" uma parcela gera NF + boleto + e-mail; re-executar não duplica nada.

### Passo 3.3 — Grade de Faturamento (espelho BomControle)
- [ ] Rota `app/(app)/pj/faturamento/page.tsx` (substitui a atual sob flag):
  - Colunas: Empresa | Cliente (nome + CNPJ) | Data Faturamento | Vencimento | Tipo | Situação | Valor.
  - **Ícones por linha:** 👁 detalhe; 🕘 histórico; 📄 fatura PDF; 🧾 NF (verde=emitida, cinza=n/a,
    vermelho=erro) com download PDF/XML; ▮▮ boleto (verde=registrado, vermelho=cancelado/erro) com
    download; ✉ reenviar; $ quitar manual.
  - **Seleção múltipla + rodapé:** Faturar agora | Reenviar fatura | Cancelar Nota Fiscal |
    Cancelar Boleto/Pix | Mais opções (exportar, quitar em lote).
  - Filtros: empresa, cliente, conta, tipo, situação, situação da parcela, período por
    vencimento/faturamento.
- [ ] APIs em lote: `POST /api/pj/faturamento/batch` já existe — estender para
      `{action: 'faturar'|'reenviar'|'cancelar_nfe'|'cancelar_boleto'|'quitar', ids[]}` com
      resultado por item (sucesso/erro) e confirmação prévia no UI.
- **Interligações:** cancelar boleto chama Asaas/Inter (cancelPayment) + estado do artefato;
  cancelar NF chama Focus NFe; ambos NUNCA cancelam o recebível sozinhos (decisão explícita).
- **Aceite:** operação diária inteira (faturar lote do dia, reenviar 2, cancelar 1 NF) sem sair da tela.

### Passo 3.4 — Detalhe da fatura (modal com abas)
- [ ] Modal: Dados Básicos | Informações (contrato/recorrência) | Faturamento (datas + artefatos +
      reenviar) | Contatos | Anexos | Histórico (AuditLog filtrado pela entidade).
- [ ] Banner de status: valor, situação, "Quitado em X", **"Conciliado em Y"** (join Reconciliation).
- **Aceite:** paridade com o modal "Receita de Serviço" do BomControle.

### Passo 3.5 — Reajuste de contrato
- [ ] `ContractAdjustmentLog` (data, usuário, índice, % aplicado, valor anterior, valor novo).
- [ ] Ação "Reajustar" (individual e em lote na grade de contratos): aplica % nas parcelas PREVISTAS,
      preserva FATURADAS; atualiza `nextAdjustmentDate`.
- [ ] Índices: manual (digita %) na v1; IGPM/IPCA via API BCB (série SGS) na v1.1.
- **Aceite:** reajuste de 5% altera só parcelas futuras e registra log antes→depois.

---

## FASE 4 — RÉGUA DE COBRANÇA E INADIMPLÊNCIA

### Passo 4.1 — Configuração visual da régua (sobre `CollectionRule` existente)
- [ ] Tela `configuracoes/regua-de-cobranca`: matriz de degraus × canais com toggles, igual BomControle:
  - Aviso de vencimento: D-5, D-3, D-1, D0 (e-mail | WhatsApp por degrau).
  - Inadimplência: 2º, 5º, 7º, 10º, 15º, 20º, 30º dia de atraso (e-mail | WhatsApp por degrau).
  - **Dias ÚTEIS** no cálculo do atraso (helper `lib/business-days.ts` com feriados nacionais).
  - Prazo (dias) para classificar inadimplente; tipo de atividade para agenda.
- [ ] Templates por etapa (1ª/2ª/3ª/última notificação) editáveis com variáveis
      ({{cliente}}, {{valor}}, {{vencimento}}, {{linha_digitavel}}, {{link_boleto}}, {{pix_copia_cola}}).
- **Interligações:** persiste em `CollectionRule.triggers` (estrutura já compatível); cron
  `collection-rules` executa com lock distribuído; logs em `CollectionRuleLog`.
- **Aceite:** ligar "D-3 WhatsApp" gera envio no dia certo (validar com data simulada em sandbox).

### Passo 4.2 — Tela de Inadimplência
- [ ] Rota `pj/inadimplencia`: total em aberto; grade Cliente | Próx. Contato | Previsão |
      Últ. Pagamento | Negociado/Perdido/Não negociado | Valor | botão **Negociar**.
- [ ] "Negociar" usa `ReceivableNegotiation` (existe): registra contato, nova previsão de pagamento,
      observação; cria atividade/alerta na data do próximo contato.
- **Interligações:** entra na tela quem ultrapassa o prazo configurado no 4.1; sair = quitar/cancelar/negociar.
- **Aceite:** cliente 5 dias em atraso aparece; negociar com previsão D+7 atualiza próx. contato.

---

## FASE 5 — FISCAL / NFS-e (operação em lote e rastreabilidade)

### Passo 5.1 — Vínculo fiscal herdado (já existe `Contract.fiscalRuleId`) — completar pontas
- [ ] Emissão pela pipeline usa SEMPRE a regra do contrato; fallback: regra padrão da empresa.
- [ ] No detalhe da fatura, bloco NFS-e com: Nº NF, **Nº RPS**, situação, datas de emissão/envio,
      downloads PDF/XML, "Editar emissão", observação e informações complementares.
- [ ] `NFe`: garantir campos `rpsNumber`, `rpsSeries` (adicionar se faltarem).
- **Aceite:** fatura de contrato com regra de SBC emite com código de serviço/ISS corretos.

### Passo 5.2 — Lista NFS-e com ações em lote
- [ ] Tela `pj/notas-fiscais`: KPIs (qtd emitidas, valor total), grade Nº | Venda/Recebível | RPS |
      Nº NF | Emissão | Destinatário | Status | Valor.
- [ ] **Atualizar Status em lote** (`GET` Focus NFe por ref — polling manual, além do webhook).
- [ ] **Exportar XML em lote** (zip) — entrega mensal à contabilidade.
- **Interligações:** complementa o webhook Focus (fail-closed) como mecanismo de reconciliação fiscal.
- **Aceite:** selecionar 10 notas → atualizar status → divergências corrigidas; zip baixa com 10 XMLs.

### Passo 5.3 — Monitor fiscal (ícone "SEFAZ" do BomControle)
- [ ] Badge no header PJ: contagem de NF com erro/rejeitada + certificado a vencer (Passo 6.2).
- **Aceite:** rejeição de NF aparece no badge em <1 min (via webhook) ou após "Atualizar Status".

---

## FASE 6 — AUTOMAÇÕES FINANCEIRAS E ACABAMENTOS

### Passo 6.1 — Geração automática de taxas bancárias 💡
- [ ] Config por conta (`autoFeeEnabled` + tabela de tarifas: emissão boleto, liquidação, pix).
- [ ] Hooks: ao registrar emissão/cancelamento (API) e ao quitar (webhook), criar `AccountsPayable`
      da tarifa (categoria "Tarifas bancárias", conta correspondente, competência do evento) —
      idempotente por (evento, chargeId).
- **Interligações:** a tarifa lançada aparece na conciliação v2 e casa com o débito real do extrato.
- **Aceite:** boleto quitado gera despesa de tarifa que auto-concilia com o débito "TARIFA COBRANÇA" do extrato.

### Passo 6.2 — Alerta de expiração de certificados
- [ ] Cron semanal: `CompanyCertificate.expiresAt` < 45/30/15/7 dias → Alert + e-mail + badge fiscal.
- [ ] Banner fixo no PJ quando <30 dias. (Certificado Inter da Winner expira **30/07/2026** — primeiro beneficiado.)
- **Aceite:** certificado com 29 dias gera banner e e-mail.

### Passo 6.3 — Timeline/histórico por entidade
- [ ] Componente `EntityTimeline` lendo AuditLog por (entity, entityId): "Quitada", "Conciliado",
      "Valor alterado de X para Y", "Conta alterada de A para B" — com usuário e data.
- [ ] Garantir que TODOS os services das fases 2–6 gravem AuditLog com `before/after`.
- **Aceite:** detalhe da fatura mostra a mesma narrativa do BomControle.

### Passo 6.4 — Documentos com URL assinada curta
- [ ] PDFs de boleto/NF/fatura servidos via rota autenticada ou presigned URL ≤15 min
      (nunca URLs longas tipo a do S3 do BomControle).
- **Aceite:** link de download expira; acesso sem sessão é negado.

### Passo 6.5 — Dashboard operacional ("o que preciso fazer hoje")
- [ ] Cards no dashboard PJ: **Inadimplência (N)** | **Aprovar (N)** | **Conciliar (N pendentes)** |
      **Faturar hoje (N)** — cada um linka para a fila correspondente.
- **Aceite:** contadores batem com as telas de destino.

---

## ORDEM DE EXECUÇÃO E DEPENDÊNCIAS

```
FASE 0 (0.1 → 0.2 → 0.3)            ~2 dias   [0.1 é pré-requisito de produção]
FASE 1 (1.1 → 1.2 → 1.3 → 1.4/1.5)  ~4 dias   [uma migração; bloqueia fases 2 e 3]
FASE 2 (2.1 → 2.2 → 2.3 → 2.4)      ~6 dias   [PRIORIDADE — preferência declarada do Rafael]
FASE 3 (3.1 → 3.2 → 3.3 → 3.4 → 3.5)~8 dias   [3.2 depende de 1.3/1.5; 3.3 depende de 3.2]
FASE 4 (4.1 → 4.2)                  ~4 dias   [depende de 1.3; templates dependem de 3.2 p/ variáveis]
FASE 5 (5.1 → 5.2 → 5.3)            ~4 dias   [5.1 depende de 3.2]
FASE 6 (6.1 → 6.5)                  ~4 dias   [6.1 depende de 2.x e webhooks; restante independente]
                                     ≈ 32 dias úteis de desenvolvimento
```

**Regra de ouro das interligações:** nenhum módulo escreve estado de outro diretamente —
sempre via máquina de estados (`billing-state`) e services (`billing-pipeline`, `matching.service`),
com `$transaction`, idempotência e AuditLog. É isso que mantém fatura ↔ NF ↔ boleto ↔ extrato
sincronizados sem furos de conciliação.

**Checklist de encerramento de cada passo:**
1. Migração aplicada em dev (`prisma db push`) e migração SQL commitada.
2. `npx tsc --noEmit` limpo.
3. Teste manual do fluxo feliz + 1 caso de erro.
4. Flag ativada só para a Winner em produção → validação real → liberar geral.
5. AuditLog conferido para as novas ações.
