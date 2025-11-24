import { Router } from "express";
import { verifyHmac } from "../shared/signature.js";
import { onTransactionCompleted, onTransactionRefunded } from "./webhookHandlers.js";

const w = Router();

w.post("/tx", verifyHmac(), async (req, res) => {
    const { type, data } = req.body;

    switch (type) {
        case "transaction.completed":
            await onTransactionCompleted(data);
            break;
        case "transaction.refunded":
        case "transaction.voided":
            await onTransactionRefunded(data);
            break;
        default:
        // ignore unknown
    }

    res.status(200).json({ received: true });
});

export default w;