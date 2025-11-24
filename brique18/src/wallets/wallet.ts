// src/wallets/wallet.ts
import { PoolClient } from "pg";

export async function creditWallet(
    client: PoolClient,
    userId: number,
    currency: string,
    amountMinor: number,
    metadata: any
): Promise<void> {
    // Implémentation simplifiée - à compléter avec la logique réelle des wallets
    await client.query(
        'UPDATE user_wallets SET balance_minor = balance_minor + $1 WHERE user_id = $2 AND currency = $3',
        [amountMinor, userId, currency]
    );
}

export async function debitWallet(
    client: PoolClient,
    userId: number,
    currency: string,
    amountMinor: number,
    metadata: any
): Promise<void> {
    // Implémentation simplifiée - à compléter avec la logique réelle des wallets
    await client.query(
        'UPDATE user_wallets SET balance_minor = balance_minor - $1 WHERE user_id = $2 AND currency = $3',
        [amountMinor, userId, currency]
    );
}

export async function getWalletByUser(
    client: PoolClient,
    userId: number,
    currency: string
): Promise<any> {
    const { rows } = await client.query(
        'SELECT * FROM user_wallets WHERE user_id = $1 AND currency = $2',
        [userId, currency]
    );
    return rows[0];
}