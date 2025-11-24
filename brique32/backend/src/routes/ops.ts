import express from "express";
import { pool } from "../db";
import { requireRole, authzMiddleware, MolamUser } from "../utils/authz";
import { dryRunPlan, executePlan, rollbackPlan } from "../services/executor";
import { appendAudit } from "../services/audit";
import { signApproval } from "../services/signer";

export const opsRouter = express.Router();

// Type guard to check if user is defined
function isUserAuthenticated(user: any): user is MolamUser {
    return user && typeof user.id === 'string' && Array.isArray(user.roles);
}

// Helper function to get user with type safety
function getAuthenticatedUser(req: express.Request): MolamUser {
    if (!req.user || !isUserAuthenticated(req.user)) {
        throw new Error("User not authenticated");
    }
    return req.user;
}

// Helper function to get planId with validation
function getPlanId(req: express.Request): string {
    const planId = req.params.id;
    if (!planId || typeof planId !== 'string') {
        throw new Error("Plan ID is required");
    }
    return planId;
}

// Create new plan
opsRouter.post("/", requireRole(["ops_user", "ops_manager"]), async (req, res) => {
    try {
        const user = getAuthenticatedUser(req);
        const { title, description, scope, actions, severity } = req.body;

        // Validate required fields
        if (!title || !actions || !severity) {
            return res.status(400).json({ error: "Title, actions, and severity are required" });
        }

        // Compute required_approvals from policy
        const { rows } = await pool.query(
            "SELECT required_signatures, allowed_roles FROM ops_approvals_policy WHERE severity=$1",
            [severity]
        );
        const required = rows[0]?.required_signatures || (severity === 'CRITICAL' ? 3 : 1);
        const allowed_roles = rows[0]?.allowed_roles || ['ops_manager', 'cto', 'cfo'];

        const insert = await pool.query(
            `INSERT INTO ops_plans(title, description, created_by, scope, actions, severity, required_approvals)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [title, description, user.id, scope, actions, severity, required]
        );
        const plan = insert.rows[0];
        await appendAudit(user.id, "plan_created", { plan_id: plan.id, severity, scope, actions });
        return res.status(201).json(plan);
    } catch (error) {
        console.error("Error creating plan:", error);
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message });
        } else {
            return res.status(500).json({ error: "Internal server error" });
        }
    }
});

// Dry-run simulation
opsRouter.post("/:id/dry-run", requireRole(["ops_user", "ops_manager", "pay_zone_admin"]), async (req, res) => {
    try {
        const user = getAuthenticatedUser(req);
        const planId = getPlanId(req);

        const planResult = await pool.query("SELECT * FROM ops_plans WHERE id=$1", [planId]);
        const plan = planResult.rows[0];
        if (!plan) {
            return res.status(404).json({ error: "Plan not found" });
        }

        const result = await dryRunPlan(plan);
        await pool.query(
            "UPDATE ops_plans SET dry_run_result=$1, status='pending_approval', updated_at=now() WHERE id=$2",
            [result, planId]
        );
        await appendAudit(user.id, "plan_dry_run", { plan_id: planId, result });
        return res.json({ planId, result });
    } catch (error) {
        console.error("Error during dry-run:", error);
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message });
        } else {
            return res.status(500).json({ error: "Internal server error" });
        }
    }
});

// Approve/reject plan
opsRouter.post("/:id/approve", requireRole(["ops_manager", "cto", "cfo", "pay_zone_admin"]), async (req, res) => {
    try {
        const user = getAuthenticatedUser(req);
        const planId = getPlanId(req);
        const { decision, note } = req.body; // decision: accept|reject

        if (!decision || (decision !== 'accept' && decision !== 'reject')) {
            return res.status(400).json({ error: "Decision must be 'accept' or 'reject'" });
        }

        if (decision === 'reject' && !note) {
            return res.status(400).json({ error: "Note is required when rejecting a plan" });
        }

        // Add approval entry with signature
        const signature = await signApproval(user.id, planId);
        const approval = {
            user_id: user.id,
            role: user.roles,
            ts: new Date().toISOString(),
            decision,
            note: note || '',
            signature
        };

        await pool.query(
            "UPDATE ops_plans SET approvals = approvals || $1::jsonb, updated_at=now() WHERE id=$2",
            [JSON.stringify([approval]), planId]
        );
        await appendAudit(user.id, "plan_approval", { plan_id: planId, approval });

        // Check if required approvals reached
        const planResult = await pool.query(
            "SELECT approvals, required_approvals, status FROM ops_plans WHERE id=$1",
            [planId]
        );
        const plan = planResult.rows[0];

        if (!plan) {
            return res.status(404).json({ error: "Plan not found" });
        }

        const approvals = plan.approvals || [];
        const acceptedApprovals = approvals.filter((a: any) => a.decision === 'accept');

        if (acceptedApprovals.length >= plan.required_approvals && plan.status === 'pending_approval') {
            await pool.query("UPDATE ops_plans SET status='approved', updated_at=now() WHERE id=$1", [planId]);
        }

        return res.json({ ok: true });
    } catch (error) {
        console.error("Error during approval:", error);
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message });
        } else {
            return res.status(500).json({ error: "Internal server error" });
        }
    }
});

// Execute plan
opsRouter.post("/:id/execute", requireRole(["ops_manager", "pay_zone_admin"]), async (req, res) => {
    try {
        const user = getAuthenticatedUser(req);
        const planId = getPlanId(req);

        const planResult = await pool.query("SELECT * FROM ops_plans WHERE id=$1", [planId]);
        const plan = planResult.rows[0];
        if (!plan) {
            return res.status(404).json({ error: "Plan not found" });
        }
        if (plan.status !== 'approved') {
            return res.status(409).json({ error: "Plan not approved" });
        }

        await pool.query("UPDATE ops_plans SET status='executing', updated_at=now() WHERE id=$1", [planId]);
        await appendAudit(user.id, "plan_execution_started", { plan_id: planId });

        // Execute asynchronously via executor service
        executePlan(plan).then(result => {
            pool.query(
                "UPDATE ops_plans SET execute_result=$1, status=$2, updated_at=now() WHERE id=$3",
                [result, result.success ? 'completed' : 'failed', planId]
            );
            appendAudit('system', "plan_execution_finished", { plan_id: planId, result });
        }).catch(err => {
            pool.query(
                "UPDATE ops_plans SET execute_result=$1, status='failed', updated_at=now() WHERE id=$2",
                [{ error: err.message }, planId]
            );
            appendAudit('system', "plan_execution_failed", { plan_id: planId, error: err.message });
        });

        return res.json({ started: true });
    } catch (error) {
        console.error("Error during execution:", error);
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message });
        } else {
            return res.status(500).json({ error: "Internal server error" });
        }
    }
});

// Rollback plan
opsRouter.post("/:id/rollback", requireRole(["ops_manager", "cto", "cfo"]), async (req, res) => {
    try {
        const user = getAuthenticatedUser(req);
        const planId = getPlanId(req);
        const reason = req.body.reason || "manual_rollback";

        await pool.query("UPDATE ops_plans SET status='rolling_back', updated_at=now() WHERE id=$1", [planId]);
        await appendAudit(user.id, "rollback_initiated", { plan_id: planId, reason });

        rollbackPlan(planId).then(() => {
            pool.query("UPDATE ops_plans SET status='rolledback', updated_at=now() WHERE id=$1", [planId]);
            appendAudit('system', "rollback_completed", { plan_id: planId });
        }).catch(err => {
            pool.query("UPDATE ops_plans SET status='rollback_failed', updated_at=now() WHERE id=$1", [planId]);
            appendAudit('system', "rollback_failed", { plan_id: planId, error: err.message });
        });

        return res.json({ rollback_started: true });
    } catch (error) {
        console.error("Error during rollback:", error);
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message });
        } else {
            return res.status(500).json({ error: "Internal server error" });
        }
    }
});

// List plans
opsRouter.get("/", requireRole(["ops_user", "ops_manager", "pay_zone_admin"]), async (req, res) => {
    try {
        const { limit = 50, offset = 0, status, severity } = req.query;
        let query = "SELECT * FROM ops_plans WHERE 1=1";
        const params: any[] = [];
        let paramCount = 0;

        if (status && typeof status === 'string') {
            paramCount++;
            query += ` AND status = $${paramCount}`;
            params.push(status);
        }
        if (severity && typeof severity === 'string') {
            paramCount++;
            query += ` AND severity = $${paramCount}`;
            params.push(severity);
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        params.push(parseInt(limit as string), parseInt(offset as string));

        const { rows } = await pool.query(query, params);
        return res.json(rows);
    } catch (error) {
        console.error("Error listing plans:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Get plan details
opsRouter.get("/:id", requireRole(["ops_user", "ops_manager", "pay_zone_admin"]), async (req, res) => {
    try {
        const planId = getPlanId(req);

        const planResult = await pool.query("SELECT * FROM ops_plans WHERE id=$1", [planId]);
        const plan = planResult.rows[0];
        if (!plan) {
            return res.status(404).json({ error: "Plan not found" });
        }

        const actionsResult = await pool.query(
            "SELECT * FROM ops_actions_log WHERE plan_id=$1 ORDER BY action_idx",
            [planId]
        );
        plan.actions_log = actionsResult.rows;

        return res.json(plan);
    } catch (error) {
        console.error("Error getting plan details:", error);
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message });
        } else {
            return res.status(500).json({ error: "Internal server error" });
        }
    }
});