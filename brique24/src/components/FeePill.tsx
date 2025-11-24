import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../core/theme';
export default function FeePill({ label }: { label: string }) {
    const th = useTheme();
    return (
        <View style={{ alignSelf: 'flex-start', backgroundColor: th.colors.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
            <Text style={{ color: 'white', fontWeight: '600' }}>{label}</Text>
        </View>
    );
}