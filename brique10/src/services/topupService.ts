// src/services/topupService.ts
import { TopupTransactionModel } from '../models/TopupTransaction';
import { OperatorModel } from '../models/Operator';
import { ProductModel } from '../models/Product';
import { SiraService } from './siraService';
import { WalletService } from './walletService';
import { CreateTopupRequest, CreateTopupResponse } from '../types/topup';

export class TopupService {
    static getUserTopupHistory(userId: any, arg1: number, arg2: number) {
        throw new Error('Method not implemented.');
    }
    static getTransactionStatus(arg0: string, userId: any) {
        throw new Error('Method not implemented.');
    }
    static async createTopup(
        request: CreateTopupRequest,
        userId: string
    ): Promise<CreateTopupResponse> {
        // Vérifier l'opérateur
        const operator = await OperatorModel.findById(request.operator_id);
        if (!operator || operator.status !== 'active') {
            throw new Error('Operator not available');
        }

        // Vérifier le produit
        const product = await ProductModel.findById(request.product_id);
        if (!product || !product.is_active) {
            throw new Error('Product not available');
        }

        // Valider le numéro de téléphone
        if (!this.validatePhoneNumber(request.phone_number, operator.country_code)) {
            throw new Error('Invalid phone number format');
        }

        // Calculer le score SIRA
        const siraScore = await SiraService.calculateRiskScore(
            request.phone_number,
            product.amount,
            userId
        );

        if (siraScore > 70) {
            throw new Error('Transaction blocked by security system');
        }

        // Calculer les frais
        const fees = this.calculateFees(product.amount, operator.commission_rate);

        // Débiter le wallet
        await WalletService.debitUser(
            userId,
            product.amount,
            product.currency,
            `Top-up ${operator.name}`
        );

        // Créer la transaction
        const transaction = await TopupTransactionModel.create({
            user_id: userId,
            operator_id: request.operator_id,
            product_id: request.product_id,
            phone_number: request.phone_number,
            amount: product.amount,
            currency: product.currency,
            status: 'pending',
            sira_score: siraScore,
            fee_total: fees.molam + fees.partner,
            fee_breakdown: fees
        });

        // Appeler l'API de l'opérateur (asynchrone)
        this.processTopupAsync(transaction.id);

        return {
            transaction_id: transaction.id,
            status: 'pending',
            preview: {
                amount: `${product.amount} ${product.currency}`,
                fees: fees,
                total: `${product.amount} ${product.currency}`
            }
        };
    }

    private static validatePhoneNumber(phoneNumber: string, countryCode: string): boolean {
        // Validation basique E.164
        const e164Regex = /^\+[1-9]\d{1,14}$/;
        return e164Regex.test(phoneNumber);
    }

    private static calculateFees(amount: number, commissionRate: number) {
        const partnerFee = amount * (commissionRate / 100);
        return {
            molam: 0, // Gratuit pour l'utilisateur
            partner: partnerFee
        };
    }

    private static async processTopupAsync(transactionId: string): Promise<void> {
        // Implémentation de l'appel à l'API opérateur/agrégateur
        try {
            // Simuler l'appel API
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Dans la réalité, appeler DT One, Ding, etc.
            const success = Math.random() > 0.1; // 90% de succès simulé

            if (success) {
                await TopupTransactionModel.updateStatus(
                    transactionId,
                    'confirmed',
                    `PROV_${Date.now()}`
                );
            } else {
                await TopupTransactionModel.updateStatus(transactionId, 'failed');
                // Rembourser le wallet
            }
        } catch (error) {
            await TopupTransactionModel.updateStatus(transactionId, 'failed');
        }
    }

    static async cancelTopup(transactionId: string, userId: string): Promise<void> {
        const transaction = await TopupTransactionModel.findById(transactionId);

        if (!transaction || transaction.user_id !== userId) {
            throw new Error('Transaction not found');
        }

        if (transaction.status !== 'pending') {
            throw new Error('Cannot cancel non-pending transaction');
        }

        await TopupTransactionModel.updateStatus(transactionId, 'refunded');

        // Rembourser le wallet
        await WalletService.creditUser(
            userId,
            transaction.amount,
            transaction.currency,
            `Top-up cancellation ${transactionId}`
        );
    }
}