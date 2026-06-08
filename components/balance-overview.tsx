'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import { Building2, TrendingUp, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useFormatCurrency } from '@/hooks/use-format-currency';



interface BankBalance {
  id: string;
  bankName: string;
  accountType: string;
  openingBalance: number;
  totalExpenses: number;
  totalIncomes: number;
  calculatedBalance: number;
  investimentos: number;
  totalPatrimonio: number;
}

interface BalanceData {
  banks: BankBalance[];
  summary: {
    totalContaCorrente: number;
    totalInvestimentos: number;
    totalPatrimonio: number;
    investimentosSemBanco: number;
  };
}

export default function BalanceOverview({ refreshKey = 0 }: { refreshKey?: number }) {
  const formatCurrency = useFormatCurrency();
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/balance')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) {
    return <div className="h-32 bg-muted rounded-xl animate-pulse" />;
  }

  if (!data || !data.banks?.length) return null;

  const { summary, banks } = data;

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-foreground">Saldo Consolidado</h3>
        </div>

        {/* Summary totals */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-xs text-muted-foreground">Conta Corrente</p>
            <p className={`text-lg font-bold ${summary.totalContaCorrente >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(summary.totalContaCorrente)}
            </p>
          </div>
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-xs text-muted-foreground">Investimentos</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(summary.totalInvestimentos)}</p>
          </div>
          <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <p className="text-xs text-muted-foreground">Patrimônio Total</p>
            <p className={`text-lg font-bold ${summary.totalPatrimonio >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
              {formatCurrency(summary.totalPatrimonio)}
            </p>
          </div>
        </div>

        {/* Per bank */}
        <div className="space-y-2">
          {banks.map(bank => (
            <div key={bank.id} className="flex items-center justify-between py-2 border-b border-muted last:border-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{bank.bankName}</p>
                  <p className="text-xs text-muted-foreground">
                    CC: {formatCurrency(bank.calculatedBalance)}
                    {bank.investimentos > 0 && <> | Inv: {formatCurrency(bank.investimentos)}</>}
                  </p>
                </div>
              </div>
              <span className={`text-sm font-bold ${bank.totalPatrimonio >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(bank.totalPatrimonio)}
              </span>
            </div>
          ))}
          {summary.investimentosSemBanco > 0 && (
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Investimentos (sem banco)</p>
                </div>
              </div>
              <span className="text-sm font-bold text-green-600">{formatCurrency(summary.investimentosSemBanco)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
