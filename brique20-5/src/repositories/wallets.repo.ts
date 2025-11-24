import { prisma } from "../infra/db.js";

export async function findWalletByUserAndCurrency(userId: string, currency: string) {
    return prisma.molam_wallets.findUnique({
        where: {
            user_id_currency: {
                user_id: userId,
                currency
            }
        }
    });
}

export async function lockWallet(walletId: string) {
    const [row] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM molam_wallets WHERE id = $1 FOR UPDATE`,
        walletId
    );
    return row;
}

export async function updateWalletBalance(walletId: string, newBalanceCents: bigint) {
    return prisma.molam_wallets.update({
        where: { id: walletId },
        data: { balance_cents: newBalanceCents }
    });
}