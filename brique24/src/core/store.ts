import { create } from 'zustand';

type User = {
    id: string;
    phone?: string;
    email?: string;
    kyc_level: 'P0' | 'P1' | 'P2';
    currency: 'USD' | 'XOF' | 'EUR';
    lang: 'en' | 'fr' | 'wo' | 'ar'
};

type AppState = {
    user: User | undefined; // ou User | null
    setUser: (u: User | undefined) => void; // Accepter undefined
    lastSeenVersion?: string;
};

export const useApp = create<AppState>(set => ({
    user: undefined,
    setUser: (user) => set({ user }),
    lastSeenVersion: undefined
}));