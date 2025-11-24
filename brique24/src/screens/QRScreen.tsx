import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Alert } from 'react-native';
import { WalletAPI } from '../api/endpoints';
import QRCode from 'react-native-qrcode-svg';
import PrimaryButton from '../components/PrimaryButton';
import { useTheme } from '../core/theme';

export default function QRScreen() {
    const [my, setMy] = useState<{ qr: string } | null>(null);
    const [scan, setScan] = useState(''); // simplified - integrate camera in later pass
    const [amount, setAmount] = useState('');
    const th = useTheme();

    useEffect(() => { WalletAPI.myQR().then(setMy).catch(() => { }); }, []);
    const pay = async () => {
        try {
            const r = await WalletAPI.payQR({ qr: scan, amount: amount ? Number(amount) : undefined, currency: 'USD' });
            Alert.alert('Success', `Paid. Fee ${r.fee} USD`);
            setScan(''); setAmount('');
        } catch (e: any) { Alert.alert('Error', e.message); }
    };

    return (
        <View style={{ flex: 1, padding: 16, backgroundColor: th.colors.background }}>
            <Text style={{ color: th.colors.text, fontSize: 22, fontWeight: '700' }}>QR</Text>
            {my?.qr && <View style={{ alignItems: 'center', marginVertical: 16 }}><QRCode value={my.qr} size={180} /></View>}
            <Text style={{ color: th.colors.text }}>Scan payload</Text>
            <TextInput value={scan} onChangeText={setScan} placeholder="QR payload"
                style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.colors.border }} />
            <Text style={{ color: th.colors.text, marginTop: 12 }}>Amount (optional)</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric"
                style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.colors.border }} />
            <View style={{ height: 12 }} />
            <PrimaryButton title="Pay" onPress={pay} />
        </View>
    );
}