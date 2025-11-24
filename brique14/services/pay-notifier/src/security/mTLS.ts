// mTLS configuration for service-to-service communication
export const mTLSConfig = {
    // In production, certificates would be loaded from Vault
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    ca: process.env.MTLS_CA_CERT,
    cert: process.env.MTLS_CLIENT_CERT,
    key: process.env.MTLS_CLIENT_KEY
};