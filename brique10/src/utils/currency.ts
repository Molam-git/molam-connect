// src/utils/currency.ts
// Taux de change fictifs - en production utiliser une API de taux de change
const exchangeRates: { [key: string]: number } = {
    'USD:EUR': 0.85,
    'USD:XOF': 600,
    'EUR:USD': 1.18,
    'EUR:XOF': 655,
    'XOF:USD': 0.00167,
    'XOF:EUR': 0.00153,
};

export class CurrencyService {
    static async convert(
        amount: number,
        fromCurrency: string,
        toCurrency: string
    ): Promise<{ amount: number; rate: number }> {
        if (fromCurrency === toCurrency) {
            return { amount, rate: 1 };
        }

        const rateKey = `${fromCurrency}:${toCurrency}`;
        const reverseRateKey = `${toCurrency}:${fromCurrency}`;

        let rate = exchangeRates[rateKey];

        if (!rate && exchangeRates[reverseRateKey]) {
            // Calculer le taux inverse
            rate = 1 / exchangeRates[reverseRateKey];
        }

        if (!rate) {
            throw new Error(`Exchange rate not available for ${fromCurrency} to ${toCurrency}`);
        }

        const convertedAmount = amount * rate;

        return {
            amount: Math.round(convertedAmount * 100) / 100, // Arrondir à 2 décimales
            rate
        };
    }

    static format(amount: number, currency: string, locale: string = 'fr-FR'): string {
        const formatter = new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        return formatter.format(amount);
    }

    static validateCurrency(currency: string): boolean {
        const validCurrencies = ['USD', 'EUR', 'XOF', 'XAF', 'NGN', 'GHS'];
        return validCurrencies.includes(currency.toUpperCase());
    }

    static getCurrencySymbol(currency: string): string {
        const symbols: { [key: string]: string } = {
            'USD': '$',
            'EUR': '€',
            'XOF': 'CFA',
            'XAF': 'FCFA',
            'NGN': '₦',
            'GHS': 'GH₵'
        };

        return symbols[currency] || currency;
    }
}