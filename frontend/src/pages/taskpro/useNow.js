import { useEffect, useState } from "react";

/** Current time as state, refreshed every `intervalMs` (default 1 min). */
export default function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);

  return now;
}
