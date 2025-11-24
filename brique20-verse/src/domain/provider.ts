import https from 'https';
import fs from 'fs';
import { config } from '../config.js';

export type ProviderRequest = {
    payoutId: string;
    amount: string;
    currency: string;
    destination: any;
};

export async function sendPayout(req: ProviderRequest): Promise<{ providerRef: string }> {
    const agent = new https.Agent({
        cert: fs.readFileSync(config.security.providerMtlsCert),
        key: fs.readFileSync(config.security.providerMtlsKey),
        rejectUnauthorized: true
    });

    const providerRef = `PROV-${req.payoutId}`;
    return { providerRef };
}