import { useColorScheme } from 'react-native';
export const palette = {
    brand: '#0BA3FF',        // M blue
    brand2: '#13C27E',       // M green ring
    bgDark: '#062E2E',       // matches your logo background
    bgLight: '#F7FAFC',
    text: '#0B0F12',
    textLight: '#F2F5F7',
    card: '#0E3B3B'
};
export function useTheme() {
    const scheme = useColorScheme();
    const dark = scheme === 'dark';
    return {
        dark,
        colors: {
            background: dark ? palette.bgDark : palette.bgLight,
            surface: dark ? palette.card : '#FFFFFF',
            text: dark ? palette.textLight : palette.text,
            primary: palette.brand,
            accent: palette.brand2,
            border: dark ? '#183F3F' : '#E7ECEF'
        },
        radius: 16,
        spacing: (n: number) => n * 8
    };
}