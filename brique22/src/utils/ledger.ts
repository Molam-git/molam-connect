export async function postLedger(_tx: any, params: {
    walletId: number;
    currency: string;
    amount: number;
    type: string;
    meta: any;
}) {
    // Implémentation réelle pour le ledger double-entrée
    console.log('Posting to ledger:', params);
}