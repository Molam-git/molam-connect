import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../core/theme';
import { Tx } from '../api/endpoints';

export default function TxItem({ item }: { item: Tx }) {
    const th = useTheme();
    const isNegative = item.kind === 'CASH_OUT' || item.kind === 'P2P' || item.kind === 'BILL';

    return (
        <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: th.spacing(2),
            backgroundColor: th.colors.surface,
            borderRadius: th.radius,
            marginBottom: th.spacing(1)
        }}>
            <View>
                <Text style={{ color: th.colors.text, fontWeight: '600' }}>{item.kind}</Text>
                <Text style={{ color: th.colors.text, opacity: 0.7 }}>
                    {new Date(item.created_at).toLocaleDateString()}
                </Text>
            </View>
            <Text style={{
                color: isNegative ? '#FF3B30' : '#34C759',
                fontWeight: '700'
            }}>
                {isNegative ? '-' : '+'}{item.amount} {item.currency}
            </Text>
        </View>
    );
}