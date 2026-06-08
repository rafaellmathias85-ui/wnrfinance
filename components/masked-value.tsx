'use client';

import { useHideAmounts } from '@/lib/hide-amounts-context';

interface MaskedValueProps {
  value: string;
  className?: string;
}

export function MaskedValue({ value, className }: MaskedValueProps) {
  const { hideAmounts } = useHideAmounts();
  return (
    <span className={className}>
      {hideAmounts ? '\u2022\u2022\u2022\u2022\u2022\u2022' : value}
    </span>
  );
}

export function useMaskedCurrency() {
  const { hideAmounts } = useHideAmounts();
  return (value: string | number) => {
    if (hideAmounts) return 'R$ \u2022\u2022\u2022\u2022';
    return String(value);
  };
}
