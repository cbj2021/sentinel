const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export async function apiFetch(endpoint, token, options = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function useApi(endpoint, token, deps = []) {
  const { useState, useEffect } = require("react");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch(endpoint, token)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [endpoint, token, ...deps]);

  return { data, loading, error, refetch: () => {} };
}
