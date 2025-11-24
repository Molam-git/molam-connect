// src/services/treasuryService.ts
import { db } from '../config';
import { Payout, BankProfile } from '../types/treasury';
import { siraIntegrationService } from './siraIntegrationService';
import { ledger } from '../config';

export class TreasuryService {
    async createPayout(
        idempotencyKey: string,
        payoutData: Partial<Payout>
    ): Promise<Payout> {
        // Vérifier l'idempotence
        const existing = await db.query(
            'SELECT * FROM payouts WHERE external_id = $1',
            [idempotencyKey]
        );

        if (existing.rows.length > 0) {
            return existing.rows[0];
        }

        // Calculer le routage via SIRA
        const routing = await siraIntegrationService.pickRouting(
            payoutData.currency!,
            payoutData.amount!
        );

        // Calculer les frais
        const molamFee = this.computeMolamFee(payoutData.origin_module!, payoutData.amount!);
        const bankFee = routing.bank_fee || 0;
        const totalDeducted = Number(payoutData.amount) + molamFee + bankFee;

        // Réserver dans le ledger
        await ledger.createHold({
            origin: payoutData.origin_entity_id!,
            amount: payoutData.amount!,
            currency: payoutData.currency!,
            reason: 'payout_pending',
            ref: idempotencyKey
        });

        // Générer reference_code
        const referenceCode = `PAYOUT-${new Date().toISOString().slice(0, 10)}-${this.generateShortId()}`;

        const result = await db.query(
            `INSERT INTO payouts 
       (external_id, origin_module, origin_entity_id, currency, amount, 
        bank_account, bank_profile_id, treasury_account_id, molam_fee, 
        bank_fee, total_deducted, reference_code) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING *`,
            [
                idempotencyKey,
                payoutData.origin_module,
                payoutData.origin_entity_id,
                payoutData.currency,
                payoutData.amount,
                JSON.stringify(payoutData.bank_account),
                routing.bank_profile_id,
                routing.treasury_account_id,
                molamFee,
                bankFee,
                totalDeducted,
                referenceCode
            ]
        );

        // Émettre l'événement
        await this.publishEvent('payout.created', result.rows[0]);

        return result.rows[0];
    }

    private computeMolamFee(module: string, amount: number): number {
        // Logique de calcul des frais Molam
        const feeRates = {
            'pay': 0.01,
            'shop': 0.015,
            'connect': 0.02
        };
        return amount * (feeRates[module as keyof typeof feeRates] || 0.01);
    }

    private generateShortId(): string {
        return Math.random().toString(36).substr(2, 9);
    }

    private async publishEvent(eventType: string, data: any) {
        // Implémentation de l'émission d'événements
    }
}