export interface QRParseResponse {
    type: 'merchant' | 'agent';
    merchant?: {
        id: string;
        display_name: string;
    };
    terminal?: {
        id: string;
        label: string;
    };
    agent?: {
        id: string;
        display_name: string;
    };
    country_code: string;
    currency: string;
    presets: Array<{
        amount: number;
        label?: string;
    }>;
    raw: string;
}

export interface CreatePaymentResponse {
    payment_id: string;
    status: string;
    preview: {
        amount: string;
        fees: {
            molam: string;
            partner: string;
            agent_share: string;
        };
        total: string;
    };
}