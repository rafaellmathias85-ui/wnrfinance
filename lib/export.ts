// Export Engine: generates PDF (via HTML→print) and XLSX (via CSV-compatible XML)
// No heavy dependencies — uses browser-compatible approaches server-side

export interface ExportColumn {
  key: string;
  label: string;
  format?: (val: any) => string;
  width?: number;
}

export interface ExportOptions {
  title: string;
  subtitle?: string;
  companyName?: string;
  period?: string;
  columns: ExportColumn[];
  rows: Record<string, any>[];
  totals?: Record<string, any>;
  format: 'xlsx' | 'csv';
}

// ─────────────────────────────────────────
// CSV Export
// ─────────────────────────────────────────
export function generateCSV(opts: ExportOptions): string {
  const { columns, rows, title, period } = opts;

  const lines: string[] = [];
  lines.push(`"${title}${period ? ` — ${period}` : ''}"`);
  lines.push('');

  // Header
  lines.push(columns.map((c) => `"${c.label}"`).join(';'));

  // Rows
  for (const row of rows) {
    const cells = columns.map((col) => {
      const raw = row[col.key];
      const formatted = col.format ? col.format(raw) : (raw ?? '');
      return `"${String(formatted).replace(/"/g, '""')}"`;
    });
    lines.push(cells.join(';'));
  }

  // Totals
  if (opts.totals) {
    lines.push('');
    const totalCells = columns.map((col) => {
      const val = opts.totals![col.key];
      if (val === undefined) return '""';
      const formatted = col.format ? col.format(val) : String(val);
      return `"${formatted}"`;
    });
    lines.push(totalCells.join(';'));
  }

  return '﻿' + lines.join('\n'); // BOM for Excel UTF-8
}

// ─────────────────────────────────────────
// XLSX Export (SpreadsheetML XML — opens natively in Excel/LibreOffice)
// ─────────────────────────────────────────
export function generateXLSX(opts: ExportOptions): string {
  const { columns, rows, title, companyName, period } = opts;

  const xmlRows: string[] = [];

  // Title row
  xmlRows.push(xmlRow([xmlCell(title + (period ? ` — ${period}` : ''), 'header', columns.length)]));
  if (companyName) {
    xmlRows.push(xmlRow([xmlCell(companyName, 'sub', columns.length)]));
  }
  xmlRows.push(xmlRow([xmlCell('', 'empty', columns.length)]));

  // Header
  xmlRows.push(xmlRow(columns.map((c) => xmlCell(c.label, 'header'))));

  // Data rows
  for (const row of rows) {
    const cells = columns.map((col) => {
      const raw = row[col.key];
      const formatted = col.format ? col.format(raw) : (raw ?? '');
      const isNum = typeof raw === 'number';
      return xmlCell(String(formatted), isNum ? 'number' : 'data', 1, isNum ? raw : undefined);
    });
    xmlRows.push(xmlRow(cells));
  }

  // Totals row
  if (opts.totals) {
    const cells = columns.map((col) => {
      const val = opts.totals![col.key];
      if (val === undefined) return xmlCell('', 'data');
      const formatted = col.format ? col.format(val) : String(val);
      const isNum = typeof val === 'number';
      return xmlCell(formatted, 'total', 1, isNum ? val : undefined);
    });
    xmlRows.push(xmlRow(cells));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header">
   <Font ss:Bold="1" ss:Size="12"/>
   <Interior ss:Color="#1e3a5f" ss:Pattern="Solid"/>
   <Font ss:Color="#FFFFFF" ss:Bold="1"/>
  </Style>
  <Style ss:ID="sub">
   <Font ss:Bold="0" ss:Size="10" ss:Italic="1"/>
  </Style>
  <Style ss:ID="total">
   <Font ss:Bold="1"/>
   <Interior ss:Color="#f0f9ff" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="number">
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
  <Style ss:ID="data"/>
  <Style ss:ID="empty"/>
 </Styles>
 <Worksheet ss:Name="Relatório">
  <Table>${xmlRows.join('')}</Table>
 </Worksheet>
</Workbook>`;
}

function xmlCell(value: string, style = 'data', span = 1, numValue?: number): string {
  const spanAttr = span > 1 ? ` ss:MergeAcross="${span - 1}"` : '';
  if (numValue !== undefined && !isNaN(numValue)) {
    return `<Cell ss:StyleID="${style}"${spanAttr}><Data ss:Type="Number">${numValue}</Data></Cell>`;
  }
  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<Cell ss:StyleID="${style}"${spanAttr}><Data ss:Type="String">${escaped}</Data></Cell>`;
}

function xmlRow(cells: string[]): string {
  return `<Row>${cells.join('')}</Row>`;
}

// ─────────────────────────────────────────
// Currency formatter helper
// ─────────────────────────────────────────
export function fmtBRL(value: number | null | undefined): string {
  if (value == null) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleDateString('pt-BR');
}

export function fmtPercent(value: number | null | undefined): string {
  if (value == null) return '0,00%';
  return `${value.toFixed(2).replace('.', ',')}%`;
}
