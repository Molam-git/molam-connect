export async function signApproval(userId: string, planId: string): Promise<string> {
    // HSM/Vault-backed implementation in production
    const data = `${userId}:${planId}:${Date.now()}`;

    // For development - use environment variable for signing key
    const signKey = process.env.SIGNING_KEY || 'dev-key';
    const crypto = await import('crypto');
    const signature = crypto.createHmac('sha256', signKey).update(data).digest('hex');

    return signature;
}