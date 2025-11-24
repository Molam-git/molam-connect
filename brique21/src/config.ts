export const config = {
    db: { connection: process.env.DATABASE_URL! },
    exports: {
        dir: process.env.EXPORT_DIR || "/data/exports"
    },
    signature: {
        algo: process.env.SIGN_ALGO || "ED25519",
        ed25519PrivateKeyPem: process.env.ED25519_PRIV_PEM || "",
        hmacSecret: process.env.EXPORT_HMAC_SECRET || ""
    }
};