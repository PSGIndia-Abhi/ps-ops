export const API_BASE = import.meta.env.VITE_API_BASE;

export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem("token");
  const isFormData = options.body instanceof FormData;
  const baseHeaders = {
    Authorization: token ? `Bearer ${token}` : "",
  };

  if (!isFormData) {
    baseHeaders["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...baseHeaders,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    console.warn("401 hit - not removing token");
    // localStorage.removeItem("token");
    // localStorage.removeItem("role");
    window.location.href = "/login";
    return;
  }

  return res;
}

// Util for parsing JSON responses
export async function safeJson(res) {
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}
// Util to try multiple endpoints for fetching branches (new vs old)
export async function fetchJsonWithFallback(endpoints) {
  let lastError = "Request failed";
  for (const endpoint of endpoints) {
    const res = await apiFetch(endpoint);
    if (res?.ok) {
      return await safeJson(res);
    }
    const data = await safeJson(res);
    lastError = data?.error || lastError;
    if (res?.status === 404 || res?.status === 405) {
      continue;
    }
    break;
  }
  throw new Error(lastError);
}
