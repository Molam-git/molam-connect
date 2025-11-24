// Types partagés pour l'application Ops

export interface Action {
    name: string;
    params: any;
}

export interface Approval {
    user_id: string;
    role: string;
    ts: string;
    decision: 'accept' | 'reject';
    note: string;
    signature: string;
}

export interface Plan {
    id: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    created_at: string;
    created_by?: string;
    required_approvals: number;
    approvals: Approval[];
    scope?: any;
    actions: Action[];
    dry_run_result?: any;
    execute_result?: any;
    updated_at?: string;
    actions_log?: ActionLog[];
}

export interface ActionLog {
    id: string;
    plan_id: string;
    action_idx: number;
    action_name: string;
    payload: any;
    started_at: string;
    finished_at: string | null;
    status: string;
    result: any;
    error: string | null;
    created_at: string;
}

export interface MolamUser {
    id: string;
    roles: string[];
    zone: string;
    mfa: boolean;
}