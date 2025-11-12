/**
 * Brique 70octies - RBAC Middleware
 * Role-Based Access Control with multi-signature approval support
 */

import { Request, Response, NextFunction } from 'express';
import pool from '../db';
import { createAuditLog } from '../services/audit';

/**
 * Loyalty system roles and permissions
 */
export enum LoyaltyRole {
  MERCHANT_ADMIN = 'merchant_admin',
  OPS_MARKETING = 'ops_marketing',
  FINANCE_OPS = 'finance_ops',
  AUDITOR = 'auditor',
  SYSTEM = 'system'
}

/**
 * Permissions by role
 */
const ROLE_PERMISSIONS = {
  [LoyaltyRole.MERCHANT_ADMIN]: [
    'view_program',
    'view_balances',
    'view_transactions',
    'view_campaigns',
    'create_campaign',
    'view_reports'
  ],
  [LoyaltyRole.OPS_MARKETING]: [
    'view_program',
    'update_program',
    'view_balances',
    'view_transactions',
    'view_campaigns',
    'create_campaign',
    'execute_campaign',
    'view_reports',
    'request_adjustment' // Can request, but needs approval
  ],
  [LoyaltyRole.FINANCE_OPS]: [
    'view_program',
    'update_program',
    'view_balances',
    'view_transactions',
    'adjust_balance', // Can approve adjustments
    'freeze_account',
    'view_reports',
    'approve_adjustment',
    'manage_budget'
  ],
  [LoyaltyRole.AUDITOR]: [
    'view_program',
    'view_balances',
    'view_transactions',
    'view_campaigns',
    'view_audit_logs',
    'view_reports',
    'export_data'
  ],
  [LoyaltyRole.SYSTEM]: [
    '*' // All permissions
  ]
};

/**
 * Operations requiring multi-signature approval
 */
const MULTI_SIG_OPERATIONS = {
  'adjust_balance_high': {
    threshold: 10000, // Points threshold
    requiredRoles: [LoyaltyRole.OPS_MARKETING, LoyaltyRole.FINANCE_OPS]
  },
  'update_budget': {
    threshold: 50000, // Currency threshold
    requiredRoles: [LoyaltyRole.OPS_MARKETING, LoyaltyRole.FINANCE_OPS]
  },
  'freeze_program': {
    requiredRoles: [LoyaltyRole.OPS_MARKETING, LoyaltyRole.FINANCE_OPS]
  }
};

/**
 * Extended Express Request with auth context
 */
export interface AuthRequest extends Request {
  auth?: {
    userId: string;
    role: LoyaltyRole;
    merchantId?: string;
  };
}

/**
 * Middleware: Authenticate request
 * In production, this would validate JWT or session token
 */
export function authenticate() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // In production, extract from JWT or session
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);

      // TODO: Validate JWT token with Molam ID service
      // For now, mock authentication
      const mockAuth = {
        userId: req.headers['x-user-id'] as string || 'system',
        role: (req.headers['x-user-role'] as LoyaltyRole) || LoyaltyRole.MERCHANT_ADMIN,
        merchantId: req.headers['x-merchant-id'] as string
      };

      req.auth = mockAuth;

      // Audit all API requests
      await createAuditLog({
        entityType: 'program',
        entityId: req.params.programId || 'global',
        action: 'create',
        actorId: mockAuth.userId,
        actorRole: mockAuth.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      next();
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(401).json({ error: 'Authentication failed' });
    }
  };
}

/**
 * Middleware: Require specific role
 */
export function requireRole(...roles: LoyaltyRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Required role: ${roles.join(' or ')}. Your role: ${req.auth.role}`
      });
    }

    next();
  };
}

/**
 * Middleware: Require specific permission
 */
export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const permissions = ROLE_PERMISSIONS[req.auth.role] || [];

    if (!permissions.includes('*') && !permissions.includes(permission)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Required permission: ${permission}. Your role: ${req.auth.role}`
      });
    }

    next();
  };
}

/**
 * Middleware: Check multi-signature approval requirement
 */
