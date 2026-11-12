import { useCallback, useEffect, useRef, useState } from 'react';
import { kvGet, kvSet } from '../crm/secureKv';

/**
 * Red numbers that clear once opened (as on the web): the count when the person last opened the
 * place is kept on this phone, per user, and only what came after it is shown (4 seen, 1 new -> 1).
 * When the count drops (tickets dealt with), the kept number drops too, so the next new one shows.
 *
 * scope: the signed-in user's id ('' = not known yet, nothing shown). count: null = not loaded yet.
 */
export function useUnseen(scope: string, key: string, count: number | null): { unseen: number; markSeen: () => void } {
  const [seen, setSeen] = useState<number | null>(null);
  const storeKey = `seen.${key}`;

  useEffect(() => {
    if (!scope) return undefined;
    let alive = true;
    kvGet<number>(scope, storeKey).then((v) => alive && setSeen(typeof v === 'number' ? v : 0));
    return () => {
      alive = false;
    };
  }, [scope, storeKey]);

  useEffect(() => {
    if (!scope || seen === null || count === null || count >= seen) return;
    setSeen(count);
    kvSet(scope, storeKey, count);
  }, [scope, storeKey, seen, count]);

  // The latest count, so marking seen right after a refresh uses the fresh number.
  const latest = useRef(count);
  latest.current = count;
  const markSeen = useCallback(() => {
    const n = latest.current;
    if (!scope || n === null) return;
    setSeen(n);
    kvSet(scope, storeKey, n);
  }, [scope, storeKey]);

  const unseen = !scope || seen === null || count === null ? 0 : Math.max(0, count - seen);
  return { unseen, markSeen };
}
