import { useHideAmounts } from '@/lib/hide-amounts-context';
import { formatCurrency } from '@/lib/format';

export function useFormatCurrency() {
  const { hideAmounts } = useHideAmounts();
  return (value: number | null | undefined): string => {
    if (hideAmounts) return 'R$ \u2022\u2022\u2022\u2022';
    return formatCurrency(value);
  };
}
