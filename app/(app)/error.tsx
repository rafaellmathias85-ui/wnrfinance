'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="text-center max-w-md space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold">Erro na página</h2>
        <p className="text-muted-foreground text-sm">
          Ocorreu um erro ao carregar esta página. Tente novamente.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="default" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
          </Button>
          <Button onClick={() => router.push('/dashboard')} variant="outline" size="sm">
            Ir para Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
