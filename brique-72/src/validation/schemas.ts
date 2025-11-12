/**
 * Request Validation Schemas
 * Brique 72 - Account Capabilities & Limits
 */

import { z } from 'zod';

// ========================================
// Base Validators
// ========================================

// Currency validator with uppercase transform
export const CurrencySchema = z.string()
  .length(3, 'Currency code must be 3 characters')
  .regex(/^[A-Za-Z]{3}$/, 'Currency must contain only letters')
  .transform(val => val.toUpperCase());

// UUID validator
export const UuidSchema = z.string().uuid('Invalid UUID format');

// Positive amount validator
export const AmountSchema = z.number()
  .positive('Amount must be positive')
  .max(999999999.99, 'Amount exceeds maximum');

// ========================================
// Enforcement Schemas
// ========================================

export const EnforceRequestSchema = z.object({
  userId: UuidSchema,
  limitKey: z.string().min(1, 'Limit key is required'),
  amount: AmountSchema,
  currency: CurrencySchema,
  context: z.record(z.any()).optional(),
  idempotencyKey: z.string().optional(),
});

export const RecordUsageSchema = z.object({
  userId: UuidSchema,
  limitKey: z.string().min(1, 'Limit key is required'),
  amount: AmountSchema,
  currency: CurrencySchema,
  idempotencyKey: z.string().optional(),
});

// ========================================
// Capability Schemas
// ========================================

export const CapabilityCheckSchema = z.object({
  userId: UuidSchema,
  capabilityKey: z.string().min(1, 'Capability key is required'),
});

export const SetCapabilitySchema = z.object({
  userId: UuidSchema,
  capabilityKey: z.string().min(1, 'Capability key is required'),
  enabled: z.boolean(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  origin: z.enum(['default', 'kyc', 'sira', 'ops_override']),
  reason: z.string().optional(),
});

// ========================================
// Limit Management Schemas
// ========================================

export const SetLimitSchema = z.object({
  userId: UuidSchema,
  limitKey: z.string().min(1, 'Limit key is required'),
  limitValue: z.number().nonnegative('Limit value must be non-negative'),
  currency: CurrencySchema,
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
  origin: z.enum(['ops', 'sira', 'kyc']),
  actorId: UuidSchema.optional(),
  expiresAt: z.string().datetime().optional(),
});

// ========================================
// Query Parameter Schemas
// ========================================

export const UserIdParamSchema = z.object({
  userId: UuidSchema,
});

export const LimitQuerySchema = z.object({
  currency: CurrencySchema.optional(),
  limitKey: z.string().optional(),
});

export const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// ========================================
// Type Exports
// ========================================

export type EnforceRequest = z.infer<typeof EnforceRequestSchema>;
export type RecordUsage = z.infer<typeof RecordUsageSchema>;
export type CapabilityCheck = z.infer<typeof CapabilityCheckSchema>;
export type SetCapability = z.infer<typeof SetCapabilitySchema>;
export type SetLimit = z.infer<typeof SetLimitSchema>;
