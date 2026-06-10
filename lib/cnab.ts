// CNAB 240 — fixed-width format generator and parser
// Based on FEBRABAN CNAB 240 standard (2022)

type CnabField = string | number;

function pad(value: CnabField, length: number, padChar = ' ', right = false): string {
  const str = String(value ?? '');
  if (str.length >= length) return str.slice(0, length);
  const padding = padChar.repeat(length - str.length);
  return right ? str + padding : padding + str;
}

function padLeft(value: CnabField, length: number, padChar = '0') {
  return pad(value, length, padChar, false);
}

function padRight(value: CnabField, length: number) {
  return pad(value, length, ' ', true);
}

function fmtDate(d: Date): string {
  const dd = padLeft(d.getDate(), 2);
  const mm = padLeft(d.getMonth() + 1, 2);
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function fmtTime(d: Date): string {
  return padLeft(d.getHours(), 2) + padLeft(d.getMinutes(), 2) + padLeft(d.getSeconds(), 2);
}

function fmtAmount(value: number, decimals = 2, totalLen = 15): string {
  const cents = Math.round(value * Math.pow(10, decimals));
  return padLeft(cents, totalLen);
}

export interface BankInfo {
  code: string;      // 3-digit bank code
  cnpj: string;      // company CNPJ (digits only)
  agencia: string;
  conta: string;
  nome: string;      // company name
  convenio: string;  // bank agreement number
}

export interface BoletoItem {
  id: string;
  nossoNumero: string;
  amount: number;
  dueDate: Date;
  customerName: string;
  customerDoc: string; // CPF or CNPJ (digits only)
  description?: string;
}

// ─── CNAB 240 HEADER ARQUIVO (Row type 0, 240 chars) ───────────────────────
function headerArquivo(bank: BankInfo, now: Date, seqArquivo = 1): string {
  return [
    padLeft(bank.code, 3),              // 001-003: banco
    padLeft(0, 4),                       // 004-007: lote = 0000
    '0',                                 // 008: tipo = header arquivo
    padRight('', 9),                     // 009-017: brancos
    '2',                                 // 018: tipo inscrição empresa = 2 (CNPJ)
    padLeft(bank.cnpj.replace(/\D/g, ''), 14), // 019-032: CNPJ
    padRight(bank.convenio, 20),         // 033-052: convênio
    padLeft(bank.agencia.replace(/\D/g, ''), 5),  // 053-057: agência
    ' ',                                 // 058: dígito agência
    padLeft(bank.conta.replace(/\D/g, ''), 12),   // 059-070: conta
    ' ',                                 // 071: dígito conta
    ' ',                                 // 072: dígito ag/conta
    padRight(bank.nome.toUpperCase(), 30), // 073-102: nome empresa
    padRight('COBRANÇA', 30),            // 103-132: nome banco
    padRight('', 10),                    // 133-142: uso banco
    '1',                                 // 143: código remessa = 1
    fmtDate(now),                        // 144-151: data geração
    fmtTime(now),                        // 152-157: hora geração
    padLeft(seqArquivo, 6),              // 158-163: nº sequencial arquivo
    '103',                               // 164-166: versão layout = 103
    padLeft(0, 5),                       // 167-171: densidade
    padLeft(0, 20),                      // 172-191: uso banco
    padRight('', 20),                    // 192-211: uso empresa
    padRight('', 29),                    // 212-240: brancos
  ].join('');
}

// ─── CNAB 240 HEADER LOTE (Row type 1, 240 chars) ──────────────────────────
function headerLote(bank: BankInfo, lote = 1): string {
  return [
    padLeft(bank.code, 3),              // 001-003: banco
    padLeft(lote, 4),                    // 004-007: lote
    '1',                                 // 008: tipo = header lote
    'R',                                 // 009: operação = R (remessa)
    '01',                                // 010-011: tipo serviço = cobrança
    '040',                               // 012-014: forma lançamento
    '045',                               // 015-017: versão layout lote
    ' ',                                 // 018: uso banco
    '2',                                 // 019: tipo inscrição empresa
    padLeft(bank.cnpj.replace(/\D/g, ''), 14), // 020-033
    padRight(bank.convenio, 20),         // 034-053
    padLeft(bank.agencia.replace(/\D/g, ''), 5),
    ' ',
    padLeft(bank.conta.replace(/\D/g, ''), 12),
    ' ',
    ' ',
    padRight(bank.nome.toUpperCase(), 30), // nome empresa
    padRight('', 40),                    // mensagem 1
    padRight('', 40),                    // mensagem 2
    padLeft(0, 6),                       // nº remessa
    padLeft(0, 8),                       // data gravação
    padLeft(0, 8),                       // data crédito
    padRight('', 33),                    // uso banco
  ].join('');
}

// ─── CNAB 240 SEGMENTO P (Row type 3P, 240 chars) ──────────────────────────
function segmentoP(bank: BankInfo, boleto: BoletoItem, lote: number, seq: number): string {
  return [
    padLeft(bank.code, 3),
    padLeft(lote, 4),
    '3',                                 // tipo = detalhe
    padLeft(seq, 5),                     // nº sequencial registro
    'P',                                 // segmento
    ' ',                                 // uso banco
    '01',                                // código movimento = 01 (entrada)
    padLeft(bank.agencia.replace(/\D/g, ''), 5),
    ' ',
    padLeft(bank.conta.replace(/\D/g, ''), 12),
    ' ',
    ' ',
    padLeft(boleto.nossoNumero, 20),     // nosso número
    '1',                                 // carteira
    '1',                                 // forma de cadastramento
    '2',                                 // tipo de documento
    ' ',
    ' ',
    fmtDate(boleto.dueDate),             // data vencimento
    fmtAmount(boleto.amount),            // valor título
    padLeft(0, 3),                       // banco cobrador
    padLeft(0, 5),                       // agência cobradora
    ' ',
    '02',                                // espécie = DM
    'N',                                 // aceite
    fmtDate(new Date()),                 // data emissão
    '0',                                 // instrução 1
    '0',                                 // instrução 2
    fmtAmount(0),                        // juros/mora por dia
    padLeft(0, 8),                       // data limite desconto
    fmtAmount(0),                        // desconto
    fmtAmount(0),                        // IOF
    fmtAmount(0),                        // abatimento
    '1',                                 // id título empresa
    padRight(boleto.id.slice(0, 25), 25), // número título empresa
    '3',                                 // código protesto
    padLeft(0, 2),                       // prazo protesto
    '1',                                 // código baixa
    padLeft(0, 3),                       // prazo baixa
    padLeft(0, 4),                       // moeda
    padLeft(0, 10),                      // reservado
    padLeft(0, 1),                       // uso banco
  ].join('');
}

// ─── CNAB 240 SEGMENTO Q (Row type 3Q, 240 chars) ──────────────────────────
function segmentoQ(bank: BankInfo, boleto: BoletoItem, lote: number, seq: number): string {
  const docType = boleto.customerDoc.replace(/\D/g, '').length === 11 ? '1' : '2';
  return [
    padLeft(bank.code, 3),
    padLeft(lote, 4),
    '3',
    padLeft(seq, 5),
    'Q',
    ' ',
    '01',                                // código movimento
    docType,                             // tipo inscrição sacado
    padLeft(boleto.customerDoc.replace(/\D/g, ''), 15),
    padRight(boleto.customerName.toUpperCase().slice(0, 40), 40),
    padRight('', 40),                    // endereço
    padRight('', 15),                    // bairro
    padLeft(0, 8),                       // cep
    padRight('', 15),                    // cidade
    padRight('UF', 2),
    '0',                                 // tipo sacador
    padLeft(0, 15),                      // cnpj sacador
    padRight('', 40),                    // nome sacador
    padLeft(0, 3),                       // banco correspondente
    padLeft(0, 20),                      // nosso número corr.
    padLeft(0, 8),                       // brancos
  ].join('');
}

// ─── CNAB 240 TRAILER LOTE ──────────────────────────────────────────────────
function trailerLote(bank: BankInfo, lote: number, qtdRegistros: number, totalAmount: number): string {
  return [
    padLeft(bank.code, 3),
    padLeft(lote, 4),
    '5',                                 // tipo = trailer lote
    padRight('', 9),
    padLeft(qtdRegistros, 6),            // qtd registros
    padLeft(qtdRegistros, 6),            // qtd títulos cobrança simples
    fmtAmount(totalAmount, 2, 17),       // valor total cobrança simples
    padLeft(0, 6),                       // qtd títulos cobrança vinculada
    fmtAmount(0, 2, 17),
    padLeft(0, 6),
    fmtAmount(0, 2, 17),
    padLeft(0, 6),
    fmtAmount(0, 2, 17),
    padLeft(0, 8),                       // número aviso débito
    padRight('', 117),
  ].join('');
}

// ─── CNAB 240 TRAILER ARQUIVO ───────────────────────────────────────────────
function trailerArquivo(bank: BankInfo, qtdLotes: number, qtdRegistros: number): string {
  return [
    padLeft(bank.code, 3),
    padLeft(9999, 4),
    '9',
    padRight('', 9),
    padLeft(qtdLotes, 6),
    padLeft(qtdRegistros, 6),
    padLeft(0, 6),
    padRight('', 205),
  ].join('');
}

// ─── PUBLIC: Generate CNAB 240 Remessa ──────────────────────────────────────
export function generateCnab240(bank: BankInfo, boletos: BoletoItem[]): string {
  if (boletos.length === 0) throw new Error('Nenhum boleto fornecido');
  const now = new Date();
  const lines: string[] = [];
  const lote = 1;

  lines.push(headerArquivo(bank, now));
  lines.push(headerLote(bank, lote));

  let seq = 1;
  let totalAmount = 0;

  for (const boleto of boletos) {
    lines.push(segmentoP(bank, boleto, lote, seq++));
    lines.push(segmentoQ(bank, boleto, lote, seq++));
    totalAmount += boleto.amount;
  }

  const qtdDetalhes = seq - 1;
  const qtdLoteRegistros = qtdDetalhes + 2; // header + trailer + detalhes
  lines.push(trailerLote(bank, lote, qtdLoteRegistros + 2, totalAmount));

  const qtdTotal = lines.length + 1;
  lines.push(trailerArquivo(bank, 1, qtdTotal + 1));

  return lines.join('\r\n') + '\r\n';
}

// ─── PUBLIC: Parse CNAB 240 Retorno ─────────────────────────────────────────
export interface RetornoItem {
  nossoNumero: string;
  amount: number;
  paidDate: Date | null;
  occurrenceCode: string;
  success: boolean;
  errorDescription?: string;
}

const OCCURRENCE_CODES: Record<string, { success: boolean; desc: string }> = {
  '06': { success: true, desc: 'Liquidação' },
  '17': { success: true, desc: 'Liquidação com baixa por parte do banco' },
  '09': { success: false, desc: 'Baixa automática' },
  '10': { success: false, desc: 'Baixa por devolução' },
  '14': { success: false, desc: 'Vencimento alterado' },
  '02': { success: false, desc: 'Entrada confirmada' },
};

export function parseCnab240Retorno(content: string): RetornoItem[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const results: RetornoItem[] = [];

  for (const line of lines) {
    if (line.length < 240) continue;
    const tipoRegistro = line[7];
    const segmento = line[13];

    if (tipoRegistro !== '3' || segmento !== 'P') continue;

    const occurrenceCode = line.slice(15, 17).trim();
    const nossoNumero = line.slice(37, 57).trim();
    const dueDateStr = line.slice(73, 81);
    const amountStr = line.slice(81, 96);
    const paidDateStr = line.slice(145, 153);

    const amount = parseInt(amountStr) / 100;
    let paidDate: Date | null = null;
    if (paidDateStr && paidDateStr !== '00000000') {
      const d = paidDateStr;
      paidDate = new Date(`${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`);
    }

    const occ = OCCURRENCE_CODES[occurrenceCode];
    results.push({
      nossoNumero,
      amount,
      paidDate,
      occurrenceCode,
      success: occ?.success ?? false,
      errorDescription: occ ? undefined : `Código de ocorrência desconhecido: ${occurrenceCode}`,
    });
  }

  return results;
}
