# WNR Finance — Manual Completo do Sistema

**Versão:** 1.0 — Junho 2026  
**Público-alvo:** Administradores, Gestores Financeiros, Contadores e Usuários Finais

---

## Índice

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Primeiros Passos](#2-primeiros-passos)
3. [Módulo PJ — Pessoa Jurídica](#3-módulo-pj--pessoa-jurídica)
   - 3.1 [Dashboard](#31-dashboard)
   - 3.2 [Fluxo de Caixa](#32-fluxo-de-caixa)
   - 3.3 [Contas a Pagar](#33-contas-a-pagar)
   - 3.4 [Contas a Receber](#34-contas-a-receber)
   - 3.5 [Faturamento](#35-faturamento)
   - 3.6 [Movimentações](#36-movimentações)
   - 3.7 [Extrato Bancário](#37-extrato-bancário)
   - 3.8 [Conciliação Bancária](#38-conciliação-bancária)
   - 3.9 [Clientes](#39-clientes)
   - 3.10 [Fornecedores](#310-fornecedores)
   - 3.11 [Contas Bancárias](#311-contas-bancárias)
   - 3.12 [Usuários da Empresa](#312-usuários-da-empresa)
   - 3.13 [Cadastro de Empresa](#313-cadastro-de-empresa)
   - 3.14 [Configurações](#314-configurações)
4. [Módulo PF — Pessoa Física](#4-módulo-pf--pessoa-física)
5. [Permissões e Controle de Acesso](#5-permissões-e-controle-de-acesso)
6. [Configurações de Segurança](#6-configurações-de-segurança)
7. [Integrações Bancárias](#7-integrações-bancárias)
8. [Fluxo de Dados e Impacto no Sistema](#8-fluxo-de-dados-e-impacto-no-sistema)
9. [FAQ e Solução de Problemas](#9-faq-e-solução-de-problemas)

---

## 1. Visão Geral do Sistema

O **WNR Finance** é um sistema de gestão financeira integrado voltado para empresas (Pessoa Jurídica — PJ) e uso pessoal (Pessoa Física — PF). Ele cobre desde o controle de contas a pagar e receber, faturamento com emissão de NF-Se, conciliação bancária automática, fluxo de caixa projetado, extrato real, até gerenciamento de usuários com permissões granulares por módulo.

### 1.1 Arquitetura geral

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 (App Router) + React |
| Backend | API Routes Next.js (Node.js) |
| Banco de Dados | PostgreSQL via Prisma ORM |
| Autenticação | NextAuth.js (e-mail + senha + MFA TOTP) |
| Armazenamento extra | JSON `features` na tabela `Company` |
| APIs externas | ViaCEP (endereço), AbacusAI (PDF parsing), Banco Inter API |

### 1.2 Ambientes disponíveis

- **PF (Pessoa Física):** controle de finanças pessoais — receitas, despesas, investimentos, metas.
- **PJ (Pessoa Jurídica):** gestão empresarial — faturamento, contas, conciliação, clientes, fornecedores.
- Um mesmo login pode ter acesso a PF, PJ ou ambos, dependendo de como foi configurado pelo administrador.

---

## 2. Primeiros Passos

### 2.1 Criação de conta

O sistema permite criar conta de dois modos:

**Modo A — Auto-cadastro (página pública):**
1. Acesse a tela de cadastro.
2. Informe nome, e-mail e senha (mínimo 6 caracteres).
3. Após o cadastro, o usuário tem acesso ao módulo PF por padrão.

**Modo B — Criação pelo administrador da empresa:**
1. O administrador acessa **PJ → Usuários da Empresa**.
2. Clica em **"Criar Usuário"**.
3. Preenche nome, e-mail, senha, seleciona Cargo e marca os acessos (PF, PJ ou ambos).
4. O usuário criado pode fazer login imediatamente.

> **Diferença entre "Criar Usuário" e "Convidar Usuário":**
> - **Criar:** o administrador define a senha e o usuário é criado direto no sistema.
> - **Convidar:** o usuário precisa já ter uma conta; o sistema o vincula à empresa.

### 2.2 Primeiro login

1. Acesse a URL do sistema.
2. Informe e-mail e senha.
3. Se o administrador habilitou MFA, insira o código TOTP do aplicativo autenticador.
4. O sistema direciona automaticamente para o ambiente padrão (PF ou PJ).

### 2.3 Troca de empresa ativa

Usuários vinculados a mais de uma empresa PJ podem alternar clicando no seletor de empresa no menu lateral. O sistema recarrega os dados do contexto financeiro da empresa selecionada.

---

## 3. Módulo PJ — Pessoa Jurídica

O módulo PJ agrupa todas as funcionalidades de gestão financeira empresarial. Para ativar funcionalidades avançadas (NF-e, boleto integrado, conexões bancárias via API), a empresa precisa ter o status **PJ Full** ativado.

---

### 3.1 Dashboard

**Caminho:** Menu lateral → Dashboard (PJ)

**O que mostra:**
- Resumo rápido do período atual: total a receber, total a pagar, saldo bancário projetado.
- Cards de alertas: contas vencidas, conciliações pendentes.
- Gráficos de evolução de entradas e saídas nos últimos meses.

**Como usar:**
- O período padrão é o **mês atual**.
- Os valores são calculados com base nos lançamentos de Contas a Pagar e Contas a Receber com status `pendente` e `vencido`.
- Clique nos cards para navegar diretamente ao módulo correspondente.

**Impacto no sistema:**
- Leitura apenas. Não altera dados.
- Reflete em tempo real qualquer lançamento ou alteração em contas a pagar/receber.

---

### 3.2 Fluxo de Caixa

**Caminho:** Menu lateral → Fluxo de Caixa

**O que mostra:**
- **Total a Receber:** soma de todas as Contas a Receber com status `pendente` ou `vencido` (independente da data de vencimento).
- **Total a Pagar:** soma de todas as Contas a Pagar com status `pendente` ou `vencido`.
- **Projeção Líquida:** diferença entre Total a Receber e Total a Pagar.
- **Gráfico semanal:** barras por semana de (30, 60 ou 90 dias) mostrando entradas e saídas projetadas.
- **Barra "Em Atraso":** itens com vencimento passado mas ainda não pagos aparecem neste bucket destacado.

**Como usar:**
1. Selecione o horizonte de projeção: **30, 60 ou 90 dias** (botões no topo direito).
2. Observe o gráfico para antecipar semanas de maior desembolso ou recebimento.
3. Use a Projeção Líquida para decidir sobre investimentos ou necessidade de crédito.

**Configuração necessária:**
- Ter lançamentos em Contas a Pagar e/ou Contas a Receber com status `pendente` ou `vencido`.
- Sem lançamentos, todos os valores serão R$ 0,00.

**Impacto no sistema:**
- Leitura apenas. Qualquer lançamento novo em contas a pagar/receber aparece automaticamente.

---

### 3.3 Contas a Pagar

**Caminho:** Menu lateral → Contas a Pagar

**O que é:**
Registro de todas as obrigações financeiras da empresa: fornecedores, impostos, salários, despesas fixas e variáveis.

**Filtros disponíveis:**
- **Mês/Ano:** padrão = mês atual.
- **Status:** Todos / Pendente / Vencido / Pago.
- **Categoria financeira.**

**Como lançar uma conta a pagar:**
1. Clique em **"+ Novo"** ou **"Nova Conta"**.
2. Preencha:
   - **Descrição:** nome do pagamento (ex: "Aluguel Outubro").
   - **Valor:** montante a pagar.
   - **Data de vencimento:** quando a conta vence.
   - **Categoria:** víncula ao plano de contas (impacta relatórios).
   - **Fornecedor:** opcional, vincula ao cadastro de fornecedores.
   - **Conta bancária:** qual conta será debitada (usada na conciliação).
   - **Recorrência:** se marcado, gera cópias mensais automaticamente.
3. Salve.

**Como quitar (marcar como pago):**
- Clique no ícone **Quitar** (seta verde na linha da conta).
- Informe a **data do pagamento** e o **valor pago** (pode diferir do valor original).
- O status muda para `pago` e a conta deixa de aparecer na projeção do Fluxo de Caixa.

**Como editar:**
- Clique no ícone de lápis na linha.
- Modifique qualquer campo e salve.

**Impacto no sistema:**
- Status `pendente`/`vencido` → aparece no **Fluxo de Caixa** e **Dashboard**.
- Status `pago` + `paidAt` definido → aparece no **Extrato Bancário** como saída do período.
- Se vinculada a uma conta bancária, pode ser conciliada com lançamentos do banco (ver 3.8).
- A categoria impacta os **relatórios por categoria** no Dashboard.

---

### 3.4 Contas a Receber

**Caminho:** Menu lateral → Contas a Receber

**O que é:**
Registro de todos os direitos a receber: vendas, honorários, serviços prestados, aluguéis recebíveis.

**Filtros:**
- Mês/Ano (padrão = mês atual), Status, Categoria, Cliente.

**Como lançar:**
1. Clique em **"+ Novo"**.
2. Preencha: Descrição, Valor, Data de vencimento, Categoria, Cliente (opcional), Conta bancária de recebimento.
3. Salve.

**Como registrar o recebimento:**
- Clique no ícone **Receber** (ícone verde).
- Informe a **data de recebimento** e o **valor recebido**.
- Status muda para `recebido`.

**Impacto no sistema:**
- `pendente`/`vencido` → Fluxo de Caixa e Dashboard.
- `recebido` com `receivedAt` → aparece no **Extrato Bancário** como entrada.
- Pode ser conciliada automaticamente com lançamentos do banco importados.

---

### 3.5 Faturamento

**Caminho:** Menu lateral → Faturamento

**O que é:**
Módulo para emissão de faturas/notas a clientes. Cada fatura pode gerar uma Conta a Receber automaticamente.

**Filtros:**
- Período (data de → data até, padrão = mês atual).
- Status: Todas / Pendente / Pago / Cancelado.

**Como criar uma fatura:**
1. Clique em **"+ Nova Fatura"**.
2. Selecione o **cliente**.
3. Adicione os **itens** (descrição, quantidade, valor unitário, desconto).
4. Defina **data de emissão**, **data de vencimento** e **forma de pagamento**.
5. O sistema calcula automaticamente o **total** e os impostos (se configurado via NFSe).
6. Salve como **Rascunho** ou **Emita** diretamente.

**Integração com NFSe:**
- Se a empresa tem NFSe configurada (ver 3.13 → Configurações → NFSe), ao emitir a fatura o sistema gera a Nota Fiscal de Serviço Eletrônica na prefeitura.
- O número RPS é incrementado automaticamente.

**Impacto no sistema:**
- A fatura **emitida** gera automaticamente uma Conta a Receber com o valor e vencimento definidos.
- O pagamento da fatura quita automaticamente a Conta a Receber vinculada.
- Contribui para os relatórios de **faturamento mensal** e **por cliente**.

---

### 3.6 Movimentações

**Caminho:** Menu lateral → Movimentações

**O que é:**
Visão consolidada de todas as movimentações financeiras (entradas e saídas) do período selecionado, independente da conta bancária.

**Filtros:**
- Período (padrão = mês atual).
- Tipo: Todos / Entrada / Saída.
- Status: Todos / Pendente / Pago.

**Ícones de ação na listagem:**
- **Quitar:** ícone verde se já pago/recebido; vermelho se pendente. Clique para quitar ou reabrir.
- **Conciliar:** ícone verde se já conciliado; azul se pendente de conciliação. Leva direto ao módulo de Conciliação com o item pré-selecionado.

**Resultado esperado:**
- Uma lista ordenada das movimentações do período, do mais recente ao mais antigo.
- Totais de entradas, saídas e saldo do período exibidos no rodapé.

---

### 3.7 Extrato Bancário

**Caminho:** Menu lateral → Extrato

**O que é:**
Extrato virtual reconstruído a partir dos lançamentos pagos/recebidos no sistema, com saldo acumulado dia a dia.

**Como funciona:**
1. Selecione a **conta bancária** no seletor no topo.
2. Defina o **período** (mês/ano).
3. O sistema busca todas as Contas a Pagar com `status = pago` e Contas a Receber com `status = recebido` no período.
4. Soma sobre o **Saldo de Abertura** da conta bancária (configurado em Contas Bancárias → Configurar).
5. Exibe linha a linha: data, descrição, categoria, tipo (entrada/saída), valor, saldo acumulado.

**Saldo de Abertura:**
- Configurado em **Contas Bancárias → Configurar → Dados Básicos → Saldo de Abertura**.
- Representa o saldo da conta na data em que o sistema começou a ser utilizado.
- **Sem este valor correto, o saldo acumulado será impreciso.**

**Resultado esperado:**
- Saldo inicial → movimentações cronológicas → saldo final do período.
- Serve como conferência interna antes da conciliação com o extrato real do banco.

---

### 3.8 Conciliação Bancária

**Caminho:** Menu lateral → Conciliação

**O que é:**
O módulo mais completo do sistema. Permite importar o extrato real do banco (OFX, CSV, PDF, TXT) e cruzar automaticamente com os lançamentos internos (Contas a Pagar/Receber).

#### 3.8.1 Como importar um extrato

1. Acesse **Conciliação**.
2. Selecione a **conta bancária** no filtro.
3. Clique em **"Importar Extrato"** e selecione o arquivo (formatos suportados: `.ofx`, `.csv`, `.txt`, `.pdf`).
4. O sistema processa o arquivo e cria lançamentos bancários com status `BANK_ONLY` (sem vínculo com lançamentos internos ainda).
5. Um **lote de importação** é criado com nome/data para fácil identificação.

> **Processamento de PDF:** usa inteligência artificial (AbacusAI) para extrair as transações. Pode levar até 60 segundos.

#### 3.8.2 Status dos lançamentos

| Status | Significado |
|---|---|
| `BANK_ONLY` | Presente no banco, sem lançamento interno correspondente |
| `PENDING` | Lançamento interno sem correspondente no banco ainda |
| `SUGGESTED` | Sistema encontrou correspondência automática, aguarda aprovação |
| `DIVERGENT` | Vinculado, mas com diferença de valor ou data entre banco e sistema |
| `RECONCILED` | Conciliado e aprovado |
| `IGNORED` | Marcado para ignorar (ex: taxas que não precisam de lançamento) |

#### 3.8.3 Conciliação automática

- Clique em **"Conciliar Automaticamente"**.
- O sistema calcula uma **pontuação de correspondência** (score) baseada em: valor, data e descrição.
- Itens com score alto são marcados como `SUGGESTED`.
- Revise os sugeridos e clique **"Aprovar"** nos corretos.

#### 3.8.4 Conciliação manual — "Vincular"

Para itens `BANK_ONLY` ou sem correspondência automática:
1. Clique no ícone de **link** ou botão **"Vincular"**.
2. Um painel lateral abre mostrando os lançamentos internos compatíveis.
3. Use os filtros (período, nome, valor) para localizar o lançamento correto.
4. Clique em **"Vincular"** na linha desejada.
5. O status passa para `RECONCILED` ou `DIVERGENT` (se valores/datas diferem).

#### 3.8.5 Tratamento de divergências

Itens `DIVERGENT` têm um ícone de triângulo amarelo com o motivo da divergência (passe o mouse para ver o tooltip).

**Para resolver:**
- Clique em **"Forçar"**: aprova a conciliação mesmo com divergência. Se a diferença for de valor, um checkbox oferece corrigir o valor do lançamento interno para o valor real do banco.
- Clique em **"Re-vincular"**: abre o painel para escolher outro lançamento correspondente.
- Clique em **"Remover"**: desfaz o vínculo e retorna o item a `BANK_ONLY`.

#### 3.8.6 Lançar — criar do banco

Para itens `BANK_ONLY` que **não têm** lançamento interno (ex: uma taxa bancária que nunca foi lançada):
1. Clique em **"Lançar"**.
2. O sistema abre um formulário pré-preenchido com data e valor do banco.
3. Complete descrição e categoria.
4. Clique em **"Criar e Conciliar"**: cria o lançamento interno (Conta a Pagar ou Receber) e já vincula ao item bancário.

#### 3.8.7 Excluir lote de importação

- Na visualização **"Por Lote"**, cada lote tem um ícone de lixeira.
- Clicar exclui **todos** os lançamentos bancários daquele lote que ainda não foram conciliados (status ≠ RECONCILED).

#### 3.8.8 Ações em massa

Na visualização "Por Lote", itens `DIVERGENT` têm checkboxes. Selecione múltiplos e use os botões de ação em massa para aprovar/ignorar/reabrir em lote.

**Impacto no sistema:**
- A conciliação não altera os valores dos lançamentos internos (a menos que "Forçar com correção" seja usado).
- Itens conciliados aparecem com ícone verde em **Movimentações**.
- O status de conciliação é exibido no badge da listagem de lançamentos.

---

### 3.9 Clientes

**Caminho:** Menu lateral → Clientes

**O que é:**
Cadastro de pessoas físicas e jurídicas que são clientes da empresa.

**Campos principais:**
- Nome/Razão Social
- CPF/CNPJ
- E-mail, Telefone
- Endereço (com busca por CEP)
- Segmento / Categoria
- Observações

**Integração com outros módulos:**
- Ao criar uma **Conta a Receber**, é possível vincular a um cliente.
- Ao emitir uma **Fatura**, o cliente é selecionado e seus dados preenchem automaticamente o destinatário da nota fiscal.
- Relatórios de **faturamento por cliente** ficam disponíveis no Dashboard.

**Como pesquisar:**
- Use a barra de pesquisa no topo para buscar por nome, CPF/CNPJ ou e-mail.

---

### 3.10 Fornecedores

**Caminho:** Menu lateral → Fornecedores

**O que é:**
Cadastro de fornecedores e prestadores de serviço da empresa.

**Campos principais:**
- Nome/Razão Social, CPF/CNPJ
- Contato (e-mail, telefone)
- Endereço
- Dados bancários para pagamento (agência, conta)

**Integração com outros módulos:**
- Ao criar uma **Conta a Pagar**, pode-se vincular ao fornecedor.
- Facilita rastreamento de gastos por fornecedor nos relatórios.
- Se integrado a boleto/transferência bancária futura, os dados bancários são usados automaticamente.

---

### 3.11 Contas Bancárias

**Caminho:** Menu lateral → Contas Bancárias (Bancos)

**O que é:**
Gerenciamento das contas bancárias e conexões financeiras da empresa.

#### 3.11.1 Conexões disponíveis

| Modo | Descrição |
|---|---|
| **API (Banco Inter PJ)** | Sincronização automática via API oficial com mTLS. Importa extrato sem arquivo manual. |
| **OFX/CSV** | Importação manual de arquivo exportado pelo internet banking. |

#### 3.11.2 Como conectar uma conta

1. Clique em **"+ Conectar Conta"**.
2. Selecione o banco (Inter PJ, Itaú PJ, ou Genérico OFX/CSV).
3. Para **API (Banco Inter):** informe ClientId, ClientSecret e faça upload do certificado mTLS (.crt e .key).
4. Para **OFX/CSV:** apenas registre a conta (agência, número) para começar a importar arquivos.

#### 3.11.3 Configurar conta existente (botão "Configurar")

Cada conta tem um botão **"Configurar"** que abre um dialog com 5 abas:

**Dados Básicos:**
- **Nome da conta:** identificação interna.
- **Data de abertura:** quando a conta foi aberta.
- **Saldo de Abertura (R$):** ⚠️ CRÍTICO — informe o saldo na data em que o sistema começou a ser usado. Este valor é a base para o cálculo do Extrato Bancário real. Se incorreto, todos os saldos acumulados serão imprecisos.
- **Uso da conta:** toggles para Pagamentos, Recebimentos, Transferências, Conta padrão.

**Conta Bancária:**
- Agência, número da conta, dígito, limite de crédito.
- Multa (%), Juros ao mês (%), Desconto (%) para boletos.
- Dias de antecedência para geração de boleto.

**Boleto:**
- Toggle para ativar emissão de boletos.
- Emissão via API bancária ou manual.
- Prazo de vencimento padrão, valor mínimo, prazo de baixa automática.
- Instruções impressas no boleto.

**Pix Cobrança:**
- Toggle para ativar Pix Cobrança.
- Tipo de chave (CPF, CNPJ, e-mail, telefone, aleatória) e valor da chave.
- Usada para geração de QR Codes nas faturas.

**Conciliação:**
- Toggle para conciliação automática ao importar extrato.
- Quando ativo, cada importação tenta cruzar automaticamente com os lançamentos internos.

**Impacto no sistema:**
- O **Saldo de Abertura** afeta diretamente o Extrato Bancário.
- As configurações de Boleto e Pix são usadas no módulo de Faturamento.
- A Conciliação automática reduz trabalho manual ao importar extratos.

---

### 3.12 Usuários da Empresa

**Caminho:** Menu lateral → Usuários

**O que é:**
Gerenciamento de todos os usuários com acesso à empresa, seus cargos e permissões por módulo.

#### 3.12.1 Criar Usuário (direto)

Botão **"Criar Usuário"** (ícone de engrenagem + pessoa):
- Cria uma conta nova do zero.
- Campos: Nome completo, E-mail, Senha (com confirmação e toggle de visibilidade), Cargo, Acesso PF/PJ.
- O usuário criado pode fazer login **imediatamente**.
- Se marcado **PJ**: é automaticamente vinculado à empresa com o cargo escolhido.
- Se marcado **PF**: pode acessar o módulo de finanças pessoais.
- Se ambos marcados: acesso a PF e PJ com alternância pelo menu.

#### 3.12.2 Convidar Usuário (existente)

Botão **"Convidar Usuário"**:
- Vincula um usuário **que já tem conta** no sistema a esta empresa.
- Informe o e-mail do usuário e o cargo desejado.
- O usuário passa a ver esta empresa na lista de empresas disponíveis.

#### 3.12.3 Cargos disponíveis

| Cargo | Acesso padrão |
|---|---|
| **Proprietário (OWNER)** | Acesso total irrestrito. Apenas 1 por empresa. |
| **Administrador (ADMIN)** | Acesso total exceto remoção do proprietário. |
| **Financeiro (FINANCE)** | Acesso aos módulos financeiros (contas, extrato, conciliação). |
| **Contador (ACCOUNTANT)** | Acesso a relatórios e exportação. |
| **Visualizador (VIEWER)** | Apenas leitura. |

#### 3.12.4 Permissões por módulo

Cada usuário pode ter permissões customizadas clicando em **"Permissões"** (ícone de lápis):
- O modal abre com 7 abas de módulos: Financeiro, Estoque, Vendas, CRM, ServiceDesk, BPM, Configurações.
- Cada módulo tem seções (Dia-a-Dia, Cadastros, Visões, Avançado) com funcionalidades específicas.
- Para cada funcionalidade: **Ver** (somente leitura), **Editar** (leitura + escrita), **Bloquear** (sem acesso).
- Botões de atalho por módulo: **Acesso Total**, **Personalizado**, **Bloqueado**.

**Proteção do usuário master:**
- O usuário `rafaellmathias85@gmail.com` não pode ter permissões alteradas por nenhum outro usuário (retorna HTTP 403).

#### 3.12.5 Badges de módulo

Cada card de usuário mostra 7 badges coloridos (um por módulo):
- **Verde:** tem acesso (pelo menos um item com view ou edit permitido).
- **Vermelho:** sem acesso (todos itens bloqueados).
- **Cinza:** não configurado (permissão padrão do cargo).

---

### 3.13 Cadastro de Empresa

**Caminho:** Menu lateral → Configurações → Empresa  
*(Ou diretamente em: /pj/empresa)*

**O que é:**
Página completa de configuração da empresa, organizada em seções e abas de configurações.

#### Seção: Dados Básicos

| Campo | Descrição | Impacto |
|---|---|---|
| CNPJ | Readonly. Definido na criação. | Usado em NF-Se, boletos. |
| Nome Fantasia | Nome comercial da empresa. | Exibido em documentos e faturas. |
| Razão Social | Nome legal da empresa. | Obrigatório para emissão fiscal. |
| Regime Tributário | Simples Nacional / Lucro Presumido / Lucro Real / MEI. | Define campos fiscais (ex: Alíquota DAS aparece apenas para Simples). |
| Porte | MEI / ME / EPP / Médio / Grande. | Informativo, usado em relatórios. |
| Natureza Jurídica | LTDA / S.A. / Empresário Individual etc. | Informativo e fiscal. |
| Inscrição Estadual | Número do IE ou "ISENTO" (checkbox). | Usado na emissão de NF-e. |
| UF da IE | Estado da inscrição estadual. | Valida o IE regionalmente. |
| Inscrição Municipal | Número do IM (para serviços). | Obrigatório para emissão de NF-Se. |
| Telefone | Contato principal. | Exibido em documentos. |
| Sigla | Até 3 letras (ex: "W"). | Usada no avatar colorido da empresa. |
| Cor | Azul, Verde, Ciano, etc. | Cor do avatar da empresa na interface. |
| Preview | Avatar gerado com a sigla + cor. | Visual identificador da empresa. |
| Alíquota DAS (%) | Aparece se Regime = Simples Nacional. | Cálculo de impostos simplificados. |
| Excesso de sublimite | Checkbox. | Informativo tributário. |

#### Seção: Localização

- **CEP:** ao digitar e clicar no botão de busca (↺), o sistema consulta a API ViaCEP e preenche automaticamente logradouro, bairro, cidade e estado.
- Campos: Tipo de logradouro, Logradouro, Número, Complemento, Bairro, Referência.

#### Seção: CNAE

- Adicione um ou mais CNAEs digitando o código/descrição e clicando em **"Adicionar"**.
- O primeiro CNAE é marcado como **Principal**.
- Usado em NF-Se e relatórios de atividade econômica.

#### Seção: Configurações — Aba Vendas

| Campo | Descrição |
|---|---|
| Vende? | Se a empresa realiza vendas. |
| Dias de validade do orçamento | Padrão dos orçamentos gerados. |
| Máx. parcelas na venda | Limite de parcelamento nas vendas. |
| Venda de Serviço | Se vende serviços (NFSe). |
| Venda de Produto | Se vende produtos (NF-e/NFCe). |
| Baixa automática de estoque | Ao confirmar venda, baixa estoque automaticamente. |

#### Seção: Configurações — Aba NFSe

**Pré-requisito:** inscrição municipal preenchida e acesso configurado na prefeitura.

| Campo | Descrição | Impacto |
|---|---|---|
| Emite NFSe? | Liga/desliga emissão de nota fiscal de serviço. | Se Não, o sistema não exibe opção de NF no Faturamento. |
| Ambiente de Produção | Sim = notas reais. Não = homologação (teste). | ⚠️ Em homologação, as notas NÃO têm validade fiscal. |
| Incentivador Cultural | Contribuição cultural municipal. | Campo opcional da nota. |
| Regime Especial de Tributação | MEI, MEEPP, Cooperativa etc. | Define o código do regime na nota. |
| Natureza da Operação | Tributação do Município, Isenção etc. | Campo obrigatório da nota. |
| E-mail Remetente | E-mail usado para enviar a nota ao cliente. | Aparece no cabeçalho da NF enviada. |
| Número Atual RPS | Número do último RPS emitido. | Incrementado a cada nova NF. Deve refletir o real da prefeitura. |
| Série RPS | Série da RPS (geralmente "1"). | Obrigatório. |
| Usuário / Senha | Login no portal da prefeitura. | Usado para autenticar a emissão via API da prefeitura. |
| Discriminação | Template do texto do serviço. | Variáveis: `{{ServicosSimplificado}}` (lista itens), `{{InformacaoImposto}}` (impostos). |

#### Seção: Configurações — Aba NF-e / NFC-e

| Campo | Descrição |
|---|---|
| Ambiente SEFAZ | Produção (real) ou Homologação (testes). ⚠️ Em homologação notas não têm validade. |
| Série NF-e | Número de série para NF-e (padrão: 1). |
| Série NFC-e | Número de série para NFC-e (padrão: 65, conforme legislação). |
| CSC ID | Código de Segurança do Contribuinte — ID. Fornecido pela SEFAZ estadual. |
| CSC Token | Token do CSC. Obrigatório para NFC-e em produção. |

#### Seção: Configurações — Aba Certificado

- Lista os certificados digitais A1 (.pfx, .p12) cadastrados.
- Mostra: nome do arquivo, data de upload, data de expiração (vermelho se vencido), status ativo.
- Botão **"Adicionar Novo Certificado"**: registra o arquivo no sistema.
- **O certificado digital é obrigatório para assinatura de NF-e e NFC-e.** Deve ser renovado antes da data de expiração.

---

### 3.14 Configurações

**Caminho:** Menu lateral → Configurações

**Hub de configurações** com links para:

| Item | Descrição |
|---|---|
| **Dados da Empresa** | Atalho para 3.13 Cadastro de Empresa. |
| **Contas Bancárias** | Atalho para 3.11. |
| **Usuários** | Atalho para 3.12. |
| **Configurações Fiscais** | Regime, IE, IM, CNAE, NF-e legacy (integrado agora ao Cadastro de Empresa). |
| **Conexões** | Integrações com bancos e sistemas externos. |
| **MFA / Segurança** | Configuração de autenticação de dois fatores (ver 6). |
| **Importar dados** | Upload de CSVs para seed de categorias, clientes, lançamentos. |

---

## 4. Módulo PF — Pessoa Física

**Acesso:** usuários com `hasPF = true` ou `allowedEnvs = 'pf'` ou `'both'`.

O módulo PF oferece controle de finanças pessoais independente do módulo empresarial.

### 4.1 Dashboard PF

- Resumo de receitas e despesas do mês.
- Gráfico de pizza por categoria de despesa.
- Evolução patrimonial (saldo atual vs. mês anterior).
- Alertas de contas vencidas e limites de orçamento excedidos.

### 4.2 Receitas e Despesas

- Lançamento de entradas (salário, freelance, investimento) e saídas (aluguel, alimentação, transporte).
- Cada lançamento tem: descrição, valor, data, categoria, conta bancária.
- Recorrência: define lançamentos mensais automáticos.

### 4.3 Orçamento

- Define limites de gastos por categoria (ex: Alimentação = R$ 800/mês).
- O dashboard exibe barras de progresso comparando real vs. orçado.
- Alerta visual quando o orçamento de uma categoria é ultrapassado.

### 4.4 Investimentos

- Cadastro de CDB, Tesouro Direto, Ações, FIIs, etc.
- Registro de aportes e resgates.
- Cálculo de rendimento e evolução do patrimônio.

### 4.5 Metas Financeiras

- Crie metas (ex: "Reserva de Emergência = R$ 20.000").
- Defina prazo e valor alvo.
- O sistema calcula a contribuição mensal necessária e o progresso.

### 4.6 Cartões de Crédito

- Cadastro de cartões com limite, data de fechamento e data de vencimento.
- Lançamentos vinculados ao cartão são agrupados por fatura.
- Alerta de fatura prestes a vencer.

### 4.7 Contas Bancárias PF

- Conecte contas bancárias pessoais.
- Importe extratos OFX para conciliar com lançamentos pessoais.

---

## 5. Permissões e Controle de Acesso

### 5.1 Modelo de permissões

As permissões seguem uma hierarquia de dois níveis:

1. **Cargo (Role):** permissão base herdada do cargo na empresa (OWNER, ADMIN, FINANCE, etc.).
2. **Permissão por módulo/funcionalidade:** sobrescreve o cargo para funcionalidades específicas.

O banco de dados armazena permissões na tabela `UserPermission` com:
- `userId`: usuário
- `module`: ex: `financeiro.dashboard`, `financeiro.contas-pagar`
- `action`: `view` ou `edit`
- `allowed`: true/false

### 5.2 Hierarquia de módulos

```
financeiro
  ├── dashboard
  ├── contas-pagar
  ├── contas-receber
  ├── faturamento
  ├── extrato
  ├── fluxo-caixa
  └── conciliacao
estoque
  ├── produtos
  └── movimentacoes
vendas
  ├── pedidos
  └── orcamentos
crm
  ├── contatos
  └── pipeline
servicedesk
  ├── tickets
  └── relatorios
bpm
  ├── fluxos
  └── tarefas
configuracoes
  ├── empresa
  ├── usuarios
  └── fiscal
```

### 5.3 Como configurar permissões

1. Acesse **Usuários da Empresa**.
2. Clique em **"Permissões"** no card do usuário.
3. Selecione a aba do módulo desejado.
4. Para cada funcionalidade: radio **Ver / Editar / Bloquear**.
5. Atalhos: **Acesso Total** (habilita tudo), **Bloqueado** (desabilita tudo), **Personalizado** (configuração individual).
6. Clique **Salvar**.

### 5.4 Regras importantes

- **OWNER** nunca tem permissões bloqueadas — é protegido no sistema.
- Se uma permissão não está configurada, o sistema usa o cargo como padrão.
- Permissões de **Editar** incluem automaticamente **Ver**.
- Um usuário **Bloqueado** de um módulo não vê o item no menu lateral.

---

## 6. Configurações de Segurança

**Caminho:** Configurações → Segurança / MFA

### 6.1 Autenticação em dois fatores (MFA/TOTP)

1. Acesse **Configurações → Segurança**.
2. Clique em **"Ativar MFA"**.
3. Escaneie o QR Code com um aplicativo autenticador (Google Authenticator, Authy, Microsoft Authenticator).
4. Insira o código de 6 dígitos para confirmar.
5. O sistema salva os **códigos de backup** — guarde-os em local seguro (usados se perder o dispositivo).

**Após ativar:** toda vez que fizer login, após e-mail e senha, o sistema pede o código TOTP.

### 6.2 Troca de senha

- Acesse **Perfil → Alterar Senha**.
- Informe a senha atual + nova senha (mínimo 6 caracteres) + confirmação.

### 6.3 Reset de senha por e-mail

- Na tela de login, clique em **"Esqueci a senha"**.
- Informe o e-mail cadastrado.
- Um link de reset é enviado (válido por tempo limitado).

---

## 7. Integrações Bancárias

### 7.1 Banco Inter PJ — API mTLS

**Pré-requisitos:**
- Conta PJ ativa no Banco Inter.
- Certificado mTLS emitido pelo Inter (arquivos `.crt` e `.key`).
- ClientId e ClientSecret gerados no portal Inter Developers.

**Como configurar:**
1. Acesse **Contas Bancárias → + Conectar Conta**.
2. Selecione **Banco Inter PJ → API**.
3. Preencha ClientId, ClientSecret, faça upload do certificado .crt e .key.
4. Clique **"Testar Conexão"** para validar.
5. Se bem-sucedido, o status muda para `ACTIVE`.

**Sincronização:**
- Clique em **"Sincronizar agora"** para importar as transações mais recentes.
- O sistema importa as transações do período configurado e cria lançamentos bancários para conciliação.

### 7.2 Importação manual OFX/CSV

**Formatos suportados:**
| Formato | Extensão | Parsing |
|---|---|---|
| OFX | `.ofx`, `.ofc` | Automático via tags XML |
| CSV | `.csv`, `.txt` | Separador: `;`, `,` ou tabulação. Formato: `data;descricao;valor` |
| PDF | `.pdf` | Via IA (AbacusAI) — até 60s |

**Como importar:**
1. **Contas Bancárias → Importar OFX/CSV** (ícone de upload na conta).
2. Selecione o arquivo exportado do internet banking.
3. O sistema processa e cria os lançamentos no módulo de Conciliação.

**Dica:** ao exportar do banco, prefira o formato OFX quando disponível — é mais preciso que CSV.

---

## 8. Fluxo de Dados e Impacto no Sistema

### 8.1 Fluxo de uma venda

```
Faturamento (nova fatura)
  ↓
Conta a Receber criada (status: pendente)
  ↓  [aparece em]
  ├── Fluxo de Caixa (Total a Receber)
  └── Dashboard (receita prevista)
  ↓  [quando cliente paga]
Conta a Receber quitada (status: recebido, receivedAt = data)
  ↓  [aparece em]
  ├── Extrato Bancário (linha de entrada no período)
  └── Movimentações (entrada do dia)
  ↓  [ao importar extrato do banco]
Conciliação (item BANK_ONLY criado)
  ↓  [conciliação automática ou manual]
Item RECONCILED → Conta a Receber marcada como conciliada
```

### 8.2 Fluxo de um pagamento

```
Conta a Pagar criada (status: pendente)
  ↓  [aparece em]
  ├── Fluxo de Caixa (Total a Pagar)
  └── Dashboard (despesa prevista)
  ↓  [ao quitar]
Conta a Pagar paga (status: pago, paidAt = data, amountPaid = valor)
  ↓  [aparece em]
  ├── Extrato Bancário (saída no período)
  └── Movimentações (saída do dia)
  ↓  [conciliação com banco]
Item RECONCILED → Conta a Pagar marcada como conciliada
```

### 8.3 Fluxo da conciliação

```
Importação de extrato
  ↓
Lançamentos bancários (status BANK_ONLY)
  ↓
Conciliação automática (score: valor + data + descrição)
  ↓
Match encontrado? 
  ├── Sim, score alto → status SUGGESTED (aguarda aprovação)
  ├── Sim, com divergência → status DIVERGENT
  └── Não → permanece BANK_ONLY
  ↓
Ação do usuário:
  ├── Aprovar SUGGESTED → RECONCILED
  ├── Forçar DIVERGENT → RECONCILED (opcional: corrige valor)
  ├── Vincular manualmente → RECONCILED ou DIVERGENT
  └── Lançar novo → cria lançamento interno + RECONCILED
```

---

## 9. FAQ e Solução de Problemas

### 9.1 O Fluxo de Caixa mostra R$ 0,00

**Causa mais comum:** não há lançamentos com status `pendente` ou `vencido` em Contas a Pagar/Receber.

**Solução:**
1. Acesse Contas a Pagar → verifique se há lançamentos com status pendente.
2. Se todos estão como `pago`, o Fluxo de Caixa mostrará R$ 0 (correto: sem pendências).
3. Se precisar mostrar histórico, use o Extrato Bancário.

### 9.2 O Extrato mostra saldo errado

**Causa:** o **Saldo de Abertura** da conta bancária está incorreto ou não foi configurado.

**Solução:**
1. Acesse Contas Bancárias → Configurar → Dados Básicos.
2. Informe o saldo real da conta na data em que começou a usar o sistema.
3. Todos os extratos subsequentes serão recalculados.

### 9.3 A conciliação automática não encontra correspondências

**Causas:**
- Diferença de valor entre o banco e o lançamento interno (ex: banco cobrou taxa diferente).
- Diferença de data superior a 45 dias.
- Descrição muito diferente (score de nome baixo).

**Solução:**
- Use **"Vincular"** manualmente para encontrar e associar o lançamento correto.
- Se o lançamento não existe, use **"Lançar"** para criar direto da transação bancária.

### 9.4 Não consigo alterar as permissões de um usuário

**Causa:** o usuário alvo é o administrador master do sistema (proteção por e-mail).

**Solução:** nenhuma — essa proteção é intencional e não pode ser contornada.

### 9.5 A importação de PDF falhou

**Causas:**
- Arquivo maior que 10 MB.
- PDF com proteção de senha.
- PDF sem texto selecionável (scan de imagem sem OCR).

**Solução:**
- Reduza o tamanho do PDF (use ferramentas online para compressão).
- Exporte o extrato em formato OFX diretamente pelo internet banking quando possível.
- Para PDFs escaneados, use OCR antes de importar.

### 9.6 O usuário criado não aparece na lista

**Causa:** o sistema busca usuários vinculados à empresa (`UserCompany`). Se o usuário foi criado mas sem marcar PJ, não foi vinculado.

**Solução:**
- Acesse Usuários → Convidar Usuário → informe o e-mail do usuário criado e o cargo desejado.
- Ou delete e recrie marcando a opção PJ durante a criação.

### 9.7 Como deletar um lote de importação sem conciliação

1. Na aba **Conciliação → Por Lote**.
2. Localize o lote desejado pelo nome/data.
3. Clique no ícone de **lixeira** ao lado do nome do lote.
4. Confirme a exclusão.
5. Apenas lançamentos com status ≠ RECONCILED são deletados (os já conciliados são preservados).

---

## Glossário

| Termo | Definição |
|---|---|
| **Conta a Pagar** | Obrigação financeira futura ou vencida. |
| **Conta a Receber** | Direito financeiro a receber de um cliente. |
| **Conciliação** | Processo de cruzar lançamentos internos com o extrato real do banco. |
| **RPS** | Recibo Provisório de Serviços — documento que antecede a NFS-e. |
| **NFSe** | Nota Fiscal de Serviços Eletrônica — emitida pela prefeitura. |
| **NF-e** | Nota Fiscal Eletrônica — emitida pela SEFAZ estadual para produtos. |
| **NFC-e** | Nota Fiscal de Consumidor Eletrônica — cupom fiscal eletrônico. |
| **OFX** | Open Financial Exchange — formato padrão de extrato bancário. |
| **mTLS** | Mutual TLS — autenticação bidirecional via certificado, usada na API do Banco Inter. |
| **Saldo de Abertura** | Saldo da conta bancária na data de início do uso do sistema. |
| **TOTP** | Time-based One-Time Password — código temporário de 6 dígitos para MFA. |
| **CSC** | Código de Segurança do Contribuinte — necessário para NFC-e. |
| **CNAE** | Classificação Nacional de Atividades Econômicas. |
| **IE** | Inscrição Estadual. |
| **IM** | Inscrição Municipal. |
| **PJ Full** | Status premium da empresa que desbloqueia funcionalidades avançadas (NF-e, API bancária, etc.). |
| **Score de conciliação** | Pontuação calculada pelo sistema (0–100) que mede a probabilidade de um lançamento bancário corresponder a um lançamento interno. |

---

*Documento gerado automaticamente pelo sistema WNR Finance — Junho 2026*
