// src/sira/service.ts
export async function siraEvaluateWithdrawal(input: {
    user_id: string; wallet_id: string; amount: number; currency: string;
    channel: string; country_code: string; device?: any;
}): Promise<{ decision: "allow" | "review" | "block"; reason?: string }> {
    // Example policy: large bank withdrawals or unusual hour -> review
    if (input.channel === "bank" && input.amount > 10000) return { decision: "review", reason: "High value bank withdrawal" };
    if (input.amount > 50000) return { decision: "block", reason: "Exceeds safety threshold" };
    return { decision: "allow" };
}