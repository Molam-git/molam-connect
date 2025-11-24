import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import TransferScreen from '../screens/TransferScreen';
import QRScreen from '../screens/QRScreen';
import BankScreen from '../screens/BankScreen';
import AgentsScreen from '../screens/AgentsScreen';
import BillsScreen from '../screens/BillsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import LegalScreen from '../screens/LegalScreen';
import { useTheme } from '../core/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
    const th = useTheme();
    return (
        <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: th.colors.primary }}>
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Transfer" component={TransferScreen} />
            <Tab.Screen name="QR" component={QRScreen} />
            <Tab.Screen name="Bank" component={BankScreen} />
            <Tab.Screen name="History" component={HistoryScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
    );
}

export default function RootNav() {
    const th = useTheme();
    return (
        <NavigationContainer theme={th.dark ? DarkTheme : DefaultTheme}>
            <Stack.Navigator>
                <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
                <Stack.Screen name="Agents" component={AgentsScreen} options={{ title: 'Agents' }} />
                <Stack.Screen name="Bills" component={BillsScreen} options={{ title: 'Bills' }} />
                <Stack.Screen name="Legal" component={LegalScreen} options={{ title: 'Legal' }} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}