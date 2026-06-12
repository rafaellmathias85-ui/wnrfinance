# BomControle — Referência Funcional para o WnrFinance

Documento produzido a partir de navegação real no BomControle (conta #19720, Winner) em 11/06/2026.
Objetivo: servir de especificação de referência para implementar **faturamento, emissão de NFS-e,
boletos e conciliação** no WnrFinance. Inspirações declaradas: Omie, Conta Azul e BomControle.

---

## 1. Visão geral do módulo Financeiro (sitemap real)

**Dia a Dia:** Dashboard, Contas a Receber, Contas a Pagar, Movimentação Financeira, **Faturamento**,
**Inadimplência**, **Conciliação**, **Contratos**, Aprovação Financeira, Envio de Remessa (CNAB),
Retorno de Remessa (CNAB), Histórico Movimentação, Fatura Cartão de Crédito, Agenda.

**Cadastros:** Serviço, Tipo de Serviço, Minhas Empresas, Fornecedor, Cliente, Plano de Contas,
**Contas Bancárias**, Departamento, Funcionário, Ramo/Tipo Atividade, Etiqueta.

**Avançado:** Caixa de e-mail, Configurações Gerais, Templates, Portal BPO, Portal BC360 (contabilidade),
Portal do Cliente, **Régua de Cobrança**.

**NFS-e fica no módulo Vendas:** Nota Fiscal de Serviços (lista/emissão), Configuração NFe, Inutilizar NFe.

---

## 2. O CORAÇÃO: pipeline Contrato → Parcela → Fatura → NF + Boleto → Baixa → Conciliação

Este é o fluxo que o WnrFinance precisa replicar. No BomControle ele é assim:

### 2.1 Contrato (recorrência) — tela "Contratos"
Grade: Nº, Empresa, Cliente + tipo de serviço, Pagamento (Recorrente), Vigência (início[–fim]),
Status (VIGENTE), Próx. Reajuste + índice, Quitado (qtd + valor), Atrasado (qtd + valor).
Ações: Novo Contrato, Reajuste (em lote), Exportar.

Detalhe do contrato (ex. real: Contrato Recorrente #62):
- **Dados Gerais:** Prestador (empresa emitente), Tomador (cliente), Situação, Quantidade de parcelas
  (∞ indeterminado ou N), Início/Término, **Dia de Vencimento** (ex.: 5), Tipo Valor (Definitivo),
  **Período de Reajuste** (Mensal/Anual), Próximo Reajuste, Índice (IGPM/IPCA/Nenhum),
  Totais: Quitado / Atrasado / Futuro.
- **Serviços:** linhas com serviço, quantidade, valor unitário, desconto, total (valores "originais da
  criação" — reajustes alteram cópia, preservando histórico).
- **Dados Nota Fiscal (NO CONTRATO — as parcelas herdam):** Emitir NFSE? Sim/Não; impostos e
  retenções; local de prestação do serviço (empresa/endereço de evento-obra); município de prestação;
  Natureza da Operação; Tributação Município; local de incidência do ISS (mesmo município ou outro);
  município de incidência do ISS; Código do Serviço (LC 116); Tipo de Serviço; CNAE.
- **Histórico de Reajuste:** data, usuário, índice, valor anterior → valor após.
- **Parcelas:** agrupadas por ano; cada uma com Nº, **Competência** (05/2026), **Data Faturamento**
  (01/06/2026), **Vencimento** (05/06/2026), Situação (Quitado/Futuro/Atrasado), Valor.
  → Observação: faturamento ocorre dias ANTES do vencimento (regra "faturar X dias antes").
- Ações: Duplicar, Reajustar, Encerrar Contrato, Salvar.

### 2.2 Faturamento — tela central de operação diária
Grade: Empresa, Cliente (com CNPJ), Data Faturamento, Vencimento, Tipo (FATURAMENTO),
Situação (FATURADO/...), Valor.
Filtros: Empresas, Clientes, Contas, Tipo, Situação, Situação Parcela, Tipo Valor, Departamento,
período por Vencimento/Faturamento.

**Ações POR LINHA (ícones):** visualizar fatura; histórico; arquivos; PDF da NF (com check verde =
emitida); documento/fatura; e-mail (reenviar); boleto (código de barras; check verde = registrado,
X vermelho = cancelado/erro); quitar ($).

**Ações EM LOTE (rodapé, com seleção por checkbox):** Mais Opções, **Cancelar Nota Fiscal**,
**Cancelar Boleto/Pix**, **Reenviar fatura**, **Faturar agora**.

### 2.3 Detalhe da fatura (modal "Receita de Serviço")
Abas: Dados Básicos / Informações / Faturamento / Contato / Agenda / Anexos / Histórico.
- **Status no topo:** valor, "Pagamento em dia", "Quitado em DD/MM", **"Conciliado em DD/MM"**,
  Forma de Pagamento. → A fatura expõe os 3 estágios: faturada → quitada → conciliada.
- **Dados Básicos:** Empresa, Vencimento, Competência, Desconto, Acréscimo, Valor bruto, Tipo Valor,
  Cliente, **Conta** (bancária de recebimento), Categoria (plano de contas), Departamento, Rateio,
  Etiqueta, Nº Documento, Observações.
- **Informações:** "Lançamento Mensal sem término. Contrato Nº 12" (vínculo com contrato).
- **Faturamento:** Data, status "Faturado (Enviado dia X)", botão Reenviar Fatura.
- **Bloco NFS-e dentro da fatura:** Emitir/Não emitir; Editar Emissão NFSE; Observação da Nota;
  Informações complementares; Tipo de serviço; **Número da NF (2570), RPS (1714), Situação (Emitido),
  datas de emissão/envio, download PDF + XML**.
- **Serviços:** linhas (serviço, tabela de preço, qtd, valor unitário, desconto, total).
- **Contato:** contatos de cobrança do cliente (nome, e-mail, telefone) — destinatários da fatura.
- **Anexos:** categorias Fatura/Comprovante/Nota Fiscal/Outros + "adicionar em todas as parcelas".
- **Histórico (auditoria):** "Quitada — Quitado em 03/06 no valor R$X", "Conciliado em 03/06",
  "Valor alterado de R$A para R$B", "Conta alterada de Inter para Itaú" — com data e usuário.

### 2.4 Boleto emitido (PDF real analisado)
- **Boleto Pix híbrido do Banco Inter (077-9)**: QR Code Pix + linha digitável no mesmo PDF
  ("Pague via Pix, recebimento instantâneo").
- Beneficiário: Winner (CNPJ), carteira 112, nosso número, espécie DM, multa 2% + mora 10,5% a.a.,
  data limite de pagamento (vencimento + 30d).
- PDF armazenado em S3 (`bom-controle-arquivos.s3...../19720/financeiro/boletos/boleto_<uuid>.pdf`).

### 2.5 NFS-e — tela "Nota Fiscal de Serviços" (módulo Vendas)
KPIs no topo: Notas Emitidas (175), Valor Total (R$ 258.659,93).
Grade: Nº interno, Nº Venda (vínculo), **Nº RPS**, **Nº NF**, Emissão, Empresa (CNPJ),
Destinatário (CNPJ/CPF), Status (EMITIDO), Valor.
Ações em lote: **Exportar XML**, **Atualizar Status** (re-consulta a prefeitura — polling manual).
Ícone SEFAZ no topo do app com contador (37) = monitor de pendências fiscais.

---

## 3. Conciliação bancária (a melhor parte do produto)

### 3.1 Tela "Arquivos de conciliação" (lotes)
Cada linha = um lote de importação por conta: Empresa, **Tipo (AUTOMÁTICO/manual)**, Status
(CONCILIADO/pendente), Data/hora, **Banco + agência + conta**, Período do extrato,
contadores **CONCILIADOS / IGNORADOS / PENDENTES / TOTAL**. Ações: ver detalhe, download, excluir.
Botão "Importar" (OFX manual).
- Sync automático diário ~08:21 (Inter e Itaú via API) — gera um lote por dia/conta.

### 3.2 Tela "Conciliação Extrato" (detalhe do lote) — duas colunas
- **Esquerda — Extrato:** linha do banco ("Pix recebido - Wecambio", data, valor; verde=crédito,
  vermelho=débito) + botão **"+"** (criar lançamento novo a partir da linha do extrato).
- **Direita — Movimentações não conciliadas:** lançamento interno sugerido com descrição completa
  ("Recebimento DO(A) Wecambio ... R$ 1601.25 (PARCELA FIXA TODO DIA 5)"), desconto/acréscimo,
  data | valor; **check verde** = match sugerido aceito; campo **"Vincular"** (busca manual de outro
  lançamento); linha tracejada conecta os pares.
- Rodapé: **Conciliar** (confirma o lote inteiro), Voltar.
- Matching automático evidente por: valor exato + data + cliente/recorrência.

### 3.3 Regras de conciliação POR CONTA BANCÁRIA (cadastro da conta)
Tabela de regras: Tipo (Receita/Despesa), **Texto de conciliação** (+ flag "texto exato"),
→ Categoria financeira, Cliente/Fornecedor, Departamento, Forma de pagamento.
= autocategorização do extrato por palavra-chave (ex.: "PIX RECEBIDO.*VIVO" → Despesa Telefonia).

---

## 4. Conta Bancária — concentra TODA a configuração de cobrança

Cadastro da conta (ex. real: conta Inter):
- Flags: Conta padrão; Permite Pagamentos/Recebimentos/Transferência; Conta PF.
- Banco/agência/conta/dígitos, limite.
- **Defaults financeiros da cobrança:** Multa %, Juros mensal %, Desconto até vencimento
  (R$ ou %), dias de antecedência para desconto.
- **Integração Bancária (API):** ClientId, ClientSecret, **certificado mTLS (arquivos .CRT e .KEY)**
  com data de upload e expiração ("Inter API_Certificado.crt, expira 30/07/2026"); status
  "Seu banco está conectado via API!"; lista de serviços ativos (Extrato, Cobrança/Boleto, Pix);
  botões Desconectar / **Atualizar serviços**.
- **Importação de Extrato automático:** Sim/Não (exige serviço de extrato ativo).
- **Gerar Boleto:** Sim/Não; "Gerar boleto por integração bancária" (API vs CNAB); qtd dias úteis
  que o banco disponibiliza o dinheiro (D+N); valor mínimo; prazo para baixa; instruções do boleto.
- **Pix Cobrança:** Sim/Não + Chave Pix.
- **Geração automática de taxas:** quando ativa, cria automaticamente o LANÇAMENTO DE DESPESA da
  tarifa bancária no momento da emissão/cancelamento/quitação (API) ou da remessa (CNAB). 💡
- **Remessa de Pagamento (CNAB):** Sim/Não.
- Regras de conciliação (ver 3.3).

---

## 5. Régua de Cobrança (config global)

**Aviso de vencimento** (e-mail e/ou WhatsApp, por canal): D-5, D-3, D-1, D0 — cada um liga/desliga.

**Inadimplência:**
- Prazo de dias em atraso para classificar inadimplente (e aparecer na tela Inadimplência).
- Tipo de atividade para agenda (cria tarefa de cobrança).
- Templates editáveis (e-mail e WhatsApp) para 1ª, 2ª, 3ª e última notificação.
- Agenda de envio por dias ÚTEIS de atraso (sáb/dom não contam): 2º, 5º, 7º, 10º dia (ativos)
  e 15º/20º/30º (disponíveis).

**Tela Inadimplência:** total em aberto, grade com Cliente, Próx. Contato, Previsão (de pagamento),
Últ. Pagamento, contadores Negociado/Perdido/Não Negociado, botão **Negociar** (registra negociação
com nova previsão).

---

## 6. CNAB (Envio/Retorno de Remessa)
- Envio de Remessa: gera arquivo de cobrança/pagamento para bancos sem API.
- Retorno de Remessa: importa arquivo de retorno; contadores **Registrados / Quitados / Baixados /
  Outros / Não localizado**. (Conta Winner não usa — boletos saem pela API Inter.)

---

## 7. Mapa BomControle → WnrFinance (o que já temos / o que falta)

| Conceito BomControle | WnrFinance hoje | Gap / Ação |
|---|---|---|
| Contrato recorrente + parcelas projetadas | `Contract` + `Recurrence` + billing-automation | Falta projeção visual de parcelas por ano, reajuste por índice (IGPM/IPCA) com histórico, e "dia de faturamento ≠ dia de vencimento" |
| Dados NFS-e no contrato (herdados pelas parcelas) | `ServiceFiscalRule` existe separado | Vincular regra fiscal AO contrato/recebível; herdar na emissão |
| Tela Faturamento (fila de operação com ações em lote) | `/pj/faturamento` parcial | Implementar grade única: parcela+NF+boleto+e-mail por linha, com status visual de cada artefato e ações em lote (faturar/cancelar NF/cancelar boleto/reenviar) |
| Fatura com 3 estágios: Faturado → Quitado → Conciliado | `AccountsReceivable.status` + `Reconciliation` separados | Expor "Conciliado em..." no detalhe do recebível (join com Reconciliation) |
| Boleto Pix híbrido Inter (carteira 112) | Integração Inter PJ já em produção (cobranças) | Conferir emissão híbrida (boleto+pix no mesmo PDF), multa/juros default por conta, data limite |
| NFS-e: RPS + Nº NF + Atualizar Status em lote | `NFe` model + Focus NFe + webhook | Adicionar ação "Atualizar Status" (polling em lote) e exportar XML em lote |
| Conciliação por LOTE com contadores | `Reconciliation` por transação | Agrupar por lote de sync (já existe o conceito de sync diário 08/12/17h); tela de lote com conciliados/ignorados/pendentes + status "IGNORADO" |
| Tela 2 colunas Extrato × Lançamentos + botão "+" | `/conciliacao` existente | Validar UX: criar lançamento a partir da linha do extrato; campo "Vincular" manual; conciliar lote inteiro |
| Regras de conciliação por conta (texto → categoria/cliente) | `reconciliation-rules.service` | Mover/escopar regras por `BankConnection`; flag "texto exato"; aplicar na importação |
| Geração automática de taxas bancárias | — | NOVO: ao emitir/cancelar/quitar boleto via API, criar `AccountsPayable` da tarifa automaticamente |
| Régua: D-5/D-3/D-1/D0 + 2º/5º/7º/10º dia útil de atraso, e-mail+WhatsApp, templates | cron `collection-rules` + WhatsApp bot | Formalizar config visual da régua (liga/desliga por degrau e canal), dias ÚTEIS, templates por etapa |
| Inadimplência com Negociar (previsão de pagamento) | `ReceivableNegotiation` existe | Tela dedicada com próximo contato, previsão e contadores |
| Certificado mTLS com data de expiração visível | `CompanyCertificate.expiresAt` | Alerta de expiração (banner/cron) — certificado Inter da Winner expira 30/07/2026! |
| Histórico por entidade (quem alterou o quê, antes→depois) | `AuditLog` | Exibir timeline no detalhe do recebível/cobrança |
| Anexos por fatura (Fatura/Comprovante/NF/Outros) | upload existe | Categorizar anexos e "aplicar a todas as parcelas" |
| Atividades/Agenda de cobrança | — | Opcional: gerar tarefa na agenda ao inadimplir |

### Estados sugeridos (máquina de estados da parcela/fatura no WnrFinance)
```
PREVISTA (parcela futura do contrato)
  → FATURADA (gera fatura: NF opcional + boleto/pix + e-mail) [data faturamento = vencimento - N dias]
    → QUITADA (webhook de pagamento OU baixa manual)         [paidAt, paidAmount]
      → CONCILIADA (match com linha do extrato no lote)      [reconciledAt]
  FATURADA → VENCIDA (D+1 sem pagamento) → régua de inadimplência
  Qualquer estágio → CANCELADA (cancela NF e boleto separadamente, com auditoria)
```
Artefatos da fatura, cada um com ciclo próprio (como no BomControle):
`fatura(pdf) | nfse(rps→nf, emitida/cancelada, pdf+xml) | boleto(registrado/pago/cancelado, pdf) | email(enviado dia X)`

---

## 8. Backlog priorizado sugerido (para as próximas sessões)

1. **Grade de Faturamento unificada** (espelho da tela do BomControle) — maior ganho operacional.
2. **Conciliação por lote** com contadores + status IGNORADO + regras por conta com "texto exato".
3. **Régua de cobrança configurável** (degraus por canal, dias úteis, templates) sobre o cron existente.
4. **Geração automática de taxa bancária** na emissão/quitação de boleto Inter.
5. **Reajuste de contrato por índice** com histórico (IGPM/IPCA manual ou API BCB).
6. **Alerta de expiração de certificado** (CompanyCertificate + banner + e-mail).
7. **Atualizar Status NFS-e em lote** + Exportar XML em lote.

> Nota de segurança: diferente do BomControle (S3 com URL de expiração ~2038), os PDFs de
> boleto/NF do WnrFinance devem usar URLs assinadas de curta duração.
