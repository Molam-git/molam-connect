import React, { useState } from 'react';
import { View, Text, TextInput, FlatList } from 'react-native';
import { WalletAPI } from '../api/endpoints';
import PrimaryButton from '../components/PrimaryButton';
import { useTheme } from '../core/theme';

export default function AgentsScreen() {
    const th = useTheme();
    const [lat, setLat] = useState('14.6937');
    const [lng, setLng] = useState('-17.4441');
    const [items, setItems] = useState<any[]>([]);

    const search = async () => {
        const r = await WalletAPI.nearestAgents({ lat: Number(lat), lng: Number(lng) });
        setItems(r);
    };

    return (
        <View style={{ flex: 1, padding: 16, backgroundColor: th.colors.background }}>
            <Text style={{ color: th.colors.text, fontSize: 22, fontWeight: '700' }}>Agents</Text>
            <TextInput value={lat} onChangeText={setLat} style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.colors.border }} />
            <TextInput value={lng} onChangeText={setLng} style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.colors.border, marginTop: 8 }} />
            <View style={{ height: 8 }} />
            <PrimaryButton title="Search" onPress={search} />
            <FlatList data={items} keyExtractor={(i) => String(i.id)} renderItem={({ item }) => (
                <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: th.colors.border, marginTop: 8 }}>
                    <Text style={{ fontWeight: '700' }}>{item.name}</Text>
                    <Text>{(item.distance_m / 1000).toFixed(2)} km • Float: {item.float_available}</Text>
                </View>
            )} />
        </View>
    );
}