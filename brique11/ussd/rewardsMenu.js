const rewardsMenu = {
    id: 'rewards_menu',
    text: `Molam Rewards
1. Voir solde
2. Convertir cashback
3. Utiliser voucher
4. Offres disponibles

0. Retour`,

    options: {
        '1': 'rewards_balance',
        '2': 'convert_cashback',
        '3': 'use_voucher',
        '4': 'available_rewards',
        '0': 'main_menu'
    },

    async rewardsBalance(ussdSession) {
        const userId = ussdSession.userId;

        try {
            const response = await fetch(`${process.env.API_URL}/api/pay/rewards/balance?user_id=${userId}`);
            const balance = await response.json();

            let message = `Vos recompenses:\n`;
            message += `Cashback: ${balance.cashback}\n`;
            message += `Points: ${balance.points}\n`;

            if (balance.vouchers.length > 0) {
                message += `Vouchers: ${balance.vouchers.length} actifs\n`;
            }

            message += `\n1. Convertir\n2. Retour\n0. Menu principal`;

            return {
                text: message,
                options: {
                    '1': 'convert_cashback',
                    '2': 'rewards_menu',
                    '0': 'main_menu'
                }
            };
        } catch (error) {
            return {
                text: `Erreur chargement recompenses. Reessayez plus tard.\n0. Menu principal`,
                options: { '0': 'main_menu' }
            };
        }
    },

    async convertCashback(ussdSession) {
        const userId = ussdSession.userId;

        try {
            const response = await fetch(`${process.env.API_URL}/api/pay/rewards/balance?user_id=${userId}`);
            const balance = await response.json();

            const cashbackAmount = parseFloat(balance.cashback.split(' ')[0]);

            if (cashbackAmount <= 0) {
                return {
                    text: `Solde cashback insuffisant.\n0. Menu principal`,
                    options: { '0': 'main_menu' }
                };
            }

            // Conversion automatique de tout le cashback disponible
            const convertResponse = await fetch(`${process.env.API_URL}/api/pay/rewards/convert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    reward_type: 'cashback',
                    amount: cashbackAmount,
                    target: 'wallet'
                })
            });

            const result = await convertResponse.json();

            if (result.status === 'converted') {
                return {
                    text: `Success! ${result.wallet_credit} credits added to your wallet.\n0. Menu principal`,
                    options: { '0': 'main_menu' }
                };
            } else {
                throw new Error('Conversion failed');
            }
        } catch (error) {
            return {
                text: `Erreur conversion. Reessayez plus tard.\n0. Menu principal`,
                options: { '0': 'main_menu' }
            };
        }
    },

    async useVoucher(ussdSession) {
        return {
            text: `Entrez le code voucher:\n0. Annuler`,
            next: 'process_voucher_code'
        };
    },

    async processVoucherCode(ussdSession, voucherCode) {
        const userId = ussdSession.userId;

        try {
            const response = await fetch(`${process.env.API_URL}/api/pay/rewards/voucher/use`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    voucher_code: voucherCode
                })
            });

            const result = await response.json();

            if (result.status === 'voucher_used') {
                return {
                    text: `Voucher utilise! ${result.voucher_value} added to your wallet.\n0. Menu principal`,
                    options: { '0': 'main_menu' }
                };
            } else {
                return {
                    text: `Voucher invalide ou deja utilise.\n0. Menu principal`,
                    options: { '0': 'main_menu' }
                };
            }
        } catch (error) {
            return {
                text: `Erreur utilisation voucher. Reessayez.\n0. Menu principal`,
                options: { '0': 'main_menu' }
            };
        }
    }
};

module.exports = rewardsMenu;