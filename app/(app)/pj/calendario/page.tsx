'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { ChevronLeft, ChevronRight, Calendar, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

interface CalEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  amount: number;
  type: 'payable' | 'receivable';
  status: string;
  category: string | null;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstWeekday(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

export default function CalendarioPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(`/api/pj/calendar?year=${year}&month=${month}`);
    const data = await r.json();
    setEvents(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelected(null);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelected(null);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstWeekday(year, month);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const eventsByDate: Record<string, CalEvent[]> = {};
  events.forEach(e => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });

  const dayKey = (d: number) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const selectedEvents = selected ? (eventsByDate[selected] ?? []) : [];

  const totalReceivable = events.filter(e => e.type === 'receivable' && e.status !== 'recebido').reduce((s, e) => s + e.amount, 0);
  const totalPayable = events.filter(e => e.type === 'payable' && e.status !== 'pago').reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Calendário Financeiro</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Vencimentos de contas a pagar e a receber</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-foreground font-medium text-sm w-36 text-center">
            {MONTHS_PT[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <ArrowUpCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
          <div>
            <p className="text-green-400 font-bold">{fmt(totalReceivable)}</p>
            <p className="text-muted-foreground text-xs">A receber no mês</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <ArrowDownCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-red-400 font-bold">{fmt(totalPayable)}</p>
            <p className="text-muted-foreground text-xs">A pagar no mês</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-7 border-b border-border">
            {DAYS_PT.map(d => (
              <div key={d} className="py-3 text-center text-xs font-medium text-muted-foreground">{d}</div>
            ))}
          </div>

          {loading ? (
            <div className="py-16 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : (
            <div className="grid grid-cols-7">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="h-20 border-b border-r border-border/50" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const key = dayKey(d);
                const dayEvents = eventsByDate[key] ?? [];
                const isToday = key === today;
                const isSelected = key === selected;
                const hasPayable = dayEvents.some(e => e.type === 'payable');
                const hasReceivable = dayEvents.some(e => e.type === 'receivable');
                const hasOverdue = dayEvents.some(e =>
                  (e.type === 'payable' && e.status !== 'pago' && key < today) ||
                  (e.type === 'receivable' && e.status !== 'recebido' && key < today)
                );

                return (
                  <div
                    key={key}
                    onClick={() => setSelected(isSelected ? null : key)}
                    className={`h-20 border-b border-r border-border/50 p-1.5 cursor-pointer transition-colors hover:bg-muted/40
                      ${isSelected ? 'bg-blue-900/30 border-blue-700' : ''}
                      ${(i + firstDay + 1) % 7 === 0 ? 'border-r-0' : ''}`}
                  >
                    <div className={`w-6 h-6 flex items-center justify-center text-xs font-medium rounded-full mb-1
                      ${isToday ? 'bg-blue-600 text-white' : 'text-foreground'}`}>
                      {d}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {hasOverdue && (
                        <div className="h-1.5 rounded-full bg-red-500 opacity-80" title="Vencido" />
                      )}
                      {!hasOverdue && hasReceivable && (
                        <div className="h-1.5 rounded-full bg-green-500 opacity-80" title="Recebível" />
                      )}
                      {!hasOverdue && hasPayable && (
                        <div className="h-1.5 rounded-full bg-orange-500 opacity-80" title="Pagável" />
                      )}
                      {dayEvents.length > 0 && (
                        <span className="text-muted-foreground text-[10px] leading-none">{dayEvents.length}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="px-4 py-2 border-t border-border flex gap-4">
            {[
              { color: 'bg-green-500', label: 'A receber' },
              { color: 'bg-orange-500', label: 'A pagar' },
              { color: 'bg-red-500', label: 'Vencido' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                <span className="text-muted-foreground text-xs">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Event sidebar */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-foreground font-medium text-sm">
              {selected
                ? new Date(selected + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
                : 'Selecione um dia'}
            </p>
          </div>
          {selectedEvents.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              {selected ? 'Nenhum vencimento neste dia' : 'Clique em um dia para ver os eventos'}
            </div>
          ) : (
            <div className="divide-y divide-border overflow-y-auto max-h-[480px]">
              {selectedEvents.map(e => (
                <div key={e.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    {e.type === 'receivable'
                      ? <ArrowUpCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      : <ArrowDownCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    }
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">{e.title}</p>
                      {e.category && <p className="text-muted-foreground text-xs">{e.category}</p>}
                      <p className={`text-sm font-bold mt-1 ${e.type === 'receivable' ? 'text-green-400' : 'text-red-400'}`}>
                        {fmt(e.amount)}
                      </p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      e.status === 'pago' || e.status === 'recebido'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {e.status === 'pago' ? 'Pago' : e.status === 'recebido' ? 'Recebido' : 'Pendente'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
