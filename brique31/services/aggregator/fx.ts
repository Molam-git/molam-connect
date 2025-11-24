import { pool } from "../db";

// Cache pour les taux de change
const fxRatesCache = new Map<string, { rate: number; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function convertToUSD(amount: number, fromCurrency: string, date?: Date): Promise<number> {
    if (fromCurrency === 'USD') return amount;

    const rateDate = date || new Date();
    const dateStr = rateDate.toISOString().split('T')[0];
    const cacheKey = `${fromCurrency}_USD_${dateStr}`;

    // Vérifier le cache
    const cached = fxRatesCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return amount * cached.rate;
    }

    // Récupérer depuis la base de données
    const { rows } = await pool.query(
        `SELECT rate FROM fx_rates 
     WHERE base_currency = $1 AND target_currency = 'USD' 
     AND date <= $2 
     ORDER BY date DESC LIMIT 1`,
        [fromCurrency, dateStr]
    );

    if (rows.length === 0) {
        console.warn(`Taux de change non trouvé pour ${fromCurrency} vers USD à la date ${dateStr}`);
        return amount; // Fallback: retourner le montant original
    }

    const rate = parseFloat(rows[0].rate);

    // Mettre en cache
    fxRatesCache.set(cacheKey, { rate, timestamp: Date.now() });

    return amount * rate;
}

// Fonction pour convertir entre deux devises arbitraires
export async function convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    date?: Date
): Promise<number> {
    if (fromCurrency === toCurrency) return amount;

    // Convertir d'abord en USD puis vers la devise cible
    const amountInUSD = await convertToUSD(amount, fromCurrency, date);

    if (toCurrency === 'USD') return amountInUSD;

    // Convertir de USD vers la devise cible
    const rateDate = date || new Date();
    const dateStr = rateDate.toISOString().split('T')[0];
    const cacheKey = `USD_${toCurrency}_${dateStr}`;

    // Vérifier le cache
    const cached = fxRatesCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return amountInUSD * cached.rate;
    }

    // Récupérer depuis la base de données
    const { rows } = await pool.query(
        `SELECT rate FROM fx_rates 
     WHERE base_currency = 'USD' AND target_currency = $1
     AND date <= $2 
     ORDER BY date DESC LIMIT 1`,
        [toCurrency, dateStr]
    );

    if (rows.length === 0) {
        console.warn(`Taux de change non trouvé pour USD vers ${toCurrency} à la date ${dateStr}`);
        return amountInUSD; // Fallback: retourner en USD
    }

    const rate = parseFloat(rows[0].rate);

    // Mettre en cache
    fxRatesCache.set(cacheKey, { rate, timestamp: Date.now() });

    return amountInUSD * rate;
}