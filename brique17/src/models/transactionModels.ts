export interface CashinTransaction {
    tx_id: string;
    agent_id: string;
    user_id: string;
    type: 'CASHIN';
    amount: number;
    currency: string;
    status: 'SUCCESS' | 'FAILED';
    created_at: Date;
}

export interface WalletTransaction {
    id: string;
    user_id: string;
    type: string;
    amount: number;
    currency: string;
    status: string;
    reference_id: string;
    created_at: Date;
}

export interface AgentTransaction {
    tx_id: string;
    agent_id: string;
    user_id: string;
    type: string;
    amount: number;
    currency: string;
    status: string;
    created_at: Date;
}