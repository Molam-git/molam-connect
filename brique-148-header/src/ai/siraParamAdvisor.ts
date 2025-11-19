/**
 * SIRA Param Advisor - AI-powered settings menu optimization
 *
 * Analyzes usage patterns, detects abuse, and recommends menu optimizations.
 *
 * Features:
 * - Track feature usage per user/role
 * - Detect rare/unused features → suggest hiding
 * - Detect abuse patterns → alert Ops
 * - Learn patterns by role and country → adaptive menus
 * - Generate optimization recommendations
 */

import settingsMenu from '../config/settingsMenu.json';
import type {
  AuditLogEntry,
  UsagePattern,
  SecurityAlert,
  OptimizationRecommendation
} from '../types/audit';
import type { UserRole } from '../hooks/useRBAC';

interface UsageStats {
  [featureId: string]: {
    count: number;
    users: Set<string>;
    lastUsed: string;
    byRole: Record<string, number>;
    byCountry: Record<string, number>;
  };
}

interface SiraConfig {
  rareUsageThreshold: number;      // Below this = rarely used
  abuseThreshold: number;            // Above this = potential abuse
  analysisWindowDays: number;        // Time window for analysis
  minSampleSize: number;             // Min data points before recommending
}

export class SiraParamAdvisor {
  private usageStats: UsageStats;
  private auditLog: AuditLogEntry[];
  private config: SiraConfig;

  constructor(config?: Partial<SiraConfig>) {
    this.usageStats = {};
    this.auditLog = [];
    this.config = {
      rareUsageThreshold: 2,
      abuseThreshold: 50,
      analysisWindowDays: 30,
      minSampleSize: 10,
      ...config
    };
  }

  /**
   * Log a feature usage event
   */
  logUsage(
    featureId: string,
    userId: string,
    userRole: UserRole,
    country?: string,
    metadata?: Record<string, any>
  ): void {
    const timestamp = new Date().toISOString();

    // Update usage stats
    if (!this.usageStats[featureId]) {
      this.usageStats[featureId] = {
        count: 0,
        users: new Set(),
        lastUsed: timestamp,
        byRole: {},
        byCountry: {}
      };
    }

    const stats = this.usageStats[featureId];
    stats.count++;
    stats.users.add(userId);
    stats.lastUsed = timestamp;
    stats.byRole[userRole] = (stats.byRole[userRole] || 0) + 1;
    if (country) {
      stats.byCountry[country] = (stats.byCountry[country] || 0) + 1;
    }

    // Add to audit log
    const logEntry: AuditLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      userId,
      userRole,
      action: 'feature_access',
      featureId,
      metadata
    };

