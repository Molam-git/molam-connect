export function computeFees(originModule: string, amount: number, bankFee: number = 0) {
    // Règles de calcul des frais Molam en fonction du module d'origine
    let molamFee = 0;

    switch (originModule) {
        case 'shop':
            molamFee = amount * 0.01; // 1% pour les marchands
            break;
        case 'agent':
            molamFee = amount * 0.005; // 0.5% pour les agents
            break;
        case 'user':
            molamFee = amount * 0.02; // 2% pour les utilisateurs
            break;
        default:
            molamFee = amount * 0.01;
    }

    // Arrondir à 2 décimales
    molamFee = Math.round(molamFee * 100) / 100;

    const totalDeducted = Number(amount) + Number(molamFee) + Number(bankFee);

    return { molamFee, bankFee, totalDeducted };
}