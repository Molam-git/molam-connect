import { useState } from 'react';

interface Payout {
    id: string;
    reference_code: string;
    amount: number;
    currency: string;
    status: string;
    origin_module: string;
    requires_approval: boolean;
}

export const usePayouts = () => {
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPayouts = async (filters: { status: string; originModule: string }) => {
        setLoading(true);
        setError(null);

        try {
            const queryParams = new URLSearchParams();
            if (filters.status) queryParams.append('status', filters.status);
            if (filters.originModule) queryParams.append('origin_module', filters.originModule);

            const response = await fetch(`/api/treasury/payouts?${queryParams}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch payouts: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            setPayouts(data);
        } catch (err) {
            // Gestion sécurisée du type unknown
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred while fetching payouts';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const approvePayout = async (payoutId: string, decision: string, comments: string) => {
        setError(null);

        try {
            const response = await fetch(`/api/treasury/payouts/${payoutId}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}` // À adapter selon votre auth
                },
                body: JSON.stringify({ decision, comments })
            });

            if (!response.ok) {
                throw new Error(`Approval failed: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (err) {
            // Gestion sécurisée du type unknown
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred during approval';
            setError(errorMessage);
            throw err; // Re-lancer l'erreur pour que le composant puisse la gérer
        }
    };

    const createPayout = async (payoutData: any) => {
        setError(null);

        try {
            const response = await fetch('/api/treasury/payouts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Idempotency-Key': `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                },
                body: JSON.stringify(payoutData)
            });

            if (!response.ok) {
                throw new Error(`Payout creation failed: ${response.status} ${response.statusText}`);
            }

            const newPayout = await response.json();
            return newPayout;
        } catch (err) {
            // Gestion sécurisée du type unknown
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred during payout creation';
            setError(errorMessage);
            throw err;
        }
    };

    const cancelPayout = async (payoutId: string, reason: string) => {
        setError(null);

        try {
            const response = await fetch(`/api/treasury/payouts/${payoutId}/cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ reason })
            });

            if (!response.ok) {
                throw new Error(`Cancellation failed: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (err) {
            // Gestion sécurisée du type unknown
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred during cancellation';
            setError(errorMessage);
            throw err;
        }
    };

    const retryPayout = async (payoutId: string) => {
        setError(null);

        try {
            // Pour retry, on pourrait avoir un endpoint dédié ou simplement recréer le job
            const response = await fetch(`/api/treasury/payouts/${payoutId}/retry`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error(`Retry failed: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (err) {
            // Gestion sécurisée du type unknown
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred during retry';
            setError(errorMessage);
            throw err;
        }
    };

    const clearError = () => {
        setError(null);
    };

    return {
        payouts,
        loading,
        error,
        fetchPayouts,
        approvePayout,
        createPayout,
        cancelPayout,
        retryPayout,
        clearError
    };
};