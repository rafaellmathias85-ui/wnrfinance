'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Filter, X } from 'lucide-react';

export interface AdvancedFilterValues {
  dateFrom: string;
  dateTo: string;
  dateType: 'vencimento' | 'competencia' | 'pagamento';
  status: string[];
  categoryId: string;
  bankConnectionId: string;
  counterpart: string;
  costCenterId: string;
  minValue: string;
  maxValue: string;
  tagIds: string[];
  paymentMethod: string;
}

const EMPTY_FILTERS: AdvancedFilterValues = {
  dateFrom: '',
  dateTo: '',
  dateType: 'vencimento',
  status: [],
  categoryId: '',
  bankConnectionId: '',
  counterpart: '',
  costCenterId: '',
  minValue: '',
  maxValue: '',
  tagIds: [],
  paymentMethod: '',
};

interface Props {
  filters: AdvancedFilterValues;
  onApply: (f: AdvancedFilterValues) => void;
  categories?: Array<{ id: string; name: string }>;
  costCenters?: Array<{ id: string; name: string }>;
  bankConnections?: Array<{ id: string; name: string }>;
  tags?: Array<{ id: string; name: string }>;
  statusOptions?: Array<{ value: string; label: string }>;
}

export function AdvancedFilters({
  filters,
  onApply,
  categories = [],
  costCenters = [],
  bankConnections = [],
  tags = [],
  statusOptions = [
    { value: 'pendente', label: 'Pendente' },
    { value: 'pago', label: 'Pago / Recebido' },
    { value: 'vencido', label: 'Vencido' },
    { value: 'cancelado', label: 'Cancelado' },
  ],
}: Props) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<AdvancedFilterValues>(filters);

  const set = <K extends keyof AdvancedFilterValues>(key: K, value: AdvancedFilterValues[K]) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const toggleMulti = (arr: string[], value: string): string[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const activeCount = [
    local.dateFrom || local.dateTo,
    local.status.length > 0,
    local.categoryId,
    local.bankConnectionId,
    local.counterpart,
    local.costCenterId,
    local.minValue || local.maxValue,
    local.tagIds.length > 0,
    local.paymentMethod,
  ].filter(Boolean).length;

  const handleApply = () => {
    onApply(local);
    setOpen(false);
  };

  const handleClear = () => {
    setLocal(EMPTY_FILTERS);
    onApply(EMPTY_FILTERS);
    setOpen(false);
  };

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
      >
        <Filter className="w-4 h-4" />
        Filtros Avançados
        {activeCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full font-medium">
            {activeCount}
          </span>
        )}
        {open ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
      </button>

      {open && (
        <div className="mt-2 bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
          {/* Row 1: Period */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tipo de data</label>
              <select
                value={local.dateType}
                onChange={(e) => set('dateType', e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="vencimento">Data de Vencimento</option>
                <option value="competencia">Data de Competência</option>
                <option value="pagamento">Data de Pagamento</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">De</label>
              <input
                type="date"
                value={local.dateFrom}
                onChange={(e) => set('dateFrom', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Até</label>
              <input
                type="date"
                value={local.dateTo}
                onChange={(e) => set('dateTo', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Row 2: Status multi-select */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Status</label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((s) => {
                const active = local.status.includes(s.value);
                return (
                  <button
                    key={s.value}
                    onClick={() => set('status', toggleMulti(local.status, s.value))}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-900 border-slate-600 text-slate-400 hover:border-slate-400'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Category, Cost Center, Bank */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Categoria</label>
              <select
                value={local.categoryId}
                onChange={(e) => set('categoryId', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todas</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Centro de Custo</label>
              <select
                value={local.costCenterId}
                onChange={(e) => set('costCenterId', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Conta Bancária</label>
              <select
                value={local.bankConnectionId}
                onChange={(e) => set('bankConnectionId', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todas</option>
                {bankConnections.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          {/* Row 4: Counterpart, Value range, Payment method */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Cliente / Fornecedor</label>
              <input
                type="text"
                value={local.counterpart}
                onChange={(e) => set('counterpart', e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Valor mínimo</label>
              <input
                type="number"
                step="0.01"
                value={local.minValue}
                onChange={(e) => set('minValue', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Valor máximo</label>
              <input
                type="number"
                step="0.01"
                value={local.maxValue}
                onChange={(e) => set('maxValue', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Row 5: Tags and Payment method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tags.length > 0 && (
              <div>
                <label className="block text-xs text-slate-400 mb-2">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => {
                    const active = local.tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => set('tagIds', toggleMulti(local.tagIds, t.id))}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          active
                            ? 'bg-purple-600 border-purple-500 text-white'
                            : 'bg-slate-900 border-slate-600 text-slate-400 hover:border-slate-400'
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Forma de Pagamento</label>
              <select
                value={local.paymentMethod}
                onChange={(e) => set('paymentMethod', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todas</option>
                <option value="pix">PIX</option>
                <option value="boleto">Boleto</option>
                <option value="transferencia">Transferência</option>
                <option value="cartao">Cartão</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-700">
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm"
            >
              <X className="w-4 h-4" />
              Limpar filtros
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium"
            >
              Aplicar Filtros
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { EMPTY_FILTERS };
