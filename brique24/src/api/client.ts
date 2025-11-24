import * as SecureStore from 'expo-secure-store';

export const BASE_URL = 'https://api.molam.com';

async function getToken() {
    return SecureStore.getItemAsync('molam_token');
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
    };
    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${body || res.statusText}`);
    }
    return res.json() as Promise<T>;
}