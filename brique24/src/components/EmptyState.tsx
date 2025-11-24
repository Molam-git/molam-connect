import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../core/theme';

export default function EmptyState({ message }: { message: string }) {
    const th = useTheme();
    return (
        <View style={{ padding: th.spacing(4), alignItems: 'center' }}>
            <Text style={{ color: th.colors.text, opacity: 0.5, textAlign: 'center' }}>
                {message}
            </Text>
        </View>
    );
}