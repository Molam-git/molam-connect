import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, Alert } from 'react-native';
import { WalletAPI } from '../api/endpoints';
import PrimaryButton from '../components/PrimaryButton';
import { useTheme } from '../core/theme';

export default function BillsScreen() {
    const th = useTheme();
    const [catalog, setCatalog] = useState<any[]>([]);
    const [account, setAccount] = useState('');
    const [amount, setAmount] = useState('');
    const [code, setCode] = useState<string | undefined>();

    useEffect(() => { WalletAPI.billCatalog().then(setCatalog).catch(() => { }); }, []);
    const pay = async () => {
        if (!code) return;
        try {
            const r = await WalletAPI.payBill({ code, account, amount: Number(amount), currency: 'USD' });
            Alert.alert('Paid', r.tx_id);
        } catch (e: any) { Alert.alert('Error', e.message); }
    };

    return (
        <View style={{ flex: 1, padding: 16, backgroundColor: th.colors.background }}>
            <Text style={{ color: th.colors.text, fontSize: 22, fontWeight: '700' }}>Bills (free)</Text>
            <FlatList
                horizontal
                data={catalog}
                keyExtractor={(i) => i.code}
                renderItem={({ item }) => (
                    <View style={{ padding: 12, marginRight: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: th.colors.border }}>
                        <Text style={{ fontWeight: '700' }}>{item.name}</Text>
                        <PrimaryButton title="Select" onPress={() => setCode(item.code)} />
                    </View>
                )}
            />
            <TextInput placeholder="Account number" value={account} onChangeText={setAccount}
                style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.colors.border, marginTop: 12 }} />
            <TextInput placeholder="Amount" keyboardType="numeric" value={amount} onChangeText={setAmount}
                style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.colors.border, marginTop: 8 }} />
            <View style={{ height: 8 }} />
            <PrimaryButton title="Pay" onPress={pay} />
        </View>
    );
}