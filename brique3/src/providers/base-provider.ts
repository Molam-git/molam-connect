export abstract class PaymentProvider {
    abstract name: string;
    abstract type: string;

    abstract createPaymentIntent(amount: number, currency: string, metadata: any): Promise<ProviderResponse>;
    abstract handleWebhook(payload: any): Promise<WebhookResult>;
    abstract checkStatus(reference: string): Promise<ProviderStatus>;
}

export interface ProviderResponse {
    success: boolean;
    reference: string;
    payment_url?: string;
    qr_code?: string;
    provider_tx_id?: string;
    error?: string;
}

export interface WebhookResult {
    success: boolean;
    reference: string;
    status: 'succeeded' | 'failed' | 'pending';
    provider_tx_id: string;
    amount: number;
    currency: string;
}

export interface ProviderStatus {
    status: 'succeeded' | 'failed' | 'pending';
    reference: string;
    provider_tx_id: string;
}