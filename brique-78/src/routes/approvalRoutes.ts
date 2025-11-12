/**
 * Brique 78 - Ops Approval Engine API Routes
 *
 * REST API for multi-signature approval workflow:
 * - Create ops actions
 * - Vote on actions (approve, reject, abstain)
 * - Execute approved actions
 * - Manage approval policies
 * - View audit trail and statistics
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import express, { Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import * as approvalService from '../services/approvalService';

const router = express.Router();

// =======================================================================
// MIDDLEWARE
// =======================================================================

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    type: string;
    roles?: string[];
  };
}

async function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Missing authorization header' });
      return;
    }

    // TODO: Verify JWT with Molam ID
    // For now, mock user
    req.user = {
      id: 'test-user-id',
      type: 'ops_user',
      roles: ['ops_admin', 'finance_ops'],
    };

    next();
  } catch (error: any) {
    res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const hasRole = allowedRoles.some((role) => req.user!.roles?.includes(role));

    if (!hasRole) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  next();
}

// =======================================================================
// ACTION ENDPOINTS
// =======================================================================

/**
 * POST /api/ops/actions
 * Create new ops action
 */
router.post(
  '/actions',
  authenticateUser,
  requireRole(['ops_admin', 'finance_ops', 'pay_admin']),
  [
    body('idempotency_key').optional().isString(),
    body('origin').isIn(['sira', 'system', 'ops_ui', 'module', 'alert']),
    body('action_type').isString(),
    body('params').isObject(),
    body('target_tenant_type').optional().isString(),
    body('target_tenant_id').optional().isUUID(),
    body('required_quorum').optional().isObject(),
    body('required_ratio').optional().isFloat({ min: 0, max: 1 }),
    body('timeout_seconds').optional().isInt({ min: 60 }),
    body('escalation_role').optional().isString(),
    body('auto_execute').optional().isBoolean(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        idempotency_key,
        origin,
        action_type,
        params,
        target_tenant_type,
        target_tenant_id,
        required_quorum,
        required_ratio,
        timeout_seconds,
        escalation_role,
        auto_execute,
      } = req.body;

      const action = await approvalService.createOpsAction({
        idempotency_key,
        origin,
        action_type,
        params,
        target_tenant_type,
        target_tenant_id,
        required_quorum,
        required_ratio,
        timeout_seconds,
        escalation_role,
        auto_execute,
        created_by: req.user!.id,
      });

      res.status(201).json({
        success: true,
        action,
        message: 'Action created successfully',
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Create action failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/ops/actions/:id/vote
 * Vote on action
 */
router.post(
  '/actions/:id/vote',
  authenticateUser,
  [
    param('id').isUUID(),
    body('vote').isIn(['approve', 'reject', 'abstain']),
    body('comment').optional().isString(),
    body('signed_jwt').optional().isString(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { vote, comment, signed_jwt } = req.body;

      const metadata = {
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      };

      const result = await approvalService.voteOnAction(
        id,
        req.user!.id,
        req.user!.roles || [],
        vote,
        comment,
        signed_jwt,
        metadata
      );

      res.json({
        success: true,
        approval: result.approval,
        action: result.action,
        message: `Vote recorded: ${vote}`,
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Vote failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/ops/actions/:id/execute
 * Execute approved action
 */
router.post(
  '/actions/:id/execute',
  authenticateUser,
  requireRole(['ops_admin', 'finance_ops']),
  [param('id').isUUID()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const result = await approvalService.executeAction(id, req.user!.id);

      if (result.success) {
        res.json({
          success: true,
          result: result.result,
          message: 'Action executed successfully',
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          message: 'Action execution failed',
        });
      }
    } catch (error: any) {
      console.error('[ApprovalAPI] Execute failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/ops/actions
 * List pending actions for user's roles
 */
router.get(
  '/actions',
  authenticateUser,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { limit, offset } = req.query;

      const actions = await approvalService.getPendingActions(
        req.user!.roles || [],
        limit ? parseInt(limit as string) : 50,
        offset ? parseInt(offset as string) : 0
      );

      res.json({
        success: true,
        actions,
        count: actions.length,
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] List actions failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/ops/actions/:id
 * Get action details with votes
 */
router.get(
  '/actions/:id',
  authenticateUser,
  [param('id').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const action = await approvalService.getActionWithVotes(id);

      res.json({
        success: true,
        action,
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Get action failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/ops/actions/:id/audit
 * Get audit trail for action
 */
router.get(
  '/actions/:id/audit',
  authenticateUser,
  [param('id').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const audit = await approvalService.getAuditTrail(id);

      res.json({
        success: true,
        audit,
        count: audit.length,
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Get audit failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// POLICY ENDPOINTS
// =======================================================================

/**
 * POST /api/ops/policies
 * Create approval policy
 */
router.post(
  '/policies',
  authenticateUser,
  requireRole(['ops_admin']),
  [
    body('name').isString(),
    body('criteria').isObject(),
    body('policy').isObject(),
    body('priority').optional().isInt({ min: 1 }),
    body('enabled').optional().isBoolean(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, criteria, policy, priority, enabled } = req.body;

      const newPolicy = await approvalService.createApprovalPolicy({
        name,
        criteria,
        policy,
        priority,
        enabled,
        created_by: req.user!.id,
      });

      res.status(201).json({
        success: true,
        policy: newPolicy,
        message: 'Policy created successfully',
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Create policy failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/ops/policies
 * List all policies
 */
router.get(
  '/policies',
  authenticateUser,
  requireRole(['ops_admin', 'finance_ops', 'pay_admin']),
  [query('enabled_only').optional().isBoolean()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { enabled_only } = req.query;

      const policies = await approvalService.listPolicies(
        enabled_only === 'true'
      );

      res.json({
        success: true,
        policies,
        count: policies.length,
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] List policies failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/ops/policies/:id
 * Get policy by ID
 */
router.get(
  '/policies/:id',
  authenticateUser,
  requireRole(['ops_admin', 'finance_ops', 'pay_admin']),
  [param('id').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const policy = await approvalService.getPolicy(id);

      if (!policy) {
        res.status(404).json({ success: false, error: 'Policy not found' });
        return;
      }

      res.json({
        success: true,
        policy,
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Get policy failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * PUT /api/ops/policies/:id
 * Update policy
 */
router.put(
  '/policies/:id',
  authenticateUser,
  requireRole(['ops_admin']),
  [
    param('id').isUUID(),
    body('name').optional().isString(),
    body('criteria').optional().isObject(),
    body('policy').optional().isObject(),
    body('priority').optional().isInt({ min: 1 }),
    body('enabled').optional().isBoolean(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const policy = await approvalService.updatePolicy(
        id,
        updates,
        req.user!.id
      );

      res.json({
        success: true,
        policy,
        message: 'Policy updated successfully',
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Update policy failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * DELETE /api/ops/policies/:id
 * Delete policy
 */
router.delete(
  '/policies/:id',
  authenticateUser,
  requireRole(['ops_admin']),
  [param('id').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await approvalService.deletePolicy(id);

      res.json({
        success: true,
        message: 'Policy deleted successfully',
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Delete policy failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// STATISTICS & HISTORY
// =======================================================================

/**
 * GET /api/ops/stats
 * Get approval performance statistics
 */
router.get(
  '/stats',
  authenticateUser,
  requireRole(['ops_admin', 'finance_ops', 'pay_admin']),
  async (req: Request, res: Response) => {
    try {
      const stats = await approvalService.getApprovalStats();

      res.json({
        success: true,
        stats,
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Get stats failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/ops/pending-summary
 * Get pending actions summary
 */
router.get(
  '/pending-summary',
  authenticateUser,
  async (req: Request, res: Response) => {
    try {
      const summary = await approvalService.getPendingSummary();

      res.json({
        success: true,
        summary,
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Get pending summary failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/ops/users/:userId/actions
 * Get action history for user
 */
router.get(
  '/users/:userId/actions',
  authenticateUser,
  [
    param('userId').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { limit, offset } = req.query;

      const actions = await approvalService.getUserActionHistory(
        userId,
        limit ? parseInt(limit as string) : 50,
        offset ? parseInt(offset as string) : 0
      );

      res.json({
        success: true,
        actions,
        count: actions.length,
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Get user actions failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/ops/users/:userId/votes
 * Get vote history for user
 */
router.get(
  '/users/:userId/votes',
  authenticateUser,
  [
    param('userId').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { limit, offset } = req.query;

      const votes = await approvalService.getUserVoteHistory(
        userId,
        limit ? parseInt(limit as string) : 50,
        offset ? parseInt(offset as string) : 0
      );

      res.json({
        success: true,
        votes,
        count: votes.length,
      });
    } catch (error: any) {
      console.error('[ApprovalAPI] Get user votes failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// HEALTH CHECK
// =======================================================================

router.get('/health', async (req: Request, res: Response) => {
  try {
    await approvalService.pool.query('SELECT 1');

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
    });
  }
});

export default router;
