'use client';

import { Briefcase } from 'lucide-react';
import { BankConnectionPage } from '@/components/bank-connection-page';

export default function BancosPagePJ() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 text-xs font-semibold">
          <Briefcase className="w-3 h-3" /> PJ
        </span>
      </div>
      <BankConnectionPage
        scope="PJ"
        title="Contas Bancárias da Empresa"
        subtitle="Conecte Banco Inter PJ por API oficial com mTLS ou importe OFX/CSV; Itaú PJ fica preparado com contingência OFX."
      />
    </div>
  );
}
