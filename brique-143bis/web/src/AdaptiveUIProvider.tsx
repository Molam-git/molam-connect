/**
 * BRIQUE 143bis — Adaptive UI Provider
 * Global provider for SIRA adaptive UI across all Molam modules
 */

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useAdaptiveUI, useContextDetection, AdaptiveProfile, SiraRecommendation } from './hooks/useAdaptiveUI';

interface AdaptiveUIContextType {
  profile: AdaptiveProfile | null;
  loading: boolean;
  recommendations: SiraRecommendation[];
  updateProfile: (updates: Partial<AdaptiveProfile>) => Promise<void>;
  applyRecommendation: (id: string) => Promise<void>;
  dismissRecommendation: (id: string) => Promise<void>;
  triggerAnalysis: () => Promise<void>;
}

const AdaptiveUIContext = createContext<AdaptiveUIContextType | null>(null);

interface AdaptiveUIProviderProps {
  userId?: string;
  children: ReactNode;
}

export function AdaptiveUIProvider({ userId, children }: AdaptiveUIProviderProps) {
  const adaptive = useAdaptiveUI(userId);

  // Auto-detect context
  useContextDetection(userId);

  // Apply global styles when profile changes
  useEffect(() => {
    if (!adaptive.profile) return;

    const root = document.documentElement;

    // Apply font scale
    root.style.fontSize = `${adaptive.profile.font_scale * 16}px`;

    // Apply contrast mode
    if (adaptive.profile.high_contrast) {
      root.classList.add('adaptive-high-contrast');
    } else {
      root.classList.remove('adaptive-high-contrast');
    }

    // Apply minimal UI mode
    if (adaptive.profile.prefers_minimal_ui) {
      root.classList.add('adaptive-minimal-ui');
    } else {
      root.classList.remove('adaptive-minimal-ui');
    }

    // Apply large buttons mode
    if (adaptive.profile.prefers_large_buttons) {
      root.classList.add('adaptive-large-buttons');
    } else {
      root.classList.remove('adaptive-large-buttons');
    }
  }, [adaptive.profile]);

  return (
    <AdaptiveUIContext.Provider value={adaptive}>
      {children}
    </AdaptiveUIContext.Provider>
  );
}

export function useAdaptiveUIContext(): AdaptiveUIContextType {
  const ctx = useContext(AdaptiveUIContext);
  if (!ctx) {
    throw new Error('useAdaptiveUIContext must be used inside AdaptiveUIProvider');
  }
  return ctx;
}

/**
 * Recommendation Banner Component
 */
export function AdaptiveRecommendationBanner() {
  const { recommendations, applyRecommendation, dismissRecommendation } = useAdaptiveUIContext();

  if (recommendations.length === 0) return null;

  const topRecommendation = recommendations[0];

  return (
    <div className="adaptive-recommendation-banner bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h4 className="font-semibold text-blue-900">SIRA Recommendation</h4>
          <p className="text-sm text-blue-800 mt-1">{topRecommendation.reason}</p>
          <p className="text-xs text-blue-600 mt-1">
            Confidence: {(topRecommendation.confidence * 100).toFixed(0)}%
          </p>
        </div>
        <div className="flex gap-2 ml-4">
          <button
            onClick={() => applyRecommendation(topRecommendation.id)}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Apply
          </button>
          <button
            onClick={() => dismissRecommendation(topRecommendation.id)}
            className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
