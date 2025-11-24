import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useTheme } from '../core/theme';
import Balance from '../components/Balance';
import PrimaryButton from '../components/PrimaryButton';
import FeePill from '../components/FeePill';
import { WalletAPI } from '../api/endpoints';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';

export default function HomeScreen({ navigation }: any) {
    const th = useTheme(); const { t } = useTranslation();
    const { data: balances } = useQuery(['balances'], WalletAPI.getBalances);
    const usd = balances?.find(b => b.currency === 'USD') || balances?.[0];

    return (
        <ScrollView style={{ flex: 1, backgroundColor: th.colors.background }} contentContainerStyle={{ padding: th.spacing(2) }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: th.colors.text }}>Molam</Text>

            {usd && <Balance amount={usd.amount} currency={usd.currency} />}

            <View style={{ height: th.spacing(2) }} />

            {/* Sira CTA row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <FeePill label={t('siraBest')} />
                <Text style={{ color: th.colors.text, opacity: 0.8 }}>P2P free receiver • Cash-Out free • Utilities free</Text>
            </View>

            <View style={{ height: th.spacing(2) }} />

            {/* Quick actions */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <Pressable onPress={() => navigation.navigate('Transfer')} style={{ flexBasis: '48%' }}><PrimaryButton title={t('send')} onPress={() => navigation.navigate('Transfer')} /></Pressable>
                <Pressable onPress={() => navigation.navigate('QR')} style={{ flexBasis: '48%' }}><PrimaryButton title={t('qr')} onPress={() => navigation.navigate('QR')} /></Pressable>
                <Pressable onPress={() => navigation.navigate('Bank')} style={{ flexBasis: '48%' }}><PrimaryButton title={t('bank')} onPress={() => navigation.navigate('Bank')} /></Pressable>
                <Pressable onPress={() => navigation.navigate('Bills')} style={{ flexBasis: '48%' }}><PrimaryButton title={t('bills')} onPress={() => navigation.navigate('Bills')} /></Pressable>
                <Pressable onPress={() => navigation.navigate('Agents')} style={{ flexBasis: '48%' }}><PrimaryButton title={'Agents'} onPress={() => navigation.navigate('Agents')} /></Pressable>
                <Pressable onPress={() => navigation.navigate('Legal')} style={{ flexBasis: '48%' }}><PrimaryButton title={t('legal')} onPress={() => navigation.navigate('Legal')} /></Pressable>
            </View>

            {/* Footer legal (fixed links conceptually) */}
            <View style={{ marginTop: th.spacing(6), borderTopWidth: 1, borderTopColor: th.colors.border, paddingTop: th.spacing(2) }}>
                <Text style={{ color: th.colors.text, opacity: 0.6 }}>{t('cgu')} • {t('privacy')} • {t('legalDocs')} • USSD *131#</Text>
            </View>
        </ScrollView>
    );
}