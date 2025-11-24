import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { useQuery } from 'react-query';
import { WalletAPI } from '../api/endpoints';
import { useTheme } from '../core/theme';

export default function HistoryScreen() {
    const th = useTheme();
    const { data } = useQuery(['history'], () => WalletAPI.getHistory(50));
    return (
        <View style={{ flex: 1, padding: 16, backgroundColor: th.colors.background }}>
            <Text style={{ color: th.colors.text, fontSize: 22, fontWeight: '700' }}>History</Text>
            <FlatList data={data?.items || []} keyExtractor={(i) => i.id} renderItem={({ item }) => (
                <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: th.colors.border, marginTop: 8 }}>
                    <Text style={{ fontWeight: '700' }}>{item.kind} {item.amount} {item.currency}</Text>
                    <Text style={{ opacity: 0.7 }}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>
            )} />
        </View>
    );
}