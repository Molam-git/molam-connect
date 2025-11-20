/**
 * BRIQUE 143bis — Adaptive UI Hook
 * React hook for SIRA-powered adaptive UI
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface AdaptiveProfile {
  user_id: string;
  lang: string;
  high_contrast: boolean;
  font_scale: number;
  prefers_minimal_ui: boolean;
  prefers_auto_complete: boolean;
  prefers_large_buttons: boolean;
  prefers_simplified_forms: boolean;
  detected_context?: 'low_bandwidth' | 'bright_light' | 'standard' | 'dark_environment';
  sira_confidence?: number;
}

export interface SiraRecommendation {
  id: string;
  recommendation_type: string;
  reason: string;
  confidence: number;
  supporting_data: any;
  created_at: string;
}

/**
 * Hook to access and manage adaptive UI profile
 */
export function useAdaptiveUI(userId?: string) {
  const [profile, setProfile] = useState<AdaptiveProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<SiraRecommendation[]>([]);

  useEffect(() => {
    if (!userId) return;

    loadProfile();
    loadRecommendations();

    // Poll for updates every 30 seconds
    const interval = setInterval(() => {
      loadProfile();
      loadRecommendations();
    }, 30000);

    return () => clearInterval(interval);
  }, [userId]);

  const loadProfile = async () => {
    if (!userId) return;

    try {
      const res = await fetch(`/api/sira/adaptive/${userId}`);
      const data = await res.json();
      setProfile(data);
    } catch (error) {
      console.error('[useAdaptiveUI] Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecommendations = async () => {
    if (!userId) return;

    try {
      const res = await fetch('/api/sira/adaptive/recommendations');
      const data = await res.json();
      setRecommendations(data);
    } catch (error) {
      console.error('[useAdaptiveUI] Error loading recommendations:', error);
    }
  };

  const updateProfile = useCallback(
    async (updates: Partial<AdaptiveProfile>) => {
      if (!userId) return;

      try {
        const res = await fetch('/api/sira/adaptive', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        const updated = await res.json();
        setProfile(updated);
      } catch (error) {
        console.error('[useAdaptiveUI] Error updating profile:', error);
      }
    },
    [userId]
  );

  const applyRecommendation = useCallback(
    async (recommendationId: string) => {
      try {
        const res = await fetch(`/api/sira/adaptive/recommendations/${recommendationId}/apply`, {
          method: 'POST',
        });
        const updated = await res.json();
        setProfile(updated);
        loadRecommendations(); // Refresh recommendations
      } catch (error) {
        console.error('[useAdaptiveUI] Error applying recommendation:', error);
      }
    },
    []
  );

  const dismissRecommendation = useCallback(async (recommendationId: string) => {
    try {
      await fetch(`/api/sira/adaptive/recommendations/${recommendationId}/dismiss`, {
        method: 'POST',
      });
      loadRecommendations(); // Refresh recommendations
    } catch (error) {
      console.error('[useAdaptiveUI] Error dismissing recommendation:', error);
    }
  }, []);

  const triggerAnalysis = useCallback(async () => {
    try {
      await fetch('/api/sira/adaptive/analyze', { method: 'POST' });
      loadRecommendations(); // Refresh recommendations
    } catch (error) {
      console.error('[useAdaptiveUI] Error triggering analysis:', error);
    }
  }, []);

  return {
    profile,
    loading,
    recommendations,
    updateProfile,
    applyRecommendation,
    dismissRecommendation,
    triggerAnalysis,
    refetch: loadProfile,
  };
}

/**
 * Hook to detect and report context changes
 */
export function useContextDetection(userId?: string) {
  const lastContext = useRef<any>(null);

  useEffect(() => {
    if (!userId) return;

    const detectContext = () => {
      const context: any = {};

      // Detect connection type (if available)
      if ('connection' in navigator) {
        const conn = (navigator as any).connection;
        context.connection_type = conn?.effectiveType || 'unknown';
      }

      // Detect battery level (if available)
      if ('getBattery' in navigator) {
        (navigator as any).getBattery().then((battery: any) => {
          context.battery_level = Math.round(battery.level * 100);

          // Send context if changed significantly
          if (shouldUpdateContext(lastContext.current, context)) {
            sendContext(context);
            lastContext.current = context;
          }
        });
      }

      // Detect ambient light (if available)
      if ('AmbientLightSensor' in window) {
        try {
          const sensor = new (window as any).AmbientLightSensor();
          sensor.addEventListener('reading', () => {
            const lux = sensor.illuminance;
            if (lux > 10000) {
              context.ambient_light = 'bright';
            } else if (lux < 50) {
              context.ambient_light = 'dark';
            } else {
              context.ambient_light = 'normal';
            }

            if (shouldUpdateContext(lastContext.current, context)) {
              sendContext(context);
              lastContext.current = context;
            }
          });
          sensor.start();
        } catch (error) {
          // Sensor not supported
        }
      }

      // Basic time-based detection
      const hour = new Date().getHours();
      if (hour >= 20 || hour < 6) {
        context.time_of_day = 'night';
      } else {
        context.time_of_day = 'day';
      }

      // Send initial context
      sendContext(context);
      lastContext.current = context;
    };

    detectContext();

    // Re-detect every 5 minutes
    const interval = setInterval(detectContext, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [userId]);

  const sendContext = async (context: any) => {
    try {
      await fetch('/api/sira/adaptive/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context),
      });
    } catch (error) {
      console.error('[useContextDetection] Error sending context:', error);
    }
  };

  const shouldUpdateContext = (prev: any, current: any) => {
    if (!prev) return true;

    // Check for significant changes
    if (prev.connection_type !== current.connection_type) return true;
    if (prev.ambient_light !== current.ambient_light) return true;
    if (Math.abs((prev.battery_level || 100) - (current.battery_level || 100)) > 20) return true;

    return false;
  };
}

/**
 * Hook to apply adaptive styles
 */
export function useAdaptiveStyles(profile: AdaptiveProfile | null) {
  const styles = {
    fontSize: profile ? `${profile.font_scale}em` : '1em',
    ...(profile?.high_contrast && {
      backgroundColor: '#000',
      color: '#fff',
    }),
  };

  const classNames = [
    profile?.prefers_minimal_ui && 'adaptive-minimal-ui',
    profile?.prefers_large_buttons && 'adaptive-large-buttons',
    profile?.high_contrast && 'adaptive-high-contrast',
  ]
    .filter(Boolean)
    .join(' ');

  return { styles, classNames };
}
