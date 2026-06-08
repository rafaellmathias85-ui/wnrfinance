// OFX (Open Financial Exchange) and CSV bank statement parser
// Supports OFX 1.x (SGML), OFX 2.x (XML) and generic CSV

export interface ParsedTransaction {
  externalId: string;
  type: 'credit' | 'debit';
  amount: number;       // always positive
  date: Date;
  description: string;
  checkNum?: string;
  memo?: string;
}

export interface ParsedStatement {
  bankId?: string;
  accountId?: string;
  accountType?: string;
  currency?: string;
  startDate?: Date;
  endDate?: Date;
  transactions: ParsedTransaction[];
  source: 'ofx' | 'csv';
}

// ─────────────────────────────────────────────────
// OFX 1.x SGML parser (most Brazilian banks export this)
// ─────────────────────────────────────────────────
export function parseOFX(content: string): ParsedStatement {
  // OFX 1.x uses SGML (non-XML). Extract body after headers.
  const bodyMatch = content.match(/<OFX>([\s\S]*)/i);
  const body = bodyMatch ? `<OFX>${bodyMatch[1]}` : content;

  function getTag(tag: string, text: string): string {
    const m = new RegExp(`<${tag}>([^<]*)`, 'i').exec(text);
    return m ? m[1].trim() : '';
  }

  function getAllBlocks(tag: string, text: string): string[] {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) results.push(m[1]);
    return results;
  }

  const bankId = getTag('BANKID', body) || getTag('FID', body);
  const accountId = getTag('ACCTID', body);
  const accountType = getTag('ACCTTYPE', body);
  const currency = getTag('CURDEF', body) || 'BRL';

  const dtStartStr = getTag('DTSTART', body);
  const dtEndStr = getTag('DTEND', body);

  const transactions: ParsedTransaction[] = [];
  const stmtTrns = getAllBlocks('STMTTRN', body);

  for (const block of stmtTrns) {
    const trnType = getTag('TRNTYPE', block).toUpperCase();
    const dtPosted = getTag('DTPOSTED', block);
    const trnAmt = getTag('TRNAMT', block);
    const fitid = getTag('FITID', block);
    const name = getTag('NAME', block);
    const memo = getTag('MEMO', block);
    const checkNum = getTag('CHECKNUM', block);

    if (!dtPosted || !trnAmt) continue;

    const rawAmount = parseFloat(trnAmt.replace(',', '.'));
    const amount = Math.abs(rawAmount);
    const type: 'credit' | 'debit' =
      trnType === 'CREDIT' || rawAmount > 0 ? 'credit' : 'debit';

    const date = parseOFXDate(dtPosted);
    if (!date) continue;

    transactions.push({
      externalId: fitid || `${dtPosted}_${trnAmt}_${Math.random()}`,
      type,
      amount,
      date,
      description: name || memo || 'Transação importada',
      memo: memo || undefined,
      checkNum: checkNum || undefined,
    });
  }

  return {
    bankId,
    accountId,
    accountType,
    currency,
    startDate: dtStartStr ? parseOFXDate(dtStartStr) || undefined : undefined,
    endDate: dtEndStr ? parseOFXDate(dtEndStr) || undefined : undefined,
    transactions,
    source: 'ofx',
  };
}

function parseOFXDate(dateStr: string): Date | null {
  // OFX dates: YYYYMMDDHHMMSS[.mmm][+/-zone]
  const m = dateStr.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
}

// ─────────────────────────────────────────────────
// CSV parser with auto-detection of column mapping
// ─────────────────────────────────────────────────
export interface CSVMapping {
  dateCol: number;
  descriptionCol: number;
  amountCol: number;
  typeCol?: number;    // optional: "C"/"D" or "credit"/"debit"
  idCol?: number;
  separator?: ';' | ',';
  dateFormat?: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
  skipRows?: number;
  invertSign?: boolean; // some banks export negative = credit
}

