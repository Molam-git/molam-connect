/**
 * React Hook for SIRA Param Advisor
 * Provides real-time menu optimization based on usage patterns
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { SiraParamAdvisor } from '../ai/siraParamAdvisor';
import type { UserRole } from './useRBAC';
import type {
  OptimizationRecommendation,
  SecurityAlert,
  UsagePattern
} from '../types/audit';

interface SiraAdvisorState {
  optimizedMenu: any;
  recommendations: OptimizationRecommendation[];
  alerts: SecurityAlert[];
  patterns: UsagePattern[];
  isAnalyzing: boolean;
}

// Singleton instance
let advisorInstance: SiraParamAdvisor | null = null;

function getAdvisorInstance(): SiraParamAdvisor {
  if (!advisorInstance) {
    advisorInstance = new SiraParamAdvisor();
  }
  return advisorInstance;
}

export function useSiraAdvisor(
  role: UserRole,
  userId: string,
  options?: {
    autoOptimize?: boolean;
    realTimeAnalysis?: boolean;
  }
) {
  const advisor = getAdvisorInstance();

  const [state, setState] = useState<SiraAdvisorState>({
    optimizedMenu: {},
    recommendations: [],
    alerts: [],
    patterns: [],
    isAnalyzing: false
  });

  /**
   * Log feature usage
   */
  const logUsage = useCallback(
    (featureId: string, country?: string, metadata?: Record<string, any>) => {
      advisor.logUsage(featureId, userId, role, country, metadata);

      // Re-analyze if real-time analysis is enabled
      if (options?.realTimeAnalysis) {
        analyze();
      }
    },
    [advisor, userId, role, options?.realTimeAnalysis]
  );

  /**
   * Run analysis
   */
  const analyze = useCallback(() => {
    setState(prev => ({ ...prev, isAnalyzing: true }));

    try {
      const result = advisor.generateOptimizedMenu(
        role,
        options?.autoOptimize ?? false
      );

      const patterns = advisor.getUsagePatterns();

      setState({
        optimizedMenu: result.optimizedMenu,
        recommendations: result.recommendations,
        alerts: result.alerts,
        patterns,
        isAnalyzing: false
      });
    } catch (error) {
      console.error('SIRA analysis failed:', error);
      setState(prev => ({ ...prev, isAnalyzing: false }));
    }
  }, [advisor, role, options?.autoOptimize]);

  /**
   * Get security alerts by severity
   */
  const getAlertsBySeverity = useCallback(
    (severity: SecurityAlert['severity']) => {
      return state.alerts.filter(alert => alert.severity === severity);
    },
    [state.alerts]
  );

  /**
   * Get critical alerts count
   */
  const criticalAlertsCount = useMemo(() => {
    return state.alerts.filter(
      alert => alert.severity === 'critical' && !alert.resolved
    ).length;
  }, [state.alerts]);

  /**
   * Get high-impact recommendations
   */
  const highImpactRecommendations = useMemo(() => {
    return state.recommendations.filter(rec => rec.impact === 'high');
  }, [state.recommendations]);

  /**
   * Export analytics for Ops dashboard
   */
  const exportAnalytics = useCallback(() => {
    return advisor.exportAnalytics(role);
  }, [advisor, role]);

  /**
   * Reset advisor data
   */
  const reset = useCallback(() => {
    advisor.reset();
    setState({
      optimizedMenu: {},
      recommendations: [],
      alerts: [],
      patterns: [],
      isAnalyzing: false
    });
  }, [advisor]);

  // Auto-analyze on mount and role change
  useEffect(() => {
    analyze();
  }, [role]);

  return {
    // State
    optimizedMenu: state.optimizedMenu,
    recommendations: state.recommendations,
    alerts: state.alerts,
    patterns: state.patterns,
    isAnalyzing: state.isAnalyzing,

    // Computed
    criticalAlertsCount,
    highImpactRecommendations,

    // Actions
    logUsage,
    analyze,
    getAlertsBySeverity,
    exportAnalytics,
    reset
  };
}

export default useSiraAdvisor;
