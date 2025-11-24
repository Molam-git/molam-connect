import { pool } from "../db";
import { appendAudit } from "./audit";

export interface Action {
    name: string;
    params: any;
}

export interface Plan {
    id: string;
    actions: Action[];
    severity: string;
}

export interface ExecutionResult {
    success: boolean;
    results?: any[];
    error?: string;
    partial?: any[];
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

export async function dryRunPlan(plan: Plan): Promise<any> {
    const simulationResults = [];

    for (let i = 0; i < plan.actions.length; i++) {
        const action = plan.actions[i];
        if (!action) {
            simulationResults.push({
                idx: i,
                name: 'undefined',
                success: false,
                error: 'Action is undefined'
            });
            continue;
        }

        try {
            // Simulate action without actual execution
            const result = await simulateAction(action.name, action.params);
            simulationResults.push({
                idx: i,
                name: action.name,
                success: true,
                simulated_result: result
            });
        } catch (error) {
            simulationResults.push({
                idx: i,
                name: action.name,
                success: false,
                error: (error as Error).message
            });
        }
    }

    return { simulation_results: simulationResults, success: simulationResults.every(r => r.success) };
}

export async function executePlan(plan: Plan): Promise<ExecutionResult> {
    const results = [];

    for (let i = 0; i < plan.actions.length; i++) {
        const action = plan.actions[i];
        if (!action) {
            await markActionLog(plan.id, i, 'failure', null, 'Action is undefined');
            await appendAudit(null, "plan_action_failed", {
                plan_id: plan.id,
                action_idx: i,
                error: 'Action is undefined'
            });

            // Trigger rollback for HIGH/CRITICAL severity
            if (['HIGH', 'CRITICAL'].includes(plan.severity)) {
                await performRollback(plan, results);
            }

            return { success: false, error: 'Action is undefined', partial: results };
        }

        const idx = i;

        await insertActionLog(plan.id, idx, action.name, action.params, 'pending');

        try {
            const res = await runAction(action.name, action.params, { planId: plan.id, idx });
            await markActionLog(plan.id, idx, 'success', res);
            results.push({ idx, name: action.name, success: true, res });
        } catch (err) {
            await markActionLog(plan.id, idx, 'failure', null, (err as Error).message);
            await appendAudit(null, "plan_action_failed", {
                plan_id: plan.id,
                action_idx: idx,
                error: (err as Error).message
            });

            // Trigger rollback for HIGH/CRITICAL severity
            if (['HIGH', 'CRITICAL'].includes(plan.severity)) {
                await performRollback(plan, results);
            }

            return { success: false, error: (err as Error).message, partial: results };
        }
    }

    return { success: true, results };
}

export async function rollbackPlan(planId: string): Promise<ExecutionResult> {
    const planResult = await pool.query("SELECT * FROM ops_plans WHERE id=$1", [planId]);
    const plan = planResult.rows[0] as Plan;

    if (!plan) {
        throw new Error(`Plan with id ${planId} not found`);
    }

    const successfulActions = await pool.query(
        "SELECT * FROM ops_actions_log WHERE plan_id=$1 AND status='success' ORDER BY action_idx DESC",
        [planId]
    );

    const rollbackResults = [];

    for (const action of successfulActions.rows as ActionLog[]) {
        try {
            const res = await runRollback(action.action_name, action.payload, action.result);
            rollbackResults.push({
                action_idx: action.action_idx,
                action_name: action.action_name,
                success: true,
                result: res
            });
        } catch (err) {
            rollbackResults.push({
                action_idx: action.action_idx,
                action_name: action.action_name,
                success: false,
                error: (err as Error).message
            });
            // Continue rollback even if some fail
        }
    }

    return { success: rollbackResults.every(r => r.success), results: rollbackResults };
}

async function simulateAction(actionName: string, params: any): Promise<any> {
    // Implementation depends on specific action
    switch (actionName) {
        case 'freeze_payouts':
            return { simulated: true, message: `Would freeze payouts for zone: ${params.zone}` };
        case 'pause_partner':
            return { simulated: true, message: `Would pause partner: ${params.partner_id}` };
        case 'update_feature_flag':
            return { simulated: true, message: `Would update flag ${params.flag} to ${params.value}` };
        case 'notify_partner':
            return { simulated: true, message: `Would notify partner: ${params.partner_id}` };
        case 'set_agent_commission':
            return { simulated: true, message: `Would set commission for agent: ${params.agent_id}` };
        default:
            return { simulated: true, message: `Action ${actionName} would be executed` };
    }
}

async function runAction(actionName: string, params: any, context: any): Promise<any> {
    // Actual implementation calling respective microservices
    switch (actionName) {
        case 'freeze_payouts':
            // Call payouts service via mTLS
            return await callPayoutsService('freeze', params);
        case 'pause_partner':
            // Call partner service
            return await callPartnerService('pause', params);
        case 'update_feature_flag':
            // Call feature flag service
            return await callFeatureFlagService('update', params);
        case 'notify_partner':
            // Call notification service
            return await callNotificationService('notify', params);
        case 'set_agent_commission':
            // Call commission service
            return await callCommissionService('update', params);
        default:
            throw new Error(`Unknown action: ${actionName}`);
    }
}

async function runRollback(actionName: string, params: any, priorState: any): Promise<any> {
    switch (actionName) {
        case 'freeze_payouts':
            return await callPayoutsService('unfreeze', params);
        case 'pause_partner':
            return await callPartnerService('unpause', params);
        case 'update_feature_flag':
            return await callFeatureFlagService('revert', { ...params, prior_value: priorState?.prior_value });
        case 'notify_partner':
            // Notification rollback might send a follow-up message
            return await callNotificationService('notify_rollback', params);
        case 'set_agent_commission':
            return await callCommissionService('revert', { ...params, prior_commission: priorState?.prior_commission });
        default:
            throw new Error(`Rollback not implemented for: ${actionName}`);
    }
}

async function performRollback(plan: Plan, successfulActions: any[]): Promise<void> {
    for (let i = successfulActions.length - 1; i >= 0; i--) {
        const action = successfulActions[i];
        if (!action) continue;

        try {
            await runRollback(action.name, action.params, action.res);
        } catch (err) {
            console.error(`Rollback failed for action ${action.name}:`, err);
            // Log the rollback failure but continue with other rollbacks
            await appendAudit(null, "rollback_action_failed", {
                plan_id: plan.id,
                action_name: action.name,
                error: (err as Error).message
            });
        }
    }
}

async function insertActionLog(planId: string, idx: number, name: string, payload: any, status: string): Promise<void> {
    await pool.query(
        `INSERT INTO ops_actions_log(plan_id, action_idx, action_name, payload, status, started_at)
     VALUES($1,$2,$3,$4,$5,now())`,
        [planId, idx, name, payload, status]
    );
}

async function markActionLog(planId: string, idx: number, status: string, result: any, error?: string): Promise<void> {
    await pool.query(
        `UPDATE ops_actions_log SET status=$1, result=$2, error=$3, finished_at=now()
     WHERE plan_id=$4 AND action_idx=$5`,
        [status, result, error || null, planId, idx]
    );
}

// Stub implementations for service calls
async function callPayoutsService(operation: string, params: any): Promise<any> {
    // Implementation with mTLS
    console.log(`Calling payouts service: ${operation}`, params);
    return { success: true, operation, params, timestamp: new Date().toISOString() };
}

async function callPartnerService(operation: string, params: any): Promise<any> {
    // Implementation
    console.log(`Calling partner service: ${operation}`, params);
    return { success: true, operation, params, timestamp: new Date().toISOString() };
}

async function callFeatureFlagService(operation: string, params: any): Promise<any> {
    // Implementation
    console.log(`Calling feature flag service: ${operation}`, params);
    return { success: true, operation, params, timestamp: new Date().toISOString() };
}

async function callNotificationService(operation: string, params: any): Promise<any> {
    // Implementation
    console.log(`Calling notification service: ${operation}`, params);
    return { success: true, operation, params, timestamp: new Date().toISOString() };
}

async function callCommissionService(operation: string, params: any): Promise<any> {
    // Implementation
    console.log(`Calling commission service: ${operation}`, params);
    return { success: true, operation, params, timestamp: new Date().toISOString() };
}