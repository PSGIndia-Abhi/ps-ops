import { useEffect, useState } from "react";
import { apiFetch, safeJson } from "../../api";

// Number of NEW client service requests, for the admin sidebar badge.
// Refreshes every minute, on page change, and when the Service Requests page assigns/declines.
export default function useServiceRequestCount(pathname) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch("/api/service-requests/count");
        if (!res?.ok) return;
        const body = await safeJson(res);
        if (!cancelled) setCount(Number(body?.new || 0));
      } catch {
        /* badge is optional; ignore */
      }
    }
    load();
    const timer = setInterval(load, 60000);
    window.addEventListener("service-requests-changed", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("service-requests-changed", load);
    };
  }, [pathname]);

  return count;
}
