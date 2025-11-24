import { QuoteRequest, QuoteResponse } from '../contracts/banks.dto';
import { db } from '../utils/db';
import { siraScore } from '../utils/sira';

export async function selectBestRoute(req: QuoteRequest): Promise<QuoteResponse> {
    const rows = await db.any(`
    SELECT r.id as route_id, b.name, r.rail, r.currency, r.fee_fixed_bank, r.fee_percent_bank,
           r.fee_fixed_molam, r.fee_percent_molam, r.sla_seconds, r.success_rate_30d
    FROM partner_bank_routes r
    JOIN partner_banks b ON b.id = r.bank_id
    LEFT JOIN partner_bank_route_regions g ON g.route_id = r.id
    WHERE r.is_${req.direction}_enabled = TRUE
      AND (g.id IS NULL OR (g.from_country = $1 AND g.to_country = $2))
  `, [req.fromCountry, req.toCountry]);

    if (!rows.length) throw new Error('NO_ROUTE');

    // Score routes with SIRA (cost + SLA + success)
    const candidates = rows.map((r: any) => {
        const feeBank = r.fee_fixed_bank + (req.amount * r.fee_percent_bank);
        const feeMolam = r.fee_fixed_molam + (req.amount * r.fee_percent_molam);
        const feeTotal = feeBank + feeMolam;
        const eta = r.sla_seconds;
        const success = Number(r.success_rate_30d);
        const score = siraScore({ fee: feeTotal, eta, success });
        return { r, feeBank, feeMolam, feeTotal, score };
    });

    candidates.sort((a, b) => b.score - a.score);

    // Vérification que candidates n'est pas vide et que best est défini
    if (candidates.length === 0) {
        throw new Error('NO_VALID_ROUTE_FOUND');
    }
    const best = candidates[0];
    if (!best) {
        throw new Error('NO_VALID_ROUTE_FOUND');
    }

    const amountNet = req.direction === 'deposit'
        ? req.amount - best.feeTotal
        : req.amount + best.feeTotal; // cash-out: emitter pays fees

    return {
        routeId: best.r.route_id,
        bankName: best.r.name,
        rail: best.r.rail,
        currency: best.r.currency,
        amount: req.amount,
        feeBankFixed: best.r.fee_fixed_bank,
        feeBankPercent: best.r.fee_percent_bank,
        feeMolamFixed: best.r.fee_fixed_molam,
        feeMolamPercent: best.r.fee_percent_molam,
        feeTotal: Number(best.feeTotal.toFixed(2)),
        amountNet: Number(amountNet.toFixed(2)),
        etaSeconds: best.r.sla_seconds,
        breakdown: { bank: Number(best.feeBank.toFixed(2)), molam: Number(best.feeMolam.toFixed(2)) },
        policyNotes: ['Fees = bank + Molam', 'Emitter pays fees', '10% cheaper than market']
    };
}