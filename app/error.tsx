'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="text-center max-w-md space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold">Algo deu errado</h2>
        <p className="text-muted-foreground text-sm">
          Ocorreu um erro inesperado. Tente novamente ou recarregue a p\u00e1gina.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="default" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
          </Button>
          <Button onClick={() => window.location.reload()} variant="outline" size="sm">
            Recarregar p\u00e1gina
          </Button>
        </div>
      </div>
    </div>
  );
}
