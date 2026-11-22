import { useEffect, useState } from "react";

/** Value that follows `value` after `ms` of no changes (for search boxes). */
export default function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
