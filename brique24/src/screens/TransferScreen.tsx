import React, { useState } from 'react';
import { View, TextInput, Text, Alert } from 'react-native';
import { useTheme } from '../core/theme';
import PrimaryButton from '../components/PrimaryButton';
import { WalletAPI } from '../api/endpoints';
import { useTranslation } from 'react-i18next';

export default function TransferScreen() {
    const th = useTheme(); const { t } = useTranslation();
    const [to, setTo] = useState('');           // phone/email/molamID
    const [amount, setAmount] = useState('');
    const [est, setEst] = useState<{ fee: number, total: number, hints: string[] } | null>(null);
    const [loading, setLoading] = useState(false);

    const estimate = async () => {
        setLoading(true);
        try {
            const r = await WalletAPI.estimateP2P({ to, amount: Number(amount), currency: 'USD' });
            setEst(r);
        } catch (e: any) { Alert.alert('Error', e.message); }
        setLoading(false);
    };

    const send = async () => {
        setLoading(true);
        try {
            const r = await WalletAPI.sendP2P({ to, amount: Number(amount), currency: 'USD' });
            Alert.alert('Success', `Transaction: ${r.tx_id}`);
            setEst(null); setAmount(''); setTo('');
        } catch (e: any) { Alert.alert('Error', e.message); }
        setLoading(false);
    };

    return (
        <View style={{ flex: 1, padding: 16, backgroundColor: th.colors.background }}>
            <Text style={{ color: th.colors.text, fontSize: 22, fontWeight: '700' }}>{t('send')}</Text>
            <Text style={{ color: th.colors.text, marginTop: 8 }}>{t('to')}</Text>
            <TextInput accessibilityLabel="Recipient" value={to} onChangeText={setTo}
                style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderColor: th.colors.border, borderWidth: 1 }} />
            <Text style={{ color: th.colors.text, marginTop: 12 }}>{t('amount')}</Text>
            <TextInput accessibilityLabel="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric"
                style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderColor: th.colors.border, borderWidth: 1 }} />
            <View style={{ height: 12 }} />

            {!est && <PrimaryButton title={t('estimate')} onPress={estimate} loading={loading} />}
            {est && (
                <View>
                    <Text style={{ color: th.colors.text, marginVertical: 8 }}>
                        {t('fee')}: {est.fee.toFixed(2)} USD • {t('total')}: {est.total.toFixed(2)} USD
                    </Text>
                    <PrimaryButton title={t('confirm')} onPress={send} loading={loading} />
                </View>
            )}
        </View>
    );
}