'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePJ } from '@/lib/pj-context';
import { BankConnectionPage } from '@/components/bank-connection-page';

export default function BancosPagePF() {
  const { activeEnv } = usePJ();
  const router = useRouter();

  useEffect(() => {
    if (activeEnv === 'pj') router.replace('/pj/bancos');
  }, [activeEnv, router]);

  if (activeEnv === 'pj') return null;

  return (
    <BankConnectionPage
      scope="PF"
      title="Minhas Contas Bancárias"
      subtitle="Cadastre manualmente ou conecte via Open Finance (quando ativado) para sincronizar extratos, cartões e investimentos automaticamente."
    />
  );
}
