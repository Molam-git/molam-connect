import { api } from './client';

export type Balance = { currency: string; amount: number };
export type Tx = {
    id: string; kind: 'P2P' | 'CASH_IN' | 'CASH_OUT' | 'BILL' | 'MERCHANT' | 'FEE';
    amount: number; currency: string; created_at: string;
    counterparty?: string; fee?: number; meta?: Record<string, any>;
};

export const WalletAPI = {
    getBalances: () => api<Balance[]>('/api/pay/wallet/balances'),
    getHistory: (limit = 25, cursor?: string) => api<{ items: Tx[], next?: string }>(`/api/pay/wallet/history?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`),
    estimateP2P: (payload: { to: string; amount: number; currency: string }) =>
        api<{ fee: number; total: number; sira_route: string; hints: string[] }>('/api/pay/p2p/estimate', { method: 'POST', body: JSON.stringify(payload) }),
    sendP2P: (payload: { to: string; amount: number; currency: string; note?: string }) =>
        api<{ tx_id: string; audit_id: string }>('/api/pay/p2p/send', { method: 'POST', body: JSON.stringify(payload) }),

    // QR
    myQR: () => api<{ qr: string; payload: any }>('/api/pay/qr/my'),
    payQR: (payload: { qr: string; amount?: number; currency?: string }) =>
        api<{ tx_id: string; fee: number }>('/api/pay/qr/pay', { method: 'POST', body: JSON.stringify(payload) }),

    // Bank
    bankRoutes: () => api<{ id: number; bank_code: string; currency: string; name: string; fee_fixed: number; fee_bps: number }[]>('/api/pay/bank/routes'),
    bankCashIn: (payload: { route_id: number; amount: number; currency: string; for_self: boolean; recipient?: string }) =>
        api<{ order_id: string; fee: number }>('/api/pay/bank/cashin', { method: 'POST', body: JSON.stringify(payload) }),
    bankCashOut: (payload: { route_id: number; amount: number; currency: string }) =>
        api<{ order_id: string; fee: number }>('/api/pay/bank/cashout', { method: 'POST', body: JSON.stringify(payload) }),

    // Agents
    nearestAgents: (geo: { lat: number; lng: number }) =>
        api<{ id: number; name: string; distance_m: number; float_available: number }[]>(`/api/pay/agents/near?lat=${geo.lat}&lng=${geo.lng}`),

    // Bills
    billCatalog: () => api<{ code: string; name: string; fee: number }[]>('/api/pay/bills/catalog'),
    payBill: (payload: { code: string; account: string; amount: number; currency: string }) =>
        api<{ tx_id: string }>('/api/pay/bills/pay', { method: 'POST', body: JSON.stringify(payload) }),

    // Meta
    legalDocs: () => api<{ cgu: string; privacy: string; legal: string }>('/api/legal'),
};