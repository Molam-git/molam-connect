export function computeAgentShare(tx: any, contract: any): number {
    const pct = Number(contract.agent_share_pct || 50);
    if (tx.type === "cashin_other" || tx.type === "merchant") {
        return ((Number(tx.fee_partner || 0)) * pct) / 100;
    }
    return 0;
}