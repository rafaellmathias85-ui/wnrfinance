// Dias úteis (paridade BomControle: "sábados e domingos não são considerados
// no cálculo de dias em atraso para envio de notificações de inadimplência").
// Inclui feriados nacionais fixos e móveis (Carnaval, Sexta-feira Santa, Corpus Christi).

function easterSunday(year: number): Date {
  // Algoritmo de Meeus/Jones/Butcher
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=março, 4=abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const holidayCache = new Map<number, Set<string>>();

/** Feriados nacionais do ano (fixos + móveis). */
export function nationalHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const fixed = [
    `${year}-01-01`, // Confraternização Universal
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalho
    `${year}-09-07`, // Independência
    `${year}-10-12`, // N. Sra. Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-11-20`, // Consciência Negra (Lei 14.759/2023)
    `${year}-12-25`, // Natal
  ];

  const easter = easterSunday(year);
  const movable = [
    dateKey(addDays(easter, -48)), // Segunda de Carnaval
    dateKey(addDays(easter, -47)), // Terça de Carnaval
    dateKey(addDays(easter, -2)), // Sexta-feira Santa
    dateKey(addDays(easter, 60)), // Corpus Christi
  ];

  const set = new Set([...fixed, ...movable]);
  holidayCache.set(year, set);
  return set;
}

export function isBusinessDay(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  return !nationalHolidays(date.getFullYear()).has(dateKey(date));
}

/** Dias úteis ENTRE duas datas (exclusivo no início, inclusivo no fim). */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  if (end <= start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor)) count++;
  }
  return count;
}

/** Soma N dias úteis a uma data. */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) remaining--;
  }
  return result;
}
