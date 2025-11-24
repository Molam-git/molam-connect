import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../core/theme';

export default function Card({ children, style }: { children: React.ReactNode; style?: any }) {
    const th = useTheme();
    return (
        <View style={[{
            backgroundColor: th.colors.surface,
            padding: th.spacing(2),
            borderRadius: th.radius,
            borderColor: th.colors.border,
            borderWidth: 1
        }, style]}>
            {children}
        </View>
    );
}