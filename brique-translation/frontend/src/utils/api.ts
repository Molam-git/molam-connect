/**
 * BRIQUE TRANSLATION — API Client Utilities
 */

const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "unknown_error" }));
    throw new Error(error.error || error.detail || "Request failed");
  }

  return response.json();
}

export const api = {
  translate: async (text: string, sourceLang: string, targetLang: string, namespace = "default") => {
    return apiRequest("/api/translate", {
      method: "POST",
      body: JSON.stringify({ text, sourceLang, targetLang, namespace })
    });
  },

  getOverrides: async (namespace = "default", targetLang?: string) => {
    const params = new URLSearchParams({ namespace });
    if (targetLang) params.append("target_lang", targetLang);
    return apiRequest(`/api/admin/overrides?${params}`);
  },

  createOverride: async (data: {
    namespace?: string;
    source_text: string;
    target_lang: string;
    override_text: string;
  }) => {
    return apiRequest("/api/admin/overrides", {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  deleteOverride: async (id: string) => {
    return apiRequest(`/api/admin/overrides/${id}`, {
      method: "DELETE"
    });
  },

  getAudit: async (namespace = "default", limit = 200) => {
    return apiRequest(`/api/admin/audit?namespace=${namespace}&limit=${limit}`);
  }
};
