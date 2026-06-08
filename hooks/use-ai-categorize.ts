import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/fetch';

type Suggestion = {
  categoryName: string;
  categoryType: 'INCOME' | 'EXPENSE';
  confidence: number;
  reasoning: string;
  matchedCategoryId: string | null;
};

type UseCategorizeResult = {
  suggestion: Suggestion | null;
  loading: boolean;
  categorize: (description: string, type?: 'INCOME' | 'EXPENSE' | 'auto') => void;
  clear: () => void;
};

export function useAiCategorize(debounceMs = 600): UseCategorizeResult {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDescRef = useRef('');

  const categorize = useCallback((description: string, type: 'INCOME' | 'EXPENSE' | 'auto' = 'auto') => {
    if (!description || description.trim().length < 3) {
      setSuggestion(null);
      return;
    }

    const trimmed = description.trim();
    if (trimmed === lastDescRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      lastDescRef.current = trimmed;
      setLoading(true);
      try {
        const res = await apiFetch('/api/ai/categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: trimmed, type }),
        });
        if (!res.ok) return;
        const data = await res.json();
        setSuggestion(data.suggestion || null);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }, debounceMs);
  }, [debounceMs]);

  const clear = useCallback(() => {
    setSuggestion(null);
    lastDescRef.current = '';
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { suggestion, loading, categorize, clear };
}
