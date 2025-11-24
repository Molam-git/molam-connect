import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../core/theme';
export default function Balance({ amount, currency }: { amount: number; currency: string }) {
    const th = useTheme();
    return (
        <View style={{ backgroundColor: th.colors.surface, padding: th.spacing(3), borderRadius: th.radius, borderColor: th.colors.border, borderWidth: 1 }}>
            <Text style={{ color: th.colors.text, opacity: 0.7 }}>Balance</Text>
            <Text style={{ color: th.colors.text, fontSize: 32, fontWeight: '700' }}>{amount.toLocaleString()} {currency}</Text>
        </View>
    );
}