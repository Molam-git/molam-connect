import { useApp } from '../core/store';
import * as SecureStore from 'expo-secure-store';

export function useAuth() {
    const { user, setUser } = useApp();

    const login = async (credentials: any) => {
        // Implémentation de la logique de connexion
        try {
            // Exemple d'appel API
            const response = await fetch('https://api.molam.com/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });

            const data = await response.json();
            await SecureStore.setItemAsync('molam_token', data.token);

            // Type correct pour setUser
            setUser({
                id: data.user.id,
                phone: data.user.phone,
                email: data.user.email,
                kyc_level: data.user.kyc_level,
                currency: data.user.currency,
                lang: data.user.lang
            });
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    };

    const logout = async () => {
        await SecureStore.deleteItemAsync('molam_token');
        setUser(undefined); // ou setUser(null) selon votre choix
    };

    return { user, login, logout };
}