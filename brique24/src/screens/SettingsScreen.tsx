import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { useTheme } from '../core/theme';
import PrimaryButton from '../components/PrimaryButton';

export default function SettingsScreen({ navigation }: any) {
    const th = useTheme();
    return (
        <View style={{ flex: 1, padding: 16, backgroundColor: th.colors.background }}>
            <Text style={{ color: th.colors.text, fontSize: 22, fontWeight: '700' }}>Settings</Text>
            <PrimaryButton title="Legal" onPress={() => navigation.navigate('Legal')} />
            <View style={{ height: 8 }} />
            <Pressable onPress={() => Linking.openURL('tel:*131%23')}>
                <Text style={{ color: th.colors.primary }}>USSD *131#</Text>
            </Pressable>
        </View>
    );
}