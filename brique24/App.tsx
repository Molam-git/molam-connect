import React from 'react';
import RootNav from './src/navigation/root';
import './src/core/i18n';
import { QueryClient, QueryClientProvider } from 'react-query';
import { StatusBar } from 'expo-status-bar';

const qc = new QueryClient();
export default function App() {
    return (
        <QueryClientProvider client={qc}>
            <StatusBar style="auto" />
            <RootNav />
        </QueryClientProvider>
    );
}