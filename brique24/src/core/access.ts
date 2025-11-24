// Accessibilité et permissions
export const useAccessibility = () => {
    return {
        isVoiceOverEnabled: false, // À détecter via API native si nécessaire
        supportsHaptics: true,
        maxFontScale: 1.5
    };
};