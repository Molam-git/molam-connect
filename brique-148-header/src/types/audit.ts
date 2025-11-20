/**
 * Audit Log Types
 * For SIRA analytics and security monitoring
 */

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userRole: string;
  action: string;
  featureId: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface UsagePattern {
  featureId: string;
  totalCalls: number;
  uniqueUsers: number;
  avgCallsPerUser: number;
  lastUsed: string;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface SecurityAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'abuse' | 'anomaly' | 'unauthorized' | 'fraud';
  userId: string;
  userRole: string;
  featureId: string;
  description: string;
  timestamp: string;
  resolved: boolean;
}

export interface OptimizationRecommendation {
  type: 'hide' | 'highlight' | 'reorder' | 'alert';
  featureId: string;
  reason: string;
  confidence: number; // 0-100
  impact: 'low' | 'medium' | 'high';
}
