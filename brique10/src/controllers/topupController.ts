// src/controllers/topupController.ts
import { Request, Response } from 'express';
import { TopupService } from '../services/topupService';
import { SiraService } from '../services/siraService';
import { OperatorService } from '../services/operatorService';
import { ProductService } from '../services/productService';

export const getOperators = async (req: Request, res: Response) => {
    try {
        const { country_code } = req.query;

        if (!country_code) {
            return res.status(400).json({
                success: false,
                error: 'country_code parameter is required'
            });
        }

        const operators = await OperatorService.getOperatorsByCountry(country_code as string);

        res.json({
            success: true,
            data: operators
        });
    } catch (error: any) {
        console.error('Error fetching operators:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch operators'
        });
    }
};

export const getProducts = async (req: Request, res: Response) => {
    try {
        const { operator_id } = req.query;

        if (!operator_id) {
            return res.status(400).json({
                success: false,
                error: 'operator_id parameter is required'
            });
        }

        const products = await ProductService.getProductsByOperator(operator_id as string);

        res.json({
            success: true,
            data: products
        });
    } catch (error: any) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products'
        });
    }
};

export const createTopup = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id; // À partir du middleware d'authentification

        const { operator_id, product_id, phone_number, currency } = req.body;

        // Validation des champs requis
        if (!operator_id || !product_id || !phone_number || !currency) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: operator_id, product_id, phone_number, currency'
            });
        }

        const result = await TopupService.createTopup(
            { operator_id, product_id, phone_number, currency },
            userId
        );

        res.json({
            success: true,
            data: result
        });
    } catch (error: any) {
        console.error('Error creating topup:', error);

        const statusCode = error.message.includes('not available') ||
            error.message.includes('Invalid') ||
            error.message.includes('blocked') ? 400 : 500;

        res.status(statusCode).json({
            success: false,
            error: error.message
        });
    }
};

export const cancelTopup = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { transaction_id } = req.body;

        if (!transaction_id) {
            return res.status(400).json({
                success: false,
                error: 'transaction_id is required'
            });
        }

        await TopupService.cancelTopup(transaction_id, userId);

        res.json({
            success: true,
            status: 'cancelled',
            message: 'Top-up transaction cancelled successfully'
        });
    } catch (error: any) {
        console.error('Error cancelling topup:', error);

        const statusCode = error.message.includes('not found') ||
            error.message.includes('Cannot cancel') ? 400 : 500;

        res.status(statusCode).json({
            success: false,
            error: error.message
        });
    }
};

export const getTransactionStatus = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { transaction_id } = req.query;

        if (!transaction_id) {
            return res.status(400).json({
                success: false,
                error: 'transaction_id parameter is required'
            });
        }

        // Implémentation de la récupération du statut
        // (à ajouter dans TopupService)
        const transaction = await TopupService.getTransactionStatus(
            transaction_id as string,
            userId
        );

        res.json({
            success: true,
            data: transaction
        });
    } catch (error: any) {
        console.error('Error fetching transaction status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

export const getRecommendations = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        const recommendations = await SiraService.getRecommendations(userId);

        res.json({
            success: true,
            data: recommendations
        });
    } catch (error: any) {
        console.error('Error fetching recommendations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch recommendations'
        });
    }
};

export const getTopupHistory = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { page = 1, limit = 10 } = req.query;

        const history = await TopupService.getUserTopupHistory(
            userId,
            parseInt(page as string),
            parseInt(limit as string)
        );

        res.json({
            success: true,
            data: history
        });
    } catch (error: any) {
        console.error('Error fetching topup history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch topup history'
        });
    }
};

// Fonction USSD pour le top-up
export const ussdTopupHandler = async (req: Request, res: Response) => {
    try {
        const { sessionId, phoneNumber, serviceCode, text } = req.body;

        let response = '';

        if (!text) {
            // Menu principal USSD
            response = `CON Molam Top-up
1. Orange
2. Free
3. Expresso
4. MTN
0. Quitter`;
        } else {
            const steps = text.split('*');

            if (steps.length === 1) {
                // Sélection de l'opérateur
                const operatorChoice = steps[0];
                const operators = ['Orange', 'Free', 'Expresso', 'MTN'];

                if (operatorChoice >= '1' && operatorChoice <= '4') {
                    response = `CON Recharge ${operators[parseInt(operatorChoice) - 1]}
1. 1000 XOF
2. 2000 XOF
3. 5000 XOF
4. 10000 XOF
0. Retour`;
                } else {
                    response = 'END Choix invalide';
                }
            } else if (steps.length === 2) {
                // Sélection du montant
                const operatorChoice = steps[0];
                const amountChoice = steps[1];

                const amounts = [1000, 2000, 5000, 10000];

                if (amountChoice >= '1' && amountChoice <= '4') {
                    const amount = amounts[parseInt(amountChoice) - 1];
                    response = `CON Confirmer recharge ${amount} XOF?
1. Confirmer
2. Annuler`;
                } else {
                    response = 'END Montant invalide';
                }
            } else if (steps.length === 3) {
                // Confirmation
                const confirmChoice = steps[2];

                if (confirmChoice === '1') {
                    // Traitement de la recharge
                    response = 'END Recharge en cours. Vous recevrez un SMS de confirmation.';
                } else {
                    response = 'END Recharge annulée';
                }
            }
        }

        res.set('Content-Type', 'text/plain');
        res.send(response);
    } catch (error: any) {
        console.error('USSD topup error:', error);
        res.set('Content-Type', 'text/plain');
        res.send('END Erreur système. Veuillez réessayer.');
    }
};