    this.auditLog.push(logEntry);
  }

  /**
   * Analyze usage patterns and detect issues
   */
  analyze(role?: UserRole): {
    hide: string[];
    flag: string[];
    highlight: string[];
    alerts: SecurityAlert[];
  } {
    const hide: string[] = [];
    const flag: string[] = [];
    const highlight: string[] = [];
    const alerts: SecurityAlert[] = [];

    // Get recent logs within analysis window
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - this.config.analysisWindowDays);
    const recentLogs = this.auditLog.filter(
      log => new Date(log.timestamp) >= windowStart
    );

    // Filter by role if specified
    const roleLogs = role
      ? recentLogs.filter(log => log.userRole === role)
      : recentLogs;

    if (roleLogs.length < this.config.minSampleSize) {
      return { hide, flag, highlight, alerts };
    }

    // Analyze each feature
    Object.entries(this.usageStats).forEach(([featureId, stats]) => {
      const roleCount = role ? (stats.byRole[role] || 0) : stats.count;

      // Rare usage → suggest hiding
      if (roleCount < this.config.rareUsageThreshold) {
        hide.push(featureId);
      }

      // Frequent usage → highlight as popular
      if (roleCount > this.config.abuseThreshold / 2) {
        highlight.push(featureId);
      }

      // Check for abuse per user
      if (role && role !== 'owner') {
        const userUsage = new Map<string, number>();

        roleLogs
          .filter(log => log.featureId === featureId)
          .forEach(log => {
            const count = userUsage.get(log.userId) || 0;
            userUsage.set(log.userId, count + 1);
          });

        // Detect users with abnormal usage
        userUsage.forEach((count, userId) => {
          if (count > this.config.abuseThreshold) {
            flag.push(featureId);

            alerts.push({
              id: `alert-${Date.now()}-${featureId}-${userId}`,
              severity: count > this.config.abuseThreshold * 2 ? 'critical' : 'high',
              type: 'abuse',
              userId,
              userRole: role,
              featureId,
              description: `User ${userId} (${role}) accessed "${featureId}" ${count} times in ${this.config.analysisWindowDays} days`,
              timestamp: new Date().toISOString(),
              resolved: false
            });
          }
        });
      }
    });

    return { hide, flag, highlight, alerts };
  }

  /**
   * Generate usage patterns report
   */
  getUsagePatterns(): UsagePattern[] {
    return Object.entries(this.usageStats).map(([featureId, stats]) => {
      const avgCallsPerUser = stats.users.size > 0
        ? stats.count / stats.users.size
        : 0;

      // Simple trend calculation (last 7 days vs previous 7 days)
      const now = new Date();
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const previous7Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const recentCount = this.auditLog.filter(
        log => log.featureId === featureId && new Date(log.timestamp) >= last7Days
      ).length;

      const previousCount = this.auditLog.filter(
        log => log.featureId === featureId &&
               new Date(log.timestamp) >= previous7Days &&
               new Date(log.timestamp) < last7Days
      ).length;

      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (recentCount > previousCount * 1.2) trend = 'increasing';
      else if (recentCount < previousCount * 0.8) trend = 'decreasing';

      return {
        featureId,
        totalCalls: stats.count,
        uniqueUsers: stats.users.size,
        avgCallsPerUser,
        lastUsed: stats.lastUsed,
        trend
      };
    });
  }

  /**
   * Generate optimization recommendations
   */
  getRecommendations(role: UserRole): OptimizationRecommendation[] {
    const analysis = this.analyze(role);
    const recommendations: OptimizationRecommendation[] = [];
    const patterns = this.getUsagePatterns();

    // Recommend hiding rarely used features
    analysis.hide.forEach(featureId => {
      const pattern = patterns.find(p => p.featureId === featureId);
      if (pattern) {
        recommendations.push({
          type: 'hide',
          featureId,
          reason: `Rarely used: only ${pattern.totalCalls} times by ${pattern.uniqueUsers} users`,
          confidence: pattern.totalCalls === 0 ? 100 : 80,
          impact: 'low'
        });
      }
    });

    // Recommend highlighting popular features
    analysis.highlight.forEach(featureId => {
      const pattern = patterns.find(p => p.featureId === featureId);
      if (pattern && pattern.trend === 'increasing') {
        recommendations.push({
          type: 'highlight',
          featureId,
          reason: `Popular and trending: ${pattern.totalCalls} uses, ${pattern.trend} trend`,
          confidence: 90,
          impact: 'medium'
        });
      }
    });

    // Recommend alerts for flagged features
    analysis.flag.forEach(featureId => {
      recommendations.push({
        type: 'alert',
        featureId,
        reason: 'Potential abuse detected - requires Ops review',
        confidence: 95,
        impact: 'high'
      });
    });

    // Recommend reordering based on usage frequency
    const sortedPatterns = [...patterns].sort((a, b) => b.totalCalls - a.totalCalls);
    sortedPatterns.slice(0, 3).forEach(pattern => {
      if (pattern.totalCalls > this.config.rareUsageThreshold * 5) {
        recommendations.push({
          type: 'reorder',
          featureId: pattern.featureId,
          reason: `High usage (${pattern.totalCalls} calls) - consider moving to top`,
          confidence: 85,
          impact: 'medium'
        });
      }
    });

    return recommendations;
  }

  /**
   * Generate optimized menu based on analysis
   */
  generateOptimizedMenu(role: UserRole, applyHiding: boolean = false): {
    optimizedMenu: typeof settingsMenu;
    recommendations: OptimizationRecommendation[];
    alerts: SecurityAlert[];
  } {
    const analysis = this.analyze(role);
    const recommendations = this.getRecommendations(role);
    const optimizedMenu: any = {};

    Object.entries(settingsMenu).forEach(([category, items]) => {
      const filteredItems = (items as any[]).filter(item => {
        // Always keep if not in hide list
        if (!analysis.hide.includes(item.id)) return true;

        // Only hide if applyHiding is true
        return !applyHiding;
      });

      if (filteredItems.length > 0) {
        optimizedMenu[category] = filteredItems;
      }
    });

    return {
      optimizedMenu,
      recommendations,
      alerts: analysis.alerts
    };
  }

  /**
   * Get security alerts
   */
  getSecurityAlerts(severity?: SecurityAlert['severity']): SecurityAlert[] {
    const analysis = this.analyze();

    if (severity) {
      return analysis.alerts.filter(alert => alert.severity === severity);
    }

    return analysis.alerts;
  }

  /**
   * Export analytics data for Ops dashboard
   */
  exportAnalytics(role?: UserRole): {
    summary: {
      totalUsers: number;
      totalActions: number;
      mostUsedFeature: string;
      leastUsedFeature: string;
      activeFeatures: number;
      inactiveFeatures: number;
    };
    patterns: UsagePattern[];
    recommendations: OptimizationRecommendation[];
    alerts: SecurityAlert[];
    usageByRole: Record<string, number>;
    usageByCountry: Record<string, number>;
  } {
    const patterns = this.getUsagePatterns();
    const recommendations = role ? this.getRecommendations(role) : [];
    const alerts = this.getSecurityAlerts();

    // Calculate summary
    const allUsers = new Set<string>();
    this.auditLog.forEach(log => allUsers.add(log.userId));

    const sortedPatterns = [...patterns].sort((a, b) => b.totalCalls - a.totalCalls);
    const mostUsed = sortedPatterns[0]?.featureId || 'N/A';
    const leastUsed = sortedPatterns[sortedPatterns.length - 1]?.featureId || 'N/A';

    const activeFeatures = patterns.filter(p => p.totalCalls > 0).length;
    const inactiveFeatures = Object.keys(settingsMenu).reduce(
      (sum, cat) => sum + (settingsMenu as any)[cat].length,
      0
    ) - activeFeatures;

    // Usage by role
    const usageByRole: Record<string, number> = {};
    this.auditLog.forEach(log => {
      usageByRole[log.userRole] = (usageByRole[log.userRole] || 0) + 1;
    });

    // Usage by country
    const usageByCountry: Record<string, number> = {};
    Object.values(this.usageStats).forEach(stats => {
      Object.entries(stats.byCountry).forEach(([country, count]) => {
        usageByCountry[country] = (usageByCountry[country] || 0) + count;
      });
    });

    return {
      summary: {
        totalUsers: allUsers.size,
        totalActions: this.auditLog.length,
        mostUsedFeature: mostUsed,
        leastUsedFeature: leastUsed,
        activeFeatures,
        inactiveFeatures
      },
      patterns,
      recommendations,
      alerts,
      usageByRole,
      usageByCountry
    };
  }

  /**
   * Reset usage data (for testing or new analysis period)
   */
  reset(): void {
    this.usageStats = {};
    this.auditLog = [];
  }

  /**
   * Import audit logs from external source (e.g., SIRA service)
   */
  importAuditLogs(logs: AuditLogEntry[]): void {
    logs.forEach(log => {
      this.auditLog.push(log);

      // Update stats
      if (!this.usageStats[log.featureId]) {
        this.usageStats[log.featureId] = {
          count: 0,
          users: new Set(),
          lastUsed: log.timestamp,
          byRole: {},
          byCountry: {}
        };
      }

      const stats = this.usageStats[log.featureId];
      stats.count++;
      stats.users.add(log.userId);
      stats.lastUsed = log.timestamp;
      stats.byRole[log.userRole] = (stats.byRole[log.userRole] || 0) + 1;
    });
  }
}

export default SiraParamAdvisor;
