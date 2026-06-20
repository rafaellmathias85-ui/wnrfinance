# WNR Finance — Manual Técnico e Documental de Processos

**Versão:** 1.0 — Junho 2026  
**Empresa:** Winner Soluções em Tecnologia da Informática  
**CNPJ:** 21.147.041/0001-85 | **IM:** 298481 | **Município:** São Bernardo do Campo (SP)

---

## Índice

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Infraestrutura e Deploy](#2-infraestrutura-e-deploy)
3. [Módulos PF (Pessoa Física)](#3-módulos-pf-pessoa-física)
4. [Módulos PJ (Pessoa Jurídica)](#4-módulos-pj-pessoa-jurídica)
5. [Integração Focus NFe — NFS-e GINFES SBC](#5-integração-focus-nfe--nfs-e-ginfes-sbc)
6. [Integração Boleto — Itaú PJ](#6-integração-boleto--itaú-pj)
7. [Pipeline de Faturamento (Billing Pipeline)](#7-pipeline-de-faturamento-billing-pipeline)
8. [Sistema de E-mail (SMTP + Queue)](#8-sistema-de-e-mail-smtp--queue)
9. [Webhooks e Segurança](#9-webhooks-e-segurança)
10. [Reconciliação Bancária](#10-reconciliação-bancária)
11. [Blindagem e Restauração de Configurações](#11-blindagem-e-restauração-de-configurações)
12. [CI/CD e VPS](#12-cicd-e-vps)
13. [Referência de Erros Conhecidos](#13-referência-de-erros-conhecidos)

---

## 1. Visão Geral do Sistema

WNR Finance é um SaaS financeiro para gestão PF (pessoa física) e PJ (empresa), construído com:

| Camada | Tecnologia |
|--------|-----------|
| Frontend + API | Next.js 14 (App Router, Server Components) |
| ORM | Prisma 5 |
| Banco de dados | PostgreSQL 15 |
| Autenticação | NextAuth.js v4 com TOTP MFA |
| Runtime servidor | Node.js 20 (PM2 cluster, 2 instâncias) |
| Criptografia | AES-256-GCM (`lib/encrypt.ts`) |
| UI | React + shadcn/ui + Tailwind CSS |

### Ambiente de Produção

- **VPS:** Azure (IP: 4.228.218.45, usuário: adminwti)
- **Processo:** PM2 `wnrfinance`, porta 3003, path `/var/www/wnrfinance`
- **Proxy:** Nginx → `localhost:3003/wnrfinance/`
- **Build:** Next.js standalone (`.next/standalone/server.js`)

### Modelos de Dados Principais

O schema Prisma tem 121 modelos. Os mais críticos para o fluxo financeiro:

```
AccountsReceivable  →  NFe (type=nfse)
                    →  BoletoCharge (type=boleto|pix)
                    →  EmailLog / EmailQueue
Contract            →  AccountsReceivable (parcelas PREVISTAS)
CompanyConnection   →  credenciais Focus NFe, Itaú, Asaas (AES-256-GCM)
ServiceFiscalRule   →  parâmetros fiscais por empresa/serviço
```

---

## 2. Infraestrutura e Deploy

### Pipeline CI/CD (`.github/workflows/deploy.yml`)

Disparo: push na branch `main` → runner self-hosted no VPS.

```
1. Checkout                          (actions/checkout@v4)
2. Sincronizar código                (rsync → /var/www/wnrfinance, excl. .env, node_modules, .next, ecosystem.config.js)
3. Instalar dependências             (npm ci --legacy-peer-deps)
4. Gerar Prisma Client               (npx prisma generate)
5. Build Next.js                     (npm run build → .next/standalone)
6. Copiar assets estáticos           (cp -r .next/static + public → standalone)
7. Prisma Migrate Deploy             (npx prisma migrate deploy)
8. Reiniciar PM2                     (pm2 reload ecosystem.config.js --update-env && pm2 save)
9. Verificação fiscal pós-deploy     (npx tsx scripts/ensure-fiscal-config.ts MODE=check)
10. Health check                     (curl -4 http://localhost:3003/wnrfinance/app/login → espera 200|307|302|401)
11. Resumo do deploy
```

**Arquivos excluídos do rsync (nunca sobrescritos no VPS):**
- `.env` — variáveis de ambiente com segredos
- `ecosystem.config.js` — config PM2 com env vars sensíveis
- `node_modules/`, `.next/`, `.git/`
- `ITAU/`, `INTER/` — certificados e assets bancários

### Variáveis de Ambiente Críticas (`/var/www/wnrfinance/.env`)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | sim | `postgresql://user:pass@localhost:5432/wnr_finance` |
| `NEXTAUTH_SECRET` | sim | min 32 chars (openssl rand -base64 32) |
| `NEXTAUTH_URL` | sim | URL base da aplicação |
| `ENCRYPTION_KEY` | sim | 32 bytes base64 — descriptografa tokens no DB |
| `FOCUSNFE_WEBHOOK_SECRET` | sim | `697fbc2dd22cb5648d9ad71f548bb15caae38f29b153e11aa66cb41b8bd278ef` |
| `ASAAS_WEBHOOK_TOKEN` | sim (se Asaas) | valida webhooks Asaas |
| `INTERNAL_API_SECRET` | recomendado | protege rotas de cron |

**Onde ficam no VPS:**
- `.env` em `/var/www/wnrfinance/.env`
- `ecosystem.config.js` em `/var/www/wnrfinance/ecosystem.config.js` (duplica as vars para o PM2)

---

## 3. Módulos PF (Pessoa Física)

**Base URL:** `/(app)/` | **API:** `/api/`

| Módulo | Menu | API | Descrição |
|--------|------|-----|-----------|
| Dashboard PF | `/dashboard` | `/api/dashboard` | Saldo, receitas vs despesas, últimas transações |
| Hoje | `/hoje` | `/api/pf/hoje` | Resumo diário + agenda financeira |
| Despesas | `/despesas` | `/api/expenses` | CRUD lançamentos de despesa |
| Receitas | `/receitas` | `/api/incomes` | CRUD lançamentos de receita |
| Cartões | `/cartoes` | `/api/cards` | Gestão cartões de crédito + fechamento |
| Bancos | `/bancos` | `/api/banking/*` | Conexões bancárias (OFX, Open Finance, Pluggy) |
| Caixinhas | `/caixinhas` | `/api/savings` | Caixinhas de poupança com metas |
| Investimentos | `/investimentos` | `/api/investments` | Acompanhamento de investimentos |
| Orçamento PF | `/pf/orcamento` | `/api/pf/budget` | Planejamento orçamentário pessoal |
| Categorias PF | `/pf/categorias` | `/api/pf/categorias` | Categorias personalizadas PF |
| Carnê-Leão | `/pf/impostos` | `/api/pf/carne-leao` | Cálculo e apuração IRPF autônomo |
| Lançamentos PF | `/pf/lancamentos` | `/api/pf/transactions` | Transações manuais PF |
| Conciliação | `/conciliacao` | `/api/reconciliation/*` | Conciliação bancária AI-assisted |
| Relatórios | `/relatorios` | `/api/reports` | Relatórios PF exportáveis |
| Alertas | `/alertas` | `/api/alerts` | Alertas financeiros automáticos |
| Assistente IA | `/assistente` | `/api/ai/chat` | Chat financeiro com Claude/GPT |

---

## 4. Módulos PJ (Pessoa Jurídica)

**Base URL:** `/(app)/pj/` | **API:** `/api/pj/`

### 4.1 Dashboard e Visão Executiva

| Menu | Rota | API | Descrição |
|------|------|-----|-----------|
| Dashboard PJ | `/pj/dashboard` | `/api/pj/dashboard` | KPIs: faturamento, inadimplência, caixa |
| Dashboard Executivo | `/pj/dashboard-executivo` | `/api/pj/dashboard-executivo` | DRE em tempo real, projeções |
| Hoje PJ | `/pj/hoje` | `/api/pj/hoje` | Agenda do dia: vencimentos, reuniões |

### 4.2 Financeiro Core

| Menu | Rota | API | Descrição |
|------|------|-----|-----------|
| Faturamento | `/pj/faturamento` | `/api/pj/faturamento` | Lista parcelas faturáveis; ações em lote |
| Contas a Receber | `/pj/contas-receber` | `/api/pj/accounts-receivable` | CRUD parcelas; automação NFS-e+boleto |
| Contas a Pagar | `/pj/contas-pagar` | `/api/pj/accounts-payable` | CRUD obrigações; aprovação financeira |
| Extrato | `/pj/extrato` | `/api/pj/extrato` | Movimentações bancárias PJ |
| Fluxo de Caixa | `/pj/fluxo-caixa` | `/api/pj/cashflow` | Projeção de caixa (6 meses) |
| Movimentações | `/pj/movimentacoes` | `/api/pj/movimentacoes` | Lançamentos manuais PJ |
| Bancos PJ | `/pj/bancos` | `/api/pj/bancos` | Saldos bancários consolidados |
| Compras | `/pj/compras` | `/api/pj/compras` | Ordens de compra + aprovação |

### 4.3 Fiscal

| Menu | Rota | API | Descrição |
|------|------|-----|-----------|
| NF-e / NFS-e | `/pj/nfe` | `/api/pj/nfe` | Emissão, cancelamento, DANFE |
| Monitor Fiscal | `/pj/fiscal` | `/api/pj/fiscal/monitor` | Status fiscal em tempo real |
| Config. Fiscal | `/pj/configuracoes/fiscal` | `/api/pj/configuracoes/fiscal` | Regras de serviço ISS/LC116 |
| NFS Recebidas | `/pj/nfs-recebidas` | `/api/pj/sefaz/nfs-recebidas` | Download NFS-e de terceiros |

### 4.4 Cobranças e Boletos

| Menu | Rota | API | Descrição |
|------|------|-----|-----------|
| Cobranças | `/pj/cobrancas` | `/api/pj/cobrancas` | Boletos + PIX emitidos |
| Régua de Cobrança | `/pj/regua-cobranca` | `/api/pj/collection-rules` | Automação: dias antes/após vencimento |
| CNAB | `/pj/remessa-bancaria` | `/api/pj/cnab/*` | Geração de remessa e importação retorno |
| Inadimplência | `/pj/inadimplencia` | `/api/pj/negotiations` | Gestão de devedores |

### 4.5 Contratos e Recorrência

| Conceito | Descrição |
|----------|-----------|
| **Contract** | Contrato com cliente; define ciclo de faturamento (`billingCycle`), dia (`billingDay`), lead (`billingLeadDays`) |
| **AccountsReceivable** (PREVISTA) | Parcela projetada pelo `projectContractInstallments()` — materializada para o horizonte de 12 meses |
| **`faturarParcela()`** | Transita PREVISTA → FATURADA; dispara NFS-e + boleto + e-mail |
| **BillingStatus** | `PREVISTA → FATURADA → QUITADA → CONCILIADA` |

### 4.6 Operacional

| Módulo | Rota | Descrição |
|--------|------|-----------|
| Clientes | `/pj/clientes` | CRUD clientes + endereços + contatos + portal token |
| Fornecedores | `/pj/fornecedores` | CRUD fornecedores |
| Funcionários | `/pj/funcionarios` | Gestão RH básica |
| Centros de Custo | `/pj/centros-custo` | Alocação de despesas/receitas |
| Orçamento PJ | `/pj/orcamento` | Planejamento orçamentário empresarial |
| DRE | `/pj/dre` | Demonstrativo de Resultado |
| Estoque | `/pj/estoque/*` | Produtos, depósitos, movimentos, inventário |

### 4.7 Configurações PJ

| Rota | Descrição |
|------|-----------|
| `/pj/configuracoes` | Config geral da empresa |
| `/pj/configuracoes/fiscal` | **Regras fiscais ISS/LC116** (ver Seção 5) |
| `/pj/empresa` | Dados da empresa (CNPJ, IM, endereço) |
| `/pj/conexoes` | **Conexões com provedores** (Focus NFe, Asaas, Itaú) |
| `/pj/certificados` | Certificados digitais A1/A3 |
| `/pj/usuarios` | Gestão de usuários da empresa |

### 4.8 CRM

| Submenu | Rota | Descrição |
|---------|------|-----------|
| Pipeline | `/pj/crm/funil` | Funis de vendas Kanban |
| Leads | `/pj/crm/leads` | Gestão de leads |
| Oportunidades | `/pj/crm/oportunidades` | Conversão de oportunidades |
| Agenda CRM | `/pj/crm/agenda` | Atividades e follow-ups |
| Metas de Venda | `/pj/crm/metas` | Metas por período/vendedor |
| Automações | `/pj/crm-automacoes` | Triggers automáticos de CRM |

### 4.9 Service Desk

| Submenu | Rota | Descrição |
|---------|------|-----------|
| Tickets | `/pj/servicedesk/tickets` | Suporte e chamados |
| Agentes | `/pj/servicedesk/agentes` | Gestão da equipe de suporte |
| Fluxos | `/pj/servicedesk/fluxos` | Workflows de atendimento |
| Portal | `/pj/servicedesk/portal` | Portal de autoatendimento do cliente |

### 4.10 BPM (Business Process Management)

| Submenu | Rota | Descrição |
|---------|------|-----------|
| Processos | `/pj/bpm/processos` | Definição de processos |
| Em Andamento | `/pj/bpm/em-andamento` | Instâncias ativas |
| Departamentos | `/pj/bpm/departamentos` | Estrutura organizacional |

---

## 5. Integração Focus NFe — NFS-e GINFES SBC

### 5.1 Configuração Canônica (Winner Soluções)

| Campo | Valor | Onde está |
|-------|-------|-----------|
| Empresa | Winner Soluções em Tecnologia | `Company.name` |
| CNPJ | 21.147.041/0001-85 | `Company.cnpj` |
| Inscrição Municipal | 298481 | `ServiceFiscalRule.providerMunicipalRegistration` |
| Município IBGE | 3548708 (São Bernardo do Campo) | `ServiceFiscalRule.providerCityCode` |
| Sistema NFSe | GINFES | (prefeitura SBC) |
| Provedor API | Focus NFe | `CompanyConnection.providerKey = 'focusnfe'` |
| Token Produção | `XPEpmrVSI5hSl3d6D8qGYC32qSolg12n` | DB criptografado (AES-256-GCM) |
| Environment | `producao` | `CompanyConnection.config.environment` |
| `codigo_tributario_municipio` | `1.07/102320/1234` | `ServiceFiscalRule.codigoTributarioMunicipio` |
| `regime_especial_tributacao` | `6` (ME/EPP Simples Nacional) | `ServiceFiscalRule.regimeEspecialTributacao` |
| `item_lista_servico` | `1.07` (LC 116 — TI) | `ServiceFiscalRule.serviceCodeLc116` |
| FOCUSNFE_WEBHOOK_SECRET | `697fbc2dd22cb5648d9ad71f548bb15caae38f29b153e11aa66cb41b8bd278ef` | `.env` e `ecosystem.config.js` |

### 5.2 Fluxo de Emissão NFS-e

```
AccountsReceivable
  └─ runReceivableAutomation()          [lib/receivable-automation.ts]
       └─ generateNFSe()
            ├─ getApplicableServiceFiscalRule()  [lib/service-fiscal-rules.ts]
            ├─ validateServiceFiscalRule()
            ├─ prisma.nFe.create() → status='rascunho'
            └─ emitNFSe(companyId, payload)     [lib/nfe.ts]
                 └─ emitFocusNFSe(payload, config)
                      ├─ POST /v2/nfse?ref=nfse_{timestamp}
                      ├─ polling até status terminal (max 90s, 8s por ciclo)
                      │    GET /v2/nfse/{ref}
                      │    terminais: autorizado | erro_autorizacao | cancelado
                      └─ return { pdfUrl: url_danfse, xmlUrl: caminho_xml_nota_fiscal }
```

### 5.3 Campos Críticos do Body Focus NFe NFS-e

```json
{
  "data_emissao": "2026-06-20T10:00:00-0300",
  "numero_rps": "10020",
  "natureza_operacao": 1,
  "optante_simples_nacional": true,
  "regime_especial_tributacao": 6,
  "prestador": {
    "cnpj": "21147041000185",
    "inscricao_municipal": "298481",
    "codigo_municipio": 3548708
  },
  "tomador": {
    "cpf_ou_cnpj": "...",
    "razao_social": "...",
    "endereco": { "logradouro": "...", "numero": "...", "bairro": "...",
                  "codigo_municipio": 3548708, "uf": "SP", "cep": "..." }
  },
  "servico": {
    "aliquota": 2,
    "base_calculo": 1000.00,
    "discriminacao": "Serviços de TI",
    "iss_retido": false,
    "item_lista_servico": "1.07",
    "valor_servicos": 1000.00,
    "codigo_municipio": 3548708,
    "codigo_tributario_municipio": "1.07/102320/1234"
  }
}
```

### 5.4 Numeração RPS (Critíco)

**Problema:** Focus NFe ignora o campo `serie_rps` e usa sempre `serie='1'`.  
**Contexto:** Bom Controle (outro sistema do cliente) registrou RPSes 1–1721 com `serie='1'` no GINFES SBC.  
**Solução:** WNR Finance envia `numero_rps = (count de NFe da empresa) + 10000`.

```typescript
// lib/nfe.ts:347
const nfseCount = await prisma.nFe.count({ where: { companyId, type: 'nfse' } });
const numeroRps = nfseCount + 10000;
```

WNR Finance opera no range 10000+, nunca colide com o range 1–2000 do Bom Controle.

### 5.5 URLs de Retorno (Campos Focus NFe)

| Documento | Campo PDF | Campo XML |
|-----------|-----------|-----------|
| NFS-e | `url_danfse` | `caminho_xml_nota_fiscal` |
| NF-e | `caminho_danfe` | `caminho_xml_nota_fiscal` |

> Os campos `caminho_pdf_nfse` e `caminho_xml_nfse` **não existem** na API Focus NFe — são aliases incorretos que retornam `null`.

### 5.6 Endpoints de Cancelamento

| Tipo | Endpoint |
|------|---------|
| NF-e (produto) | `DELETE /v2/nfe/{ref}` |
| NFS-e (serviço) | `DELETE /v2/nfse/{ref}` |

Ambos os callers (`app/api/pj/nfe/[id]/route.ts` e `app/api/pj/faturamento/batch/route.ts`) passam `nfe.type as 'nfe' | 'nfse'` para garantir o endpoint correto.

### 5.7 Sincronização de Status (`queryNFeStatus`)

```
GET /v2/nfse/{ref}   →   status Focus NFe   →   mapeamento WNR Finance
autorizado           →   autorizada
emitida              →   autorizada
cancelado            →   cancelada
erro_autorizacao     →   rejeitada
rejeitada            →   rejeitada
denegada             →   rejeitada
processando_autorizacao →   enviada
```

### 5.8 Webhook Focus NFe

**Endpoint:** `POST /api/webhooks/focusnfe`  
**Autenticação:** `X-Focus-Signature` verificado com `FOCUSNFE_WEBHOOK_SECRET`  
**Função:** Atualiza status da NFe automaticamente quando GINFES autoriza/rejeita

---

## 6. Integração Boleto — Itaú PJ

### 6.1 Configuração

| Campo | Valor |
|-------|-------|
| Provedor | Itaú PJ (mTLS OAuth2) |
| Certificado | `/var/www/wnrfinance/ITAU/certs/` (`.pfx` com senha) |
| Carteira | 109 (boleto registrado) |
| nossoNumero | Sequencial (último: 5 em 20/06/2026) |
| `CompanyConnection.providerKey` | `itau` |
| `CompanyConnection.category` | `boleto` |

### 6.2 Fluxo de Emissão de Boleto

```
AccountsReceivable
  └─ runReceivableAutomation()
       └─ generateCharge(receivable, companyId)    [lib/receivable-automation.ts]
            └─ createCharge(companyId, payload)    [lib/boleto.ts]
                 └─ Itaú provider (lib/itau/service.ts)
                      ├─ OAuth2 (client_credentials, mTLS)
                      ├─ POST /boletos
                      └─ return { boletoBarCode, boletoUrl, nossoNumero }
```

### 6.3 Status do Boleto

| Status DB | Descrição |
|-----------|-----------|
| `pendente` | Boleto gerado, aguardando pagamento |
| `pago` | Confirmado via webhook Itaú |
| `vencido` | Após data de vencimento sem pagamento |
| `cancelado` | Cancelado via `DELETE /boletos/{id}` Itaú |

---

## 7. Pipeline de Faturamento (Billing Pipeline)

**Arquivo principal:** `lib/billing-pipeline.ts`

### 7.1 Estados de uma Parcela

```
PREVISTA  ─faturarParcela()─▶  FATURADA  ─webhook/reconcil.─▶  QUITADA  ─▶  CONCILIADA
```

### 7.2 `faturarParcela(receivableId, opts)`

Função principal do pipeline, idempotente:

1. Valida que a parcela está em estado `PREVISTA`, `FATURADA` ou `VENCIDA`
2. Chama `runReceivableAutomation()` → gera NFS-e e/ou boleto
3. Envia e-mail de fatura ao cliente com PDFs anexados
4. Atualiza `billingStatus → FATURADA`
5. Cria `AuditLog`

### 7.3 Automação em Lote (`/api/pj/faturamento/batch`)

| Action | Descrição |
|--------|-----------|
| `faturar_agora` | Executa `faturarParcela()` para cada item selecionado |
| `cancel_nfe` | Cancela NFS-e no Focus NFe + atualiza DB |
| `cancel_boleto` | Cancela boleto no Itaú/Asaas + atualiza DB |
| `reenviar_fatura` | Coloca e-mail na fila `emailQueue` |
| `update_nfse_status` | Polling no Focus NFe para atualizar status |
| `no_boleto` / `no_pix` / `no_nfe` | Desativa geração automática |

### 7.4 Projeção de Parcelas (`projectContractInstallments`)

Cada contrato ativo gera parcelas PREVISTAS para 12 meses à frente.  
Idempotente: dedup por `(sourceId, billingPeriod)`.  
`billingDate = dueDate − contract.billingLeadDays` (padrão: 4 dias antes).

---

## 8. Sistema de E-mail (SMTP + Queue)

### 8.1 Arquitetura

```
billing-pipeline.ts
  └─ sendEmailWithConfig()       [lib/smtp.ts]
       ├─ busca SmtpConfig (isDefault=true, isActive=true)
       ├─ cria EmailLog (status='sent')
       └─ envia via Nodemailer (TLS)
```

Para reenvios manuais, o e-mail vai para `EmailQueue` (processada assincronamente).

### 8.2 Configuração SMTP

Em `/pj/configuracoes/smtp` (UI) ou via `SmtpConfig` no DB:

| Campo | Descrição |
|-------|-----------|
| `host` / `port` | Servidor SMTP |
| `user` / `pass` | Credenciais (criptografadas no DB) |
| `from` | Endereço remetente |
| `isDefault` | Único ativo por empresa |
| `isActive` | Habilitar/desabilitar |

### 8.3 Rastreamento de E-mail

- `EmailLog`: registro imutável de todos os e-mails enviados
- `EmailQueue`: fila de reenvio manual (processada por cron ou worker)
- Rastreamento de abertura: pixel de tracking em `/api/tracking/pixel/[token]`

---

## 9. Webhooks e Segurança

### 9.1 Endpoints de Webhook

| Provedor | Endpoint | Autenticação |
|----------|----------|--------------|
| Focus NFe | `POST /api/webhooks/focusnfe` | `X-Focus-Signature` (HMAC-SHA256 com `FOCUSNFE_WEBHOOK_SECRET`) |
| Asaas | `POST /api/webhooks/asaas` | `asaas-access-token` header com `ASAAS_WEBHOOK_TOKEN` |
| Itaú | `POST /api/itau/webhook/boletos` | Validado por IP allowlist + certificado mTLS |
| Pluggy | `POST /api/webhooks/pluggy` | Token de parceria Pluggy |
| WhatsApp | `POST /api/webhooks/whatsapp` | Token verificação Meta |

### 9.2 Segurança de Criptografia

Todos os tokens de API (Focus NFe, Itaú, Asaas, etc.) são armazenados **criptografados** em `CompanyConnection.config` usando AES-256-GCM.

```typescript
// lib/encrypt.ts
encrypt(plaintext)  →  iv (12B) + tag (16B) + ciphertext → base64
decrypt(ciphertext) →  plaintext
```

**Chave:** `ENCRYPTION_KEY` (32 bytes base64 em `.env`).  
**Fallback (RISCO):** Se `ENCRYPTION_KEY` ausente, usa derivado de `NEXTAUTH_SECRET` — rotacionar `NEXTAUTH_SECRET` tornaria todos os tokens ilegíveis.

### 9.3 Validação de Configuração no Boot

`instrumentation.ts` chama `validateSecurityConfig()` (`src/lib/config-validator.ts`) que verifica:
- `NEXTAUTH_SECRET` (min 32 chars)
- `ENCRYPTION_KEY` (presença)
- `ASAAS_WEBHOOK_TOKEN` (se Asaas ativo)
- `FOCUSNFE_WEBHOOK_SECRET` (presença + valor canônico)
- `WEBHOOK_ALLOW_UNAUTHENTICATED` (não pode ser `true` em produção)

---

## 10. Reconciliação Bancária

### 10.1 Fluxo

```
BankConnection  ─sync─▶  BankTransaction (raw)
                              │
                         ReconciliationEngine
                              │
                    ├─ match automático (rules + AI)
                    ├─ match manual (usuário)
                    └─ PJReconciliation (resultado)
                              │
                         AccountsReceivable.status ── QUITADA
```

### 10.2 Modos de Importação

| Modo | Descrição |
|------|-----------|
| OFX | Upload manual de arquivo OFX |
| CNAB 240/150 | Retorno bancário (lote) |
| Pluggy | Open Finance automático |
| API Itaú/Inter | Extrato via API bancária |

### 10.3 Status de Reconciliação

| Status | Descrição |
|--------|-----------|
| `pendente` | Transação não conciliada |
| `conciliado` | Match confirmado |
| `ignorado` | Descartado intencionalmente |

---

## 11. Blindagem e Restauração de Configurações

### 11.1 O Que Pode Ser Perdido

| Config | Onde fica | Risco |
|--------|-----------|-------|
| Token Focus NFe | `CompanyConnection.config.apiKey` (criptografado) | DB reset / migração errada |
| Environment produção | `CompanyConnection.config.environment` | Reset para 'homologacao' |
| ServiceFiscalRule | Tabela `ServiceFiscalRule` | Deleção acidental |
| `codigoTributarioMunicipio` | `ServiceFiscalRule.codigoTributarioMunicipio` | Campo apagado |
| `FOCUSNFE_WEBHOOK_SECRET` | `.env` + `ecosystem.config.js` no VPS | Redeploy manual errado |
| `ENCRYPTION_KEY` | `.env` + `ecosystem.config.js` | Perda = todos tokens ilegíveis |

### 11.2 Script de Blindagem

**`scripts/ensure-fiscal-config.ts`** — script idempotente que verifica e restaura:

```bash
# Verificar (somente leitura):
cd /var/www/wnrfinance
MODE=check npx tsx scripts/ensure-fiscal-config.ts

# Restaurar configurações (requer token em env):
FOCUSNFE_RESTORE_TOKEN=XPEpmrVSI5hSl3d6D8qGYC32qSolg12n \
  MODE=restore npx tsx scripts/ensure-fiscal-config.ts
```

O script verifica:
1. `ENCRYPTION_KEY` — presença e validade (32 bytes)
2. `FOCUSNFE_WEBHOOK_SECRET` — presença e valor correto
3. `CompanyConnection` Focus NFe — presença, environment=producao, IM=298481, IBGE=3548708
4. `ServiceFiscalRule` — serviceCode=1.07, codigoTributario, regimeEspecial=6

### 11.3 Restauração Manual (se DB resetado)

Se o DB for completamente perdido, restaurar na ordem:

```
1. pg_restore ou recriar schema:   npx prisma migrate deploy
2. Criar empresa:                  /pj/empresa (UI) ou seed
3. Criar conexão Focus NFe:        /pj/conexoes (UI) → Focus NFe → token + producao
                                   OU: FOCUSNFE_RESTORE_TOKEN=... MODE=restore npx tsx scripts/ensure-fiscal-config.ts
4. Criar regra fiscal:             /pj/configuracoes/fiscal → nova regra TI 1.07
                                   OU: MODE=restore npx tsx scripts/ensure-fiscal-config.ts
5. Criar conexão Itaú:             /pj/conexoes → Itaú (requer cert .pfx)
6. Configurar SMTP:                /pj/configuracoes/smtp
7. Verificar .env:                 ENCRYPTION_KEY, FOCUSNFE_WEBHOOK_SECRET, etc.
```

### 11.4 Diagnóstico Rápido

| Sintoma | Causa Provável | Diagnóstico |
|---------|----------------|-------------|
| NFS-e retorna "Nenhuma conexão ativa" | `CompanyConnection` ausente ou isActive=false | `npx tsx scripts/check-fiscal-rules.ts` |
| NFS-e retorna E160 | environment=homologacao no DB | `MODE=check npx tsx scripts/ensure-fiscal-config.ts` |
| NFS-e retorna E10 | numero_rps colide | Verificar `nfe.ts:347`, offset +10000 |
| NFS-e retorna E183 | `codigoTributarioMunicipio` ausente | `MODE=restore npx tsx scripts/ensure-fiscal-config.ts` |
| NFS-e retorna E166 | `regimeEspecialTributacao` ausente ou 0 | Deve ser 6 para Simples Nacional |
| Token "ilegível" (decrypt null) | `ENCRYPTION_KEY` mudou ou ausente | Verificar `.env` e `ecosystem.config.js` |
| Webhook 401 | `FOCUSNFE_WEBHOOK_SECRET` errado | Verificar `ecosystem.config.js` no VPS |

---

## 12. CI/CD e VPS

### 12.1 Estrutura no VPS

```
/var/www/wnrfinance/
├── .env                          # segredos (NUNCA no git)
├── ecosystem.config.js           # PM2 config (NUNCA no git)
├── .next/standalone/             # build Next.js
│   ├── server.js                 # ponto de entrada PM2
│   ├── .next/static/             # assets estáticos
│   └── public/                   # public dir
├── ITAU/certs/                   # certificados mTLS Itaú
├── INTER/                        # assets Inter
├── prisma/                       # schema + migrations
├── scripts/                      # scripts de operação
└── lib/                          # código compartilhado
```

### 12.2 Comandos Úteis no VPS

```bash
# Status PM2
pm2 list
pm2 logs wnrfinance --lines 50

# Reiniciar sem deploy
pm2 reload ecosystem.config.js --update-env

# Health check manual
curl -4 -s -o /dev/null -w "%{http_code}" http://localhost:3003/wnrfinance/app/login

# Verificar config fiscal
cd /var/www/wnrfinance
MODE=check npx tsx scripts/ensure-fiscal-config.ts

# Verificar boletos
npx tsx scripts/check-boletos.ts

# Testar SMTP
npx tsx scripts/check-smtp.ts

# Ver últimas NFS-e
npx tsx scripts/check-nfse-records.ts
```

### 12.3 Bug Histórico: `curl` sem `-4`

**Problema:** `curl` sem `-4` tenta IPv6 primeiro → VPS Azure rejeita IPv6 → retorna `000`  
**Fix:** Sempre usar `curl -4` nos health checks do CI/CD

### 12.4 Bug Histórico: `pm2 logs --nostream`

**Problema:** `--nostream` não é flag válida do PM2 → exit 1 → step falha  
**Fix:** Usar `pm2 logs wnrfinance --lines 20 2>/dev/null || true`

---

## 13. Referência de Erros Conhecidos

### 13.1 GINFES SBC (Focus NFe)

| Código | Mensagem | Causa | Solução |
|--------|----------|-------|---------|
| E10 | RPS já informado | `numero_rps` colide com Bom Controle | `numero_rps = nfseCount + 10000` |
| E16 | Data/hora inválida | Formato UTC "Z" | Usar offset "-0300" |
| E35 | Código tributário inválido | Valor errado de `codigo_tributario_municipio` | Usar `"1.07/102320/1234"` |
| E160 | Estrutura XML inválida | `environment=homologacao` (SBC sandbox não tem cert) | Usar `environment=producao` |
| E183 | Campo obrigatório ausente | `codigo_tributario_municipio` faltando | Sempre enviar o campo |
| E166 | Regime especial inválido | `regime_especial_tributacao` ausente ou `0` | Usar `6` para Simples Nacional |

### 13.2 Next.js / Build

| Erro | Causa | Solução |
|------|-------|---------|
| `next: not found` | `next` não está no PATH do shell | Usar `npm run build` (npm adiciona `node_modules/.bin`) |
| `ENOENT .next/` | Duas builds simultâneas | Matar processo paralelo antes de rebuild |

### 13.3 PM2 / Deploy

| Erro | Causa | Solução |
|------|-------|---------|
| Health check `000` | IPv6 refused | Usar `curl -4` |
| Step `pm2 logs` falha | Flag `--nostream` inválida | Usar `--lines N 2>/dev/null \|\| true` |

### 13.4 Criptografia

| Erro | Causa | Solução |
|------|-------|---------|
| `safeDecrypt` retorna `null` | `ENCRYPTION_KEY` diferente da usada para criptografar | Verificar `.env` e `ecosystem.config.js` no VPS |
| `ENCRYPTION_KEY inválida` (não 32 bytes) | Key truncada ou formato errado | Gerar nova: `openssl rand -base64 32` |

---

## Apêndice A: Últimas NFS-e Emitidas (Produção)

| NFS-e | RPS | Data | Valor | Status |
|-------|-----|------|-------|--------|
| 2636 | 2000 (teste manual) | 20/06/2026 | R$ 100,00 | cancelada |
| 2637 | 10019 | 20/06/2026 | R$ 100,00 | cancelada |

> NFS-e 2636 foi emitida com RPS 2000 como teste antes do fix do offset +10000.  
> NFS-e 2637 confirma o fix: RPS 10019 (count=19 + 10000) aceito pelo GINFES SBC.  
> Ambas canceladas via `DELETE /v2/nfse/{ref}` após confirmação.

---

## Apêndice B: Fluxo Completo de uma Parcela (do Contrato ao Pagamento)

```
1. CONTRATO CRIADO
   Contract { billingCycle='mensal', billingDay=10, billingLeadDays=4 }

2. PROJEÇÃO (cron mensal ou manual)
   projectContractInstallments(contractId)
   → AccountsReceivable { billingStatus='PREVISTA', dueDate=10/07/2026, billingDate=06/07/2026 }

3. FATURAMENTO (em billingDate ou manual)
   faturarParcela(receivableId)
   ├── emitNFSe() → NFe { type='nfse', status='enviada'→'autorizada', pdfUrl, xmlUrl }
   ├── createCharge() → BoletoCharge { status='pendente', boletoBarCode, boletoUrl }
   ├── sendEmailWithConfig() → EmailLog { status='sent' }
   └── AccountsReceivable { billingStatus='FATURADA' }

4. PAGAMENTO (via webhook ou importação CNAB)
   Webhook Itaú → BoletoCharge { status='pago' }
   reconciliação → AccountsReceivable { billingStatus='QUITADA', status='recebido' }

5. CONCILIAÇÃO (extrato bancário)
   PJReconciliation { status='conciliado' }
   → AccountsReceivable { billingStatus='CONCILIADA' }
```

---

*Documento gerado em 20/06/2026. Manter sincronizado com mudanças em `lib/nfe.ts`, `lib/billing-pipeline.ts` e `scripts/ensure-fiscal-config.ts`.*
