'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/fetch';

type PermMap = Record<string, Record<string, boolean>>;

// Module-level cache so all hook instances share it within a session
const cache: { userId?: string; perms?: PermMap; loading?: boolean; promise?: Promise<void> } = {};

export function usePermissions() {
  const [perms, setPerms] = useState<PermMap>(cache.perms || {});
  const [loading, setLoading] = useState(!cache.perms);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (cache.perms) {
      setPerms(cache.perms);
      setLoading(false);
      return;
    }
    if (!cache.promise) {
      cache.promise = apiFetch('/api/pj/permissions?userId=me')
        .then((r) => r.json())
        .then((d) => {
          const map: PermMap = {};
          (d.permissions || []).forEach((p: any) => {
            if (!map[p.module]) map[p.module] = {};
            map[p.module][p.action] = p.allowed;
          });
          cache.perms = map;
        })
        .catch(() => { cache.perms = {}; });
    }
    cache.promise.then(() => {
      if (mountedRef.current) {
        setPerms(cache.perms || {});
        setLoading(false);
      }
    });
    return () => { mountedRef.current = false; };
  }, []);

  const canDo = (module: string, action: string): boolean => {
    return !!perms[module]?.[action];
  };

  return { canDo, loading };
}

// Call this to invalidate the cache (e.g. after saving permissions)
export function invalidatePermissionsCache() {
  cache.perms = undefined;
  cache.promise = undefined;
}
