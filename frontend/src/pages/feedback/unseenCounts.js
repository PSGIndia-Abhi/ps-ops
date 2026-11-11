import { useEffect, useState } from "react";

// Red menu numbers that clear once opened: the count when the user last opened the item is kept in
// this browser, and only what came after it is shown (4 seen, 1 new -> "1"). When the count drops
// (tickets dealt with), the kept number drops too, so the next new one shows again.
const key = (prefix, k) => `badgeSeen.${prefix}.${k}`;

function read(k) {
  try {
    return Number(localStorage.getItem(k)) || 0;
  } catch {
    return 0;
  }
}

function write(k, n) {
  try {
    localStorage.setItem(k, String(n));
  } catch {
    // Storage blocked: the number just shows again next time.
  }
}

/**
 * prefix: who and where ("214.desk"), null until known. counts: { name: number | null } - null = not
 * loaded yet. Returns unseen(name) for the number to show and markSeen(name) to clear it.
 */
export function useUnseenCounts(prefix, counts) {
  const [, rerender] = useState(0);
  const json = JSON.stringify(counts);

  useEffect(() => {
    if (!prefix) return;
    for (const [k, n] of Object.entries(JSON.parse(json))) {
      if (n != null && n < read(key(prefix, k))) write(key(prefix, k), n);
    }
  }, [prefix, json]);

  const unseen = (k) => {
    const n = counts[k];
    if (!prefix || n == null) return 0;
    return Math.max(0, n - read(key(prefix, k)));
  };

  const markSeen = (k) => {
    const n = counts[k];
    if (!prefix || n == null) return;
    write(key(prefix, k), n);
    rerender((x) => x + 1);
  };

  return { unseen, markSeen };
}
