import { pool } from "../store/db";

export async function enrichAmounts(evt: any, targetCurrency: string) {
    if (!evt.amount || !evt.currency) {
        return {
            amount_local: evt.amount,
            amount_usd: evt.amount,
            amount_local_fmt: formatAmount(evt.amount, evt.currency),
            fee_molam_fmt: formatAmount(evt.fee_molam || 0, evt.currency)
        };
    }

    // Conversion vers USD
    const usdRate = await getExchangeRate(evt.currency, 'USD');
    const amountUsd = evt.amount * usdRate;

    // Conversion vers devise locale si différente
    let amountLocal = evt.amount;
    if (targetCurrency !== evt.currency) {
        const localRate = await getExchangeRate(evt.currency, targetCurrency);
        amountLocal = evt.amount * localRate;
    }

    return {
        amount_local: amountLocal,
        amount_usd: amountUsd,
        amount_local_fmt: formatAmount(amountLocal, targetCurrency),
        amount_usd_fmt: formatAmount(amountUsd, 'USD'),
        fee_molam_fmt: formatAmount(evt.fee_molam || 0, targetCurrency)
    };
}

async function getExchangeRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;

    const { rows } = await pool.query(
        `SELECT rate FROM fx_rates 
     WHERE base = $1 AND quote = $2 AND date = CURRENT_DATE
     ORDER BY created_at DESC LIMIT 1`,
        [from, to]
    );

    if (rows.length === 0) {
        // Fallback - en production, logger l'alerte
        return 1;
    }

    return parseFloat(rows[0].rate);
}

function formatAmount(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount);
}