export interface StaticQRPayload {
    version: number;
    type: 'merchant' | 'agent';
    merchantId?: string;
    terminalId?: string;
    agentId?: string;
    countryCode: string;
    currency: string;
}

export interface ParsedStaticQR extends StaticQRPayload {
    raw: string;
}

export interface FeeBreakdown {
    molam: number;
    partner: number;
    agent_share: number;
    total: number;
}

export interface PaymentPreview {
    amount: string;
    fees: {
        molam: string;
        partner: string;
        agent_share: string;
    };
    total: string;
    net_amount: string;
}