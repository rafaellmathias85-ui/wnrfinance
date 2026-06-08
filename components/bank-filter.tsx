'use client';
import { apiFetch } from '@/lib/fetch';
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';


interface Bank {
  id: string;
  bankName: string;
  status: string;
}

interface BankFilterProps {
  value: string;
  onChange: (bankId: string) => void;
  className?: string;
}

export default function BankFilter({ value, onChange, className = '' }: BankFilterProps) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch('/api/banks')
      .then(r => r.json())
      .then(d => { setBanks(d.connections || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  const activeBanks = banks.filter(b => b.status === 'active');

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
      >
        <option value="todos">Todos os bancos</option>
        <option value="sem_banco">Sem banco vinculado</option>
        {activeBanks.length > 0 ? (
          activeBanks.map(b => (
            <option key={b.id} value={b.id}>{b.bankName}</option>
          ))
        ) : (
          <option disabled>Cadastre bancos em "Bancos"</option>
        )}
      </select>
    </div>
  );
}
