import crypto from "crypto";
import { db } from "./db";

export async function signProviderCreate(provider: any, payload: any) {
    // In production, fetch secret from Vault using provider.config.credentials_ref
    const secret = await getProviderSecret(provider.id);
    const body = JSON.stringify(payload);
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    return { body: payload, signature: sig };
}

export const verifyWebhook = () => async (req: any, res: any, next: any) => {
    const providedSig = req.headers["x-provider-signature"];
    const name = req.params.providerName;

    try {
        const provider = await db.one(
            `SELECT * FROM molam_payment_providers WHERE name=$1`,
            [name]
        );

        const secret = await getProviderSecret(provider.id);
        const calcSig = crypto
            .createHmac("sha256", secret)
            .update(JSON.stringify(req.body))
            .digest("hex");

        if (providedSig !== calcSig) {
            return res.status(401).json({ error: "Invalid signature" });
        }

        next();
    } catch (error) {
        return res.status(401).json({ error: "Provider not found" });
    }
};

async function getProviderSecret(providerId: string): Promise<string> {
    // Implementation to fetch secret from Vault
    // This is a placeholder - use your actual secrets management
    return "prov_secret_ref_from_vault";
}