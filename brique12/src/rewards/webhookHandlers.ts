import { attributeRewardFromTx, clawbackForRefund } from "./service.js";

export async function onTransactionCompleted(data: any) {
    await attributeRewardFromTx({
        id: data.id,
        user_id: data.user_id,
        amount: Number(data.amount),
        currency: data.currency,
        country_code: data.country_code,
        channel: data.channel,
        merchant_id: data.merchant_id ?? null,
        mcc: data.mcc ?? null,
        is_fee_free: data.is_fee_free === true
    });
}

export async function onTransactionRefunded(data: any) {
    const proportion = Number(data.refunded_amount) / Number(data.original_amount);
    await clawbackForRefund(data.id, Math.max(0, Math.min(1, proportion)));
}