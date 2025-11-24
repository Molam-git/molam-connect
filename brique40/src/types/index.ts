// src/types/index.ts
export interface FraudCase {
    id: string;
    correlation_id: string;
    origin_module: string;
    entity_type: string;
    entity_id: string;
    severity: string;
    score: number;
    suggested_action: string;
    status: string;
    assigned_to?: string;
    playbook_id?: string;
    context: any;
    created_at: string;
    updated_at: string;
}

export interface FraudPlaybook {
    id: string;
    name: string;
    description?: string;
    version: number;
    dsl: any;
    is_active: boolean;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

export interface FraudCaseAction {
    id: string;
    fraud_case_id: string;
    actor_id?: string;
    action_type: string;
    payload: any;
    idempotency_key?: string;
    created_at: string;
}

export interface FraudApproval {
    id: string;
    fraud_case_id: string;
    action_type: string;
    required_signers: any;
    approvals: any;
    status: string;
    created_at: string;
}

export interface FraudOperator {
    user_id: string;
    display_name: string;
    roles: string[];
    timezone: string;
    phone: string;
    email: string;
    is_active: boolean;
    created_at: string;
}

export interface FraudAutomationLog {
    id: string;
    source: string;
    event: any;
    created_at: string;
}

export interface MolamUser {
    id: string;
    roles: string[];
    lang?: string;
    agentId?: string;
    email?: string;
}

export interface PlaybookStep {
    name: string;
    type: string;
    params: any;
    condition?: any;
    on_failure?: any;
    wait_for_approval?: boolean;
    continue_on_failure?: boolean;
}

export interface PlaybookDSL {
    idempotency_key?: string;
    steps: PlaybookStep[];
    rollback?: PlaybookStep[];
}