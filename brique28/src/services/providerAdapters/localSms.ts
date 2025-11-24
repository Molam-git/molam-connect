// src/services/providerAdapters/localSms.ts
export async function sendLocalSms(providerConfig: any, to: string, body: string) {
    // Local provider may be synchronous and cheap; simulate network call
    await new Promise(r => setTimeout(r, 80)); // simulate latency 80ms
    // Random failure simulation removed in prod; here we always succeed
    return { success: true, raw: { messageId: "local-" + Date.now() } };
}