export function parseCSV(content: string, mapping?: CSVMapping): ParsedStatement {
  // Auto-detect separator
  const separator = mapping?.separator || (content.includes(';') ? ';' : ',');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  // Auto-detect mapping if not provided
  const skip = mapping?.skipRows ?? autoDetectHeaderRow(lines, separator);
  const resolved = mapping || autoDetectMapping(lines, separator, skip);

  const transactions: ParsedTransaction[] = [];
  const dataLines = lines.slice(skip + 1); // skip header

  for (const line of dataLines) {
    if (!line.trim()) continue;
    const cols = splitCSVLine(line, separator);

    const rawDate = cols[resolved.dateCol]?.trim();
    const rawDesc = cols[resolved.descriptionCol]?.trim();
    const rawAmount = cols[resolved.amountCol]?.trim();

    if (!rawDate || !rawAmount) continue;

    const date = parseCSVDate(rawDate, resolved.dateFormat);
    if (!date) continue;

    const rawNum = parseFloat(rawAmount.replace(/[^\d.,-]/g, '').replace(',', '.'));
    if (isNaN(rawNum)) continue;

    let type: 'credit' | 'debit';
    let amount = Math.abs(rawNum);

    if (resolved.typeCol !== undefined) {
      const typeStr = cols[resolved.typeCol]?.trim().toLowerCase();
      type = ['c', 'credit', 'crédito', 'credito', '+'].includes(typeStr) ? 'credit' : 'debit';
    } else {
      const inverted = resolved.invertSign ?? false;
      const positive = rawNum > 0;
      type = (inverted ? !positive : positive) ? 'credit' : 'debit';
    }

    const id = resolved.idCol !== undefined ? cols[resolved.idCol]?.trim() : undefined;

    transactions.push({
      externalId: id || `csv_${rawDate}_${rawAmount}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      amount,
      date,
      description: rawDesc || 'Transação importada',
    });
  }

  return { transactions, source: 'csv' };
}

function autoDetectHeaderRow(lines: string[], sep: string): number {
  // Find first row that has date-looking content in first few cols
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = lines[i].split(sep);
    if (cols.some((c) => /\d{2}[/.-]\d{2}[/.-]\d{2,4}/.test(c) || /\d{4}-\d{2}-\d{2}/.test(c))) {
      return i > 0 ? i - 1 : 0; // header is one row before first data row
    }
  }
  return 0;
}

function autoDetectMapping(lines: string[], sep: string, skip: number): CSVMapping {
  const header = (lines[skip] || '').split(sep).map((h) => h.toLowerCase().replace(/['"]/g, '').trim());

  const dateKeywords = ['data', 'date', 'dt', 'lançamento', 'lancamento'];
  const descKeywords = ['descrição', 'descricao', 'histórico', 'historico', 'memo', 'description', 'lançamento', 'lancamento'];
  const amountKeywords = ['valor', 'amount', 'vlr', 'value', 'montante', 'débito', 'debito', 'crédito', 'credito'];
  const typeKeywords = ['tipo', 'type', 'operação', 'operacao', 'dc', 'd/c'];

  const findIdx = (keywords: string[]) =>
    keywords.reduce((found, kw) => {
      if (found >= 0) return found;
      return header.findIndex((h) => h.includes(kw));
    }, -1);

  return {
    dateCol: Math.max(0, findIdx(dateKeywords)),
    descriptionCol: Math.max(1, findIdx(descKeywords)),
    amountCol: Math.max(2, findIdx(amountKeywords)),
    typeCol: findIdx(typeKeywords) >= 0 ? findIdx(typeKeywords) : undefined,
    separator: sep as ';' | ',',
    skipRows: skip,
  };
}

function splitCSVLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSVDate(dateStr: string, format?: string): Date | null {
  dateStr = dateStr.replace(/['"]/g, '').trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = dateStr.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  if (dmy) return new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}T12:00:00Z`);

  // YYYY-MM-DD
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`);

  // MM/DD/YYYY
  const mdy = dateStr.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  if (mdy && format === 'MM/DD/YYYY') return new Date(`${mdy[3]}-${mdy[1]}-${mdy[2]}T12:00:00Z`);

  return null;
}

// ─────────────────────────────────────────────────
// Auto-detect OFX or CSV from content
// ─────────────────────────────────────────────────
export function parseStatement(content: string, filename?: string): ParsedStatement {
  const ext = filename?.toLowerCase().split('.').pop();
  if (ext === 'ofx' || ext === 'qfx' || content.includes('<OFX>') || content.includes('OFXHEADER')) {
    return parseOFX(content);
  }
  return parseCSV(content);
}
