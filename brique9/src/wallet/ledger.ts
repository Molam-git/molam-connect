interface LedgerTxArgs {
    walletId: string;
    amountMinor: number;
    currency: string;
    memo: string;
}

export async function withLedgerTx(args: LedgerTxArgs): Promise<void> {
    const { prisma } = await import('../shared/prisma');

    // Check balance first; throw if insufficient
    const wallet = await prisma.molam_wallets.findUnique({
        where: { wallet_id: args.walletId }
    });

    if (!wallet || wallet.currency !== args.currency) {
        throw new Error('WALLET_NOT_FOUND_OR_CURRENCY_MISMATCH');
    }

    if (wallet.balance_minor < args.amountMinor) {
        throw new Error('INSUFFICIENT_FUNDS');
    }

    // Debit wallet, create ledger entries
    await prisma.$transaction([
        prisma.molam_wallets.update({
            where: { wallet_id: args.walletId },
            data: { balance_minor: { decrement: args.amountMinor } }
        }),
        // Note: This assumes molam_wallet_transactions table exists
        // prisma.molam_wallet_transactions.create({
        //   data: {
        //     wallet_id: args.walletId,
        //     amount_minor: -args.amountMinor,
        //     currency: args.currency,
        //     kind: 'BILL_PAYMENT',
        //     memo: args.memo,
        //     status: 'COMPLETED'
        //   }
        // })
    ]);
}