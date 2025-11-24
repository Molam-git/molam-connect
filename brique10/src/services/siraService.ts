// src/services/siraService.ts
export class SiraService {
    static async calculateRiskScore(
        phoneNumber: string,
        amount: number,
        userId: string
    ): Promise<number> {
        // Implémentation simplifiée du scoring de risque
        let score = 0;

        // Vérifier le format du numéro
        if (!this.isValidE164(phoneNumber)) {
            score += 30;
        }

        // Vérifier les transactions récentes (simulé)
        const recentTransactions = await this.getRecentUserTransactions(userId);
        if (recentTransactions > 5) {
            score += 20;
        }

        // Vérifier les montants atypiques
        if (amount > 100000) { // 100,000 XOF
            score += 25;
        }

        return Math.min(score, 100);
    }

    private static isValidE164(phoneNumber: string): boolean {
        return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
    }

    private static async getRecentUserTransactions(userId: string): Promise<number> {
        // Implémentation réelle irait en base de données
        return 0; // Simulé
    }

    static async getRecommendations(userId: string): Promise<any> {
        // Retourne les recommandations personnalisées
        return {
            recentNumbers: ['+221771234567', '+221761234567'],
            favoriteProducts: ['CREDIT_1000', 'CREDIT_5000']
        };
    }
}