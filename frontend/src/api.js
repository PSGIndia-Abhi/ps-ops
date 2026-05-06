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
