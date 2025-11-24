import React, { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { WalletAPI } from '../api/endpoints';
import { useTheme } from '../core/theme';

export default function LegalScreen() {
    const [docs, setDocs] = useState<{ cgu: string; privacy: string; legal: string } | null>(null);
    const th = useTheme();
    useEffect(() => { WalletAPI.legalDocs().then(setDocs).catch(() => { }); }, []);
    return (
        <ScrollView style={{ flex: 1, backgroundColor: th.colors.background, padding: 16 }}>
            <Text style={{ color: th.colors.text, fontSize: 22, fontWeight: '700' }}>Legal</Text>
            <Text style={{ color: th.colors.text, marginTop: 12 }}>{docs?.cgu || ''}</Text>
            <Text style={{ color: th.colors.text, marginTop: 12 }}>{docs?.privacy || ''}</Text>
            <Text style={{ color: th.colors.text, marginTop: 12 }}>{docs?.legal || ''}</Text>
        </ScrollView>
    );
}