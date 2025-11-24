import React from 'react';
import { Pressable, Text, ActivityIndicator } from 'react-native';
import { useTheme } from '../core/theme';
export default function PrimaryButton({ title, onPress, loading }: { title: string; onPress: () => void; loading?: boolean }) {
    const th = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => ({
                backgroundColor: th.colors.primary,
                padding: th.spacing(2),
                borderRadius: th.radius,
                opacity: pressed || loading ? 0.8 : 1
            })}
        >
            {loading ? <ActivityIndicator /> : <Text style={{ color: 'white', fontWeight: '600', textAlign: 'center' }}>{title}</Text>}
        </Pressable>
    );
}