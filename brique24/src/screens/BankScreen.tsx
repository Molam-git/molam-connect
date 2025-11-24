import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, Switch, Alert } from 'react-native';
import { WalletAPI } from '../api/endpoints';
import PrimaryButton from '../components/PrimaryButton';
import { useTheme } from '../core/theme';

export default function BankScreen() {
    const th = useTheme();
    const [routes, setRoutes] = useState<any[]>([]);
    const [routeId, setRouteId] = useState<number | undefined>();
    const [amount, setAmount] = useState('');
    const [forSelf, setForSelf] = useState(true);
    const [recipient, setRecipient] = useState('');

    useEffect(() => { WalletAPI.bankRoutes().then(setRoutes).catch(() => { }); }, []);
    const cashIn = async () => {
        if (!routeId) return;
        try {
            const r = await WalletAPI.bankCashIn({
                route_id: routeId, amount: Number(amount), currency: 'USD',
                for_self: forSelf, recipient: forSelf ? undefined : recipient
            });
            Alert.alert('Cash-In requested', `Order ${r.order_id} • Fee ${r.fee} USD`);
        } catch (e: any) { Alert.alert('Error', e.message); }
    };
    const cashOut = async () => {
        if (!routeId) return;
        try {
            const r = await WalletAPI.bankCashOut({ route_id: routeId, amount: Number(amount), currency: 'USD' });
            Alert.alert('Cash-Out requested', `Order ${r.order_id} • Fee ${r.fee} USD`);
        } catch (e: any) { Alert.alert('Error', e.message); }
    };

    return (
        <View style={{ flex: 1, padding: 16, backgroundColor: th.colors.background }}>
            <Text style={{ color: th.colors.text, fontSize: 22, fontWeight: '700' }}>Bank</Text>
            <FlatList
                data={routes}
                keyExtractor={(i) => String(i.id)}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginVertical: 12 }}
                renderItem={({ item }) => (
                    <View style={{
                        padding: 12, marginRight: 12, borderRadius: 12,
                        borderWidth: 1, borderColor: routeId === item.id ? th.colors.primary : th.colors.border,
                        backgroundColor: '#fff'
                    }}>
                        <Text style={{ fontWeight: '700' }}>{item.name}</Text>
                        <Text>{item.currency}</Text>
                        <PrimaryButton title="Select" onPress={() => setRouteId(item.id)} />
                    </View>
                )}
            />
            <Text style={{ color: th.colors.text }}>Amount</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric"
                style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.colors.border }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                <Switch value={forSelf} onValueChange={setForSelf} />
                <Text style={{ marginLeft: 8, color: th.colors.text }}>For myself (Cash-In self is free)</Text>
            </View>

            {!forSelf && (
                <>
                    <Text style={{ color: th.colors.text, marginTop: 12 }}>Recipient</Text>
                    <TextInput value={recipient} onChangeText={setRecipient}
                        placeholder="Phone / Molam ID"
                        style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.colors.border }} />
                </>
            )}

            <View style={{ height: 12 }} />
            <PrimaryButton title="Cash-In" onPress={cashIn} />
            <View style={{ height: 8 }} />
            <PrimaryButton title="Cash-Out" onPress={cashOut} />
        </View>
    );
}