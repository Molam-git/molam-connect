import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../core/theme';

export default function Header({ title }: { title: string }) {
    const th = useTheme();
    return (
        <View style={{ padding: th.spacing(2), backgroundColor: th.colors.surface }}>
            <Text style={{ color: th.colors.text, fontSize: 20, fontWeight: '700' }}>{title}</Text>
        </View>
    );
}