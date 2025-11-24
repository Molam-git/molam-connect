import { consume } from "../utils/kafka";

async function createRefund(correlationId: string, amount: number, reason: string) {
    console.log(`Creating refund for ${correlationId}, amount: ${amount}, reason: ${reason}`);
}

async function createHold(correlationId: string, amount: number) {
    console.log(`Creating hold for ${correlationId}, amount: ${amount}`);
}

async function notifyOps(correlationId: string, reason: string) {
    console.log(`Notifying OPS for ${correlationId}, reason: ${reason}`);
}

consume("fraud_actions", async (msg: any) => {
    const payload = JSON.parse(msg.value.toString());

    if (payload.action.action === "auto_refund" && payload.amount <= 50) {
        await createRefund(payload.correlation_id, payload.amount, "auto_refund_sira");
    } else if (payload.action.action === "hold") {
        await createHold(payload.correlation_id, payload.amount);
        await notifyOps(payload.correlation_id, payload.action.reason);
    }
});