export function requireMultiSig(operation: string, getAmount?: (req: AuthRequest) => number) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.auth) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const config = MULTI_SIG_OPERATIONS[operation];
      if (!config) {
        return next(); // No multi-sig required
      }

      // Check if amount exceeds threshold
      if (config.threshold && getAmount) {
        const amount = getAmount(req);
        if (amount < config.threshold) {
          return next(); // Below threshold, no approval needed
        }
      }

      // Check for existing approval request
      const approvalRequestId = req.headers['x-approval-request-id'] as string;

      if (!approvalRequestId) {
        // Create approval request
        const requestId = await createApprovalRequest({
          requestType: operation,
          entityId: req.params.programId || req.params.balanceId || 'unknown',
          amount: getAmount ? getAmount(req) : undefined,
          reason: req.body.reason,
          requiredApprovers: config.requiredRoles,
          createdBy: req.auth.userId
        });

        return res.status(202).json({
          status: 'approval_required',
          approvalRequestId: requestId,
          requiredRoles: config.requiredRoles,
          message: 'This operation requires multi-signature approval. Please get approval from required roles.'
        });
      }

      // Validate approval request
      const approvalResult = await validateApprovalRequest(
        approvalRequestId,
        req.auth.userId,
        req.auth.role
      );

      if (!approvalResult.approved) {
        return res.status(403).json({
          error: 'Approval pending',
          approvalRequestId,
          approvals: approvalResult.approvals,
          pending: approvalResult.pending
        });
      }

      // Approval complete - proceed with operation
      req.body._approvalRequestId = approvalRequestId;
      next();

    } catch (error: any) {
      console.error('Multi-sig check error:', error);
      res.status(500).json({ error: error.message });
    }
  };
}

/**
 * Create approval request
 */
async function createApprovalRequest(config: {
  requestType: string;
  entityId: string;
  amount?: number;
  reason: string;
  requiredApprovers: LoyaltyRole[];
  createdBy: string;
}): Promise<string> {
  const result = await pool.query(
    `INSERT INTO loyalty_approval_requests
     (request_type, entity_id, amount, reason, required_approvers, approvals, status, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, 'pending', $6, NOW())
     RETURNING id`,
    [
      config.requestType,
      config.entityId,
      config.amount,
      config.reason,
      config.requiredApprovers,
      config.createdBy
    ]
  );

  const requestId = result.rows[0].id;

  await createAuditLog({
    entityType: 'approval',
    entityId: requestId,
    action: 'create',
    actorId: config.createdBy,
    changes: {
      requestType: config.requestType,
      amount: config.amount,
      requiredApprovers: config.requiredApprovers
    }
  });

  return requestId;
}

/**
 * Validate approval request
 */
async function validateApprovalRequest(
  requestId: string,
  userId: string,
  userRole: LoyaltyRole
): Promise<{
  approved: boolean;
  approvals: any[];
  pending: string[];
}> {
  const result = await pool.query(
    'SELECT * FROM loyalty_approval_requests WHERE id = $1',
    [requestId]
  );

  if (result.rows.length === 0) {
    throw new Error('Approval request not found');
  }

  const request = result.rows[0];
  const approvals = request.approvals || [];
  const requiredRoles = request.required_approvers;

  // Check which roles have approved
  const approvedRoles = approvals.map((a: any) => a.role);

  // Check if all required roles have approved
  const allApproved = requiredRoles.every((role: string) => approvedRoles.includes(role));

  // Check if user can approve
  if (!approvedRoles.includes(userRole) && requiredRoles.includes(userRole)) {
    // User can add their approval
    approvals.push({
      role: userRole,
      userId,
      approvedAt: new Date().toISOString()
    });

    await pool.query(
      `UPDATE loyalty_approval_requests
       SET approvals = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(approvals), requestId]
    );

    // Check again after adding approval
    const newApprovedRoles = approvals.map((a: any) => a.role);
    const nowApproved = requiredRoles.every((role: string) => newApprovedRoles.includes(role));

    if (nowApproved) {
      await pool.query(
        `UPDATE loyalty_approval_requests
         SET status = 'approved', resolved_at = NOW()
         WHERE id = $1`,
        [requestId]
      );
    }

    return {
      approved: nowApproved,
      approvals,
      pending: requiredRoles.filter((r: string) => !newApprovedRoles.includes(r))
    };
  }

  return {
    approved: allApproved,
    approvals,
    pending: requiredRoles.filter((r: string) => !approvedRoles.includes(r))
  };
}

/**
 * Check if user has permission
 */
export function hasPermission(role: LoyaltyRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

/**
 * Middleware: Verify merchant access
 */
export function verifyMerchantAccess() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.auth) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // System role has access to all merchants
      if (req.auth.role === LoyaltyRole.SYSTEM) {
        return next();
      }

      const programId = req.params.programId || req.body.programId;
      if (!programId) {
        return next(); // No program specified
      }

      // Verify user has access to this program's merchant
      const program = await pool.query(
        'SELECT merchant_id FROM loyalty_programs WHERE id = $1',
        [programId]
      );

      if (program.rows.length === 0) {
        return res.status(404).json({ error: 'Program not found' });
      }

      const merchantId = program.rows[0].merchant_id;

      if (req.auth.merchantId && req.auth.merchantId !== merchantId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this merchant'
        });
      }

      next();
    } catch (error: any) {
      console.error('Merchant access check error:', error);
      res.status(500).json({ error: error.message });
    }
  };
}
