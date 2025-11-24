// URL directe - plus simple et évite les problèmes de types
const API_BASE_URL = 'http://localhost:3000/api';

export const qrAPI = {
    parseQR: async (qrValue: string) => {
        const response = await fetch(`${API_BASE_URL}/pay/qr/static/parse`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ qr_value: qrValue })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
    },

    createPayment: async (qrValue: string, amount: number, currency: string) => {
        const response = await fetch(`${API_BASE_URL}/pay/qr/static/create-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ qr_value: qrValue, amount, currency })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
    },

    confirmPayment: async (paymentId: string) => {
        const response = await fetch(`${API_BASE_URL}/pay/qr/static/confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ payment_id: paymentId })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
    }
};