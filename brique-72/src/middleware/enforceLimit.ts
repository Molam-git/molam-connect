/**
 * Enforcement Middleware - Easy integration of limit enforcement into Express routes
 * Brique 72 - Account Capabilities & Limits
 */

import { Request, Response, NextFunction } from 'express';
import { enforceLimit, hasCapability, EnforcementRequest } from '../services/enforcement';

// Extended request with auth context
export interface AuthRequest extends Request {
  auth?: {
    userId: string;
    role: string;
    kycLevel?: string;
    [key: string]: any;
  };
}

// ========================================
// Capability Middleware
// ========================================

/**
 * Middleware: Check if user has required capability
 * Usage: app.post('/pay', requireCapability('can_send_p2p'), handler)
 */
export function requireCapability(capabilityKey: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.auth?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: No user ID in context' });
        return;
      }

      const result = await hasCapability(userId, capabilityKey);

      if (!result.has) {
        res.status(403).json({
          error: 'Forbidden',
          message: result.reason,
          requiredCapability: capabilityKey,
        });
        return;
      }

      // Attach capability info to request
      (req as any).capability = {
        capabilityKey,
        verified: true,
        reason: result.reason,
      };

      next();
    } catch (error) {
      console.error('Capability check error', { capabilityKey, error });
      res.status(500).json({ error: 'Internal server error during capability check' });
    }
  };
}

/**
 * Middleware: Check multiple capabilities (user must have at least one)
 * Usage: app.post('/payout', requireAnyCapability(['can_receive_payout', 'can_instant_payout']), handler)
 */
export function requireAnyCapability(capabilityKeys: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.auth?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: No user ID in context' });
        return;
      }

      for (const capabilityKey of capabilityKeys) {
        const result = await hasCapability(userId, capabilityKey);
        if (result.has) {
          (req as any).capability = {
            capabilityKey,
            verified: true,
            reason: result.reason,
          };
          next();
          return;
        }
      }

      res.status(403).json({
        error: 'Forbidden',
        message: 'User does not have any of the required capabilities',
        requiredCapabilities: capabilityKeys,
      });
    } catch (error) {
      console.error('Capability check error', { capabilityKeys, error });
      res.status(500).json({ error: 'Internal server error during capability check' });
    }
  };
}

// ========================================
// Limit Middleware
// ========================================

interface LimitConfig {
  limitKey: string;
  amountField?: string;        // Field in req.body containing amount (default: 'amount')
  currencyField?: string;       // Field in req.body containing currency (default: 'currency')
  defaultCurrency?: string;     // Default currency if not in body (default: 'USD')
  extractAmount?: (req: AuthRequest) => number;  // Custom amount extractor
  extractCurrency?: (req: AuthRequest) => string; // Custom currency extractor
}

/**
 * Middleware: Enforce limit before executing operation
 * Usage: app.post('/pay', enforceLimit({ limitKey: 'max_single_tx' }), handler)
 */
export function enforceLimitMiddleware(config: LimitConfig) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.auth?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: No user ID in context' });
        return;
      }

      // Extract amount
      let amount: number;
      if (config.extractAmount) {
        amount = config.extractAmount(req);
      } else {
        const amountField = config.amountField || 'amount';
        amount = req.body[amountField];
      }

      if (typeof amount !== 'number' || amount <= 0) {
        res.status(400).json({ error: 'Invalid amount' });
        return;
      }

      // Extract currency
      let currency: string;
      if (config.extractCurrency) {
        currency = config.extractCurrency(req);
      } else {
        const currencyField = config.currencyField || 'currency';
        currency = req.body[currencyField] || config.defaultCurrency || 'USD';
      }

      // Build enforcement request
      const enforcementReq: EnforcementRequest = {
        userId,
        limitKey: config.limitKey,
        amount,
        currency,
        context: {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          transactionType: req.body.transactionType,
        },
        idempotencyKey: req.headers['idempotency-key'] as string | undefined,
      };

      // Enforce limit
      const result = await enforceLimit(enforcementReq);

      // Attach enforcement result to request
      (req as any).enforcement = result;

      // Handle decision
      if (result.decision === 'allow') {
        next();
        return;
      }

      if (result.decision === 'block') {
        res.status(403).json({
          error: 'Limit exceeded',
          message: result.reason,
          appliedLimit: result.appliedLimit,
          currentUsage: result.currentUsage,
        });
        return;
      }

      if (result.decision === 'require_otp') {
        // Check if OTP was provided
        const otpProvided = req.headers['x-otp-token'] || req.body.otpToken;
        if (!otpProvided) {
          res.status(202).json({
            status: 'otp_required',
            message: result.reason,
            appliedLimit: result.appliedLimit,
            currentUsage: result.currentUsage,
          });
          return;
        }

        // TODO: Verify OTP (integrate with OTP service)
        // For now, assume OTP is valid and proceed
        next();
        return;
      }

      if (result.decision === 'require_manual_approval') {
        // Check if manual approval was granted
        const approvalId = req.headers['x-approval-id'] as string | undefined;
        if (!approvalId) {
          res.status(202).json({
            status: 'manual_approval_required',
            message: result.reason,
            appliedLimit: result.appliedLimit,
            currentUsage: result.currentUsage,
          });
          return;
        }

        // TODO: Verify approval (integrate with approval service)
        // For now, assume approval is valid and proceed
        next();
        return;
      }

      res.status(500).json({ error: 'Unknown enforcement decision' });
    } catch (error) {
      console.error('Limit enforcement error', { config, error });
      res.status(500).json({ error: 'Internal server error during limit enforcement' });
    }
  };
}

/**
 * Middleware: Enforce multiple limits
 * Usage: app.post('/pay', enforceMultipleLimits([...]), handler)
 */
export function enforceMultipleLimitsMiddleware(configs: LimitConfig[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.auth?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: No user ID in context' });
        return;
      }

      const results = [];

      for (const config of configs) {
        // Extract amount
        let amount: number;
        if (config.extractAmount) {
          amount = config.extractAmount(req);
        } else {
          const amountField = config.amountField || 'amount';
          amount = req.body[amountField];
        }

        // Extract currency
        let currency: string;
        if (config.extractCurrency) {
          currency = config.extractCurrency(req);
        } else {
          const currencyField = config.currencyField || 'currency';
          currency = req.body[currencyField] || config.defaultCurrency || 'USD';
        }

        // Enforce limit
        const result = await enforceLimit({
          userId,
          limitKey: config.limitKey,
          amount,
          currency,
          context: {
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
          },
        });

        results.push(result);

        // If any limit is not allowed, block immediately
        if (!result.allowed) {
          res.status(403).json({
            error: 'Limit exceeded',
            message: result.reason,
            failedLimit: config.limitKey,
            allResults: results,
          });
          return;
        }
      }

      // All limits passed
      (req as any).enforcement = { allResults: results };
      next();
    } catch (error) {
      console.error('Multiple limit enforcement error', { configs, error });
      res.status(500).json({ error: 'Internal server error during limit enforcement' });
    }
  };
}

// ========================================
// Combined Middleware
// ========================================

/**
 * Middleware: Check capability AND enforce limit
 * Usage: app.post('/pay', requireCapabilityAndLimit('can_send_p2p', { limitKey: 'max_single_tx' }), handler)
 */
export function requireCapabilityAndLimit(capabilityKey: string, limitConfig: LimitConfig) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    // First check capability
    await requireCapability(capabilityKey)(req, res, async () => {
      // Then enforce limit
      await enforceLimitMiddleware(limitConfig)(req, res, next);
    });
  };
}

// ========================================
// Utility Functions
// ========================================

/**
 * Extract enforcement result from request
 */
export function getEnforcementResult(req: AuthRequest): any {
  return (req as any).enforcement;
}

/**
 * Extract capability info from request
 */
export function getCapabilityInfo(req: AuthRequest): any {
  return (req as any).capability;
}
