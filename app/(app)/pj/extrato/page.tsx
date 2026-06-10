'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/fetch';
import { ArrowDownCircle, ArrowUpCircle, Download, Printer, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

interface Line {
  id: string;
  date: string;
  description: string;
  category: string | null;
  tipo: 'entrada' | 'saida';
  amount: number;
  saldoAcumulado: number;
}

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string | null;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

const now = new Date();
const DEFAULT_START = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const DEFAULT_END = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

export default function ExtratoPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ saldoInicial: 0, saldoFinal: 0, totalEntradas: 0, totalSaidas: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ startDate, endDate });
    if (selectedBank) p.set('bankConnectionId', selectedBank);
    const r = await apiFetch(`/api/pj/extrato?${p}`);
    const d = await r.json();
    setBankAccounts(d.bankAccounts || []);
    setLines(d.lines || []);
    setTotals({ saldoInicial: d.saldoInicial || 0, saldoFinal: d.saldoFinal || 0, totalEntradas: d.totalEntradas || 0, totalSaidas: d.totalSaidas || 0 });
    setLoading(false);
  }, [selectedBank, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    const header = 'Data,Descrição,Categoria,Tipo,Valor,Saldo';
    const rows = lines.map((l) =>
      `${fmtDate(l.date)},"${l.description}","${l.category || ''}",${l.tipo},${l.amount.toFixed(2)},${l.saldoAcumulado.toFixed(2)}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extrato_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const CARDS = [
    { label: 'Saldo Inicial', value: totals.saldoInicial, color: 'text-slate-300', bg: 'bg-slate-700/60 border-slate-600' },
    { label: 'Total Entradas', value: totals.totalEntradas, color: 'text-green-400', bg: 'bg-green-900/20 border-green-700/40' },
    { label: 'Total Saídas', value: totals.totalSaidas, color: 'text-red-400', bg: 'bg-red-900/20 border-red-700/40' },
    { label: 'Saldo Final', value: totals.saldoFinal, color: totals.saldoFinal >= 0 ? 'text-blue-400' : 'text-orange-400', bg: 'bg-blue-900/20 border-blue-700/40' },
  ];

  return (
    <div className="p-6 space-y-6 print:p-0 print:space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-white">Extrato Bancário</h1>
          <p className="text-slate-400 text-sm mt-0.5">Movimentação consolidada por conta</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm">
          <option value="">Todas as contas</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>{b.bankName} {b.accountNumber ? `— ${b.accountNumber}` : ''}</option>
          ))}
        </select>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm" />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {CARDS.map((c) => (
          <div key={c.label} className={`border rounded-xl p-4 ${c.bg}`}>
            <p className="text-slate-400 text-xs mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Data</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Descrição</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Categoria</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Valor</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {/* Opening balance row */}
            <tr className="bg-slate-900/30">
              <td className="px-4 py-2 text-slate-500 text-xs">—</td>
              <td colSpan={2} className="px-4 py-2 text-slate-400 text-xs italic">Saldo inicial do período</td>
              <td className="px-4 py-2 text-right"></td>
              <td className="px-4 py-2 text-right text-slate-300 font-medium">{fmt(totals.saldoInicial)}</td>
            </tr>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
            ) : lines.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhuma movimentação no período</td></tr>
            ) : lines.map((l) => (
              <tr key={l.id} className="hover:bg-slate-700/30">
                <td className="px-4 py-3 text-slate-300">{fmtDate(l.date)}</td>
                <td className="px-4 py-3 text-white">{l.description}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{l.category || '—'}</td>
                <td className={`px-4 py-3 text-right font-medium ${l.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                  <span className="inline-flex items-center gap-1">
                    {l.tipo === 'entrada' ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                    {l.tipo === 'saida' ? '-' : '+'}{fmt(l.amount)}
                  </span>
                </td>
                <td className={`px-4 py-3 text-right font-medium ${l.saldoAcumulado >= 0 ? 'text-white' : 'text-red-400'}`}>
                  {fmt(l.saldoAcumulado)}
                </td>
              </tr>
            ))}
            {/* Final balance row */}
            {!loading && lines.length > 0 && (
              <tr className="bg-slate-900/30 font-semibold">
                <td colSpan={4} className="px-4 py-3 text-slate-300 text-sm">Saldo Final</td>
                <td className={`px-4 py-3 text-right text-lg font-bold ${totals.saldoFinal >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  {fmt(totals.saldoFinal)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
