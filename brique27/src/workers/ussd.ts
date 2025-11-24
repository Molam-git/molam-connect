import { BaseWorker } from "./base-worker";

export class UssdWorker extends BaseWorker {
    protected channel = 'ussd';
    protected provider = 'ussd_gateway';

    protected async sendMessage(job: any): Promise<{ id: string }> {
        const phone = job.payload.ctx?.phone;
        if (!phone) {
            throw new Error('No phone available');
        }

        // Simuler l'envoi USSD
        return { id: `ussd_${Date.now()}` };
    }
}

export function runUssdWorker() {
    const worker = new UssdWorker();
    return worker.run();
}