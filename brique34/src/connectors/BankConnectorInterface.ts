// src/connectors/BankConnectorInterface.ts
export interface BankStatementLine {
    id: string;
    bank_profile_id: string;
    statement_date: Date;
    value_date: Date;
    amount: number;
    currency: string;
    description: string;
    reference: string;
}

export interface BankConnector {
    name: string;

    sendPayment(payout: any): Promise<{
        status: 'sent' | 'failed';
        provider_ref?: string;
        details?: any;
    }>;

    getPaymentStatus(provider_ref: string): Promise<any>;

    uploadStatement(fileBuffer: Buffer, meta: any): Promise<{ imported_id: string }>;

    parseStatement(imported_id: string): Promise<BankStatementLine[]>;
}