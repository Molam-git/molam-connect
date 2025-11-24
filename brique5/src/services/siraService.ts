export const siraEvaluateTransfer = async (params: {
    sender_id: string;
    receiver_id: string;
    amount: number;
    currency: string;
    device?: any;
}): Promise<any> => {
    // Implémentation simplifiée pour avancer
    return {
        decision: 'allow',
        risk_score: 30,
        reasons: [],
        rules_triggered: []
    };
};