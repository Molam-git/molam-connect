const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
    const token = localStorage.getItem('molam_token');

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers,
        },
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
}

export const routingApi = {
    get: (params: any) => apiFetch('/admin/routing?' + new URLSearchParams(params)),
    put: (body: any) => apiFetch('/admin/routing', { method: 'PUT', body: JSON.stringify(body) }),
    delete: (body: any) => apiFetch('/admin/routing', { method: 'DELETE', body: JSON.stringify(body) }